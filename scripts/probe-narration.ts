import {existsSync} from 'node:fs';
import {chmod, mkdir, readFile, writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {GoogleVoiceConfig, NarrationFailure, VoiceFailure} from '../packages/contracts/src/index';
import {DEFAULT_SCRIPT_MODEL, openaiScripts} from '../packages/narration/src/index';
import {googleServiceAccountAccess, googleTts} from '../packages/voice/src/index';
import {prepareJobNarration, readNarrationAudio, type NarrationProviders} from '../apps/pipeline/src/narration';
import {fixturePlan, fixtureScriptMetrics} from '../fixtures/narration';
import {toneFixture} from '../fixtures/voice';
import {migrateNarrationProbe, seedNarrationFixture} from './narration-fixtures';
import {narrationPreview} from './narration-preview';
import {narrationProbeRuntime} from './narration-probe-runtime';

async function main() {
  const mode = process.argv[2] ?? '--mock';
  if (!['--mock','--real','--replay','--check'].includes(mode) || process.argv.length > 3) throw new NarrationFailure('SCRIPT_CONFIG_INVALID');
  if (existsSync('.env.voice')) process.loadEnvFile('.env.voice');
  if (existsSync('.env.script')) process.loadEnvFile('.env.script');
  const mock = mode === '--mock';
  const config = GoogleVoiceConfig.parse({projectId: mock ? 'bienvu-fixture' : process.env.GOOGLE_CLOUD_PROJECT,
    voice: process.env.GOOGLE_TTS_VOICE || undefined});
  let access: () => Promise<string>;
  if (mock) access = async () => 'fixture-token-not-sent-to-google';
  else {
    const json = await readFile(resolve(process.env.GOOGLE_APPLICATION_CREDENTIALS || '.secrets/google-tts.json'), 'utf8');
    if (json.length > 16_384) throw new NarrationFailure('SCRIPT_CONFIG_INVALID');
    access = await googleServiceAccountAccess(JSON.parse(json), config.projectId);
  }
  const scriptProvider = mock ? {model: DEFAULT_SCRIPT_MODEL, plan: async (context: Parameters<typeof fixturePlan>[0]) => ({plan: fixturePlan(context), metrics: fixtureScriptMetrics()})}
    : openaiScripts(process.env.OPENAI_API_KEY ?? '', process.env.SCRIPT_MODEL || DEFAULT_SCRIPT_MODEL);
  if (mode === '--check') {console.log(JSON.stringify({configuration:'valid',networkRequests:0,model:scriptProvider.model,voice:config.voice}));return;}
  const month = new Date().toISOString().slice(0,7), baseline = Number(process.env.SCRIPT_PROBE_OTHER_PROVISIONS_CENTS);
  if (mode === '--real' && (process.env.SCRIPT_PROBE_BUDGET_MONTH !== month || !/^\d+$/.test(process.env.SCRIPT_PROBE_OTHER_PROVISIONS_CENTS ?? '')
    || !Number.isSafeInteger(baseline) || baseline < 0 || baseline + 70 > 2500)) throw new NarrationFailure('NARRATION_BUDGET_LIMIT');
  const directory = resolve(`evidence/local/sprint-05/narration-probe/${mock ? 'mock' : 'real'}`);
  await mkdir(directory,{recursive:true,mode:0o700}); await chmod(directory,0o700);
  const mf = narrationProbeRuntime(directory);
  try {
    const env = await mf.getBindings<{DB:D1Database;MEDIA:R2Bucket}>();
    await migrateNarrationProbe(env.DB);
    // Un rapport sans son journal persistant exige un rapprochement opérateur,
    // jamais une nouvelle dépense automatique après perte du stockage local.
    const stored = await env.DB.prepare('SELECT state FROM narration_runs WHERE job_id=?').bind(mock?'job-mock':'job-real').first();
    if ((!mock && existsSync(`${directory}/report.json`) && !stored) || (mode === '--replay' && !stored))
      throw new NarrationFailure('NARRATION_REVIEW_REQUIRED');
    if (mode === '--real') await env.DB.prepare('INSERT INTO narration_budget(month,envelope_cents,paused) VALUES(?,70,0) ON CONFLICT(month) DO NOTHING').bind(month).run();
    const scope = await seedNarrationFixture(env.DB, mock ? 'mock' : 'real');
    const google = googleTts(config,access,mock ? {fetch:async()=>Response.json({audioContent:Buffer.from(toneFixture(5000)).toString('base64')})} : {});
    const calls = {script:0,voice:0};
    const providers: NarrationProviders = {mode:mock?'mock':'real',script:{model:scriptProvider.model,plan:async(context,correction)=>{
      if (mode === '--replay') throw new NarrationFailure('NARRATION_REVIEW_REQUIRED');
      calls.script++;return scriptProvider.plan(context,correction);
    }},voice:{config,synthesize:async text=>{
      if (mode === '--replay') throw new NarrationFailure('NARRATION_REVIEW_REQUIRED');
      calls.voice++;return google.synthesize(text);
    }}};
    const result = await prepareJobNarration(env,scope.agencyId,scope.jobId,providers);
    const audioFiles: string[] = [];
    for (const [index,asset] of result.audio.entries()) {
      const file = `${directory}/scene-${index+1}.wav`;
      await writeFile(file,await readNarrationAudio(env.MEDIA,scope,asset),{mode:0o600});audioFiles.push(file);
    }
    const previewFile=`${directory}/narration.wav`;
    await writeFile(previewFile,narrationPreview(await Promise.all(audioFiles.map(file=>readFile(file))),result.durationFrames),{mode:0o600});
    const costs = await env.DB.prepare(`SELECT count(*) calls,sum(reservation_cents) reservedCents,json_group_array(json_object('provider',provider,'state',state,'report',json(result_json))) reports
      FROM narration_calls WHERE agency_id=? AND job_id=?`).bind(scope.agencyId,scope.jobId).first();
    const report = {at:new Date().toISOString(),mode,providerMock:mock,listing:'synthetic_fixture',runtime:'Node with local workerd D1/R2',
      humanListening:mock?'not_applicable_mock':'pending_generated_script',callsThisRun:calls,costs,audioFiles,previewFile,result};
    await writeFile(`${directory}/report.json`,JSON.stringify(report,null,2),{mode:0o600});
    await writeFile(`${directory}/script.txt`,result.script.scenes.map((scene,index)=>`${index+1}. ${scene.narrationText}\nAffiché : ${scene.captionText}`).join('\n\n')+'\n',{mode:0o600});
    console.log(JSON.stringify({mode,providerMock:mock,callsThisRun:calls,scenes:result.script.scenes.length,
      durationFrames:result.durationFrames.reduce((a,b)=>a+b,0),scriptVersion:result.script.version,reportFile:`${directory}/report.json`,previewFile,audioFiles}));
  } finally {await mf.dispose();}
}
main().catch(error=>{console.error(JSON.stringify({error:error instanceof NarrationFailure||error instanceof VoiceFailure?error.code:'NARRATION_CONFIG_OR_PROBE_FAILED',help:'Voir docs/NARRATION.md ; ne jamais coller de clé dans la conversation.'}));process.exitCode=1;});
