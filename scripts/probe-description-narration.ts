// Isolated D1/R2 probe. Real API calls require a previously recorded provision
// in the global monthly budget; reruns reuse the durable call journal.
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {GoogleVoiceConfig,NarrationFailure,PreparedNarration} from '../packages/contracts/src/index';
import {admitGeneration,findNarration} from '../packages/db/src/index';
import {DEFAULT_SCRIPT_MODEL,openaiScripts,wordCount,narrationWordLimit,scriptContext,validateScript,type ScriptProvider} from '../packages/narration/src/index';
import {googleServiceAccountAccess,googleTts} from '../packages/voice/src/index';
import {prepareJobNarration,readNarrationAudio} from '../apps/pipeline/src/narration';
import {fixturePlan,fixtureScriptMetrics,narrationListing} from '../fixtures/narration';
import {propertyDescription} from '../fixtures/listing-description';
import {toneFixture} from '../fixtures/voice';
import {migrateNarrationProbe,seedNarrationFixture} from './narration-fixtures';
import {narrationProbeRuntime} from './narration-probe-runtime';
import {narrationPreview} from './narration-preview';

async function main(){
  const mode=process.argv[2]??'--mock';assert.ok(['--mock','--real','--replay'].includes(mode));
  const real=mode!=='--mock',directory=resolve(`evidence/local/narration-description/${real?'real':'mock-v3'}`);
  await mkdir(directory,{recursive:true,mode:0o700});
  if(real){
    const provision=JSON.parse(await readFile(resolve('evidence/local/narration-description/reservation.json'),'utf8'));
    assert.equal(provision.amountCents,150);assert.equal(provision.reserved[0].month,new Date().toISOString().slice(0,7));
    const repair=JSON.parse(await readFile(resolve('evidence/local/narration-description/repair-reservation.json'),'utf8'));
    assert.equal(repair.amountCents,70);assert.equal(repair.reserved[0].month,new Date().toISOString().slice(0,7));
    if(existsSync('.env.voice'))process.loadEnvFile('.env.voice');
    if(existsSync('.env.script'))process.loadEnvFile('.env.script');
  }
  const config=GoogleVoiceConfig.parse({projectId:real?process.env.GOOGLE_CLOUD_PROJECT:'fixture-description'});
  const access=real?await googleServiceAccountAccess(JSON.parse(await readFile(resolve(process.env.GOOGLE_APPLICATION_CREDENTIALS||'.secrets/google-tts.json'),'utf8')),config.projectId)
    :async()=> 'fixture-token-never-sent';
  const tts=googleTts(config,access,real?{}:{fetch:async()=>Response.json({audioContent:Buffer.from(toneFixture(1500)).toString('base64')})});
  const openai:ScriptProvider=real?openaiScripts(process.env.OPENAI_API_KEY??'',process.env.SCRIPT_MODEL||DEFAULT_SCRIPT_MODEL):{model:DEFAULT_SCRIPT_MODEL,plan:async(context:Parameters<typeof fixturePlan>[0])=>({plan:fixturePlan(context),metrics:fixtureScriptMetrics()})};
  const mf=narrationProbeRuntime(directory),report=[];
  try{
    const env=await mf.getBindings<{DB:D1Database;MEDIA:R2Bucket}>();await migrateNarrationProbe(env.DB);
    const month=new Date().toISOString().slice(0,7);
    if(real)await env.DB.prepare('INSERT INTO narration_budget(month,envelope_cents,paused) VALUES(?,140,0) ON CONFLICT(month) DO NOTHING').bind(month).run();
    if(real)await env.DB.prepare('UPDATE narration_budget SET envelope_cents=210 WHERE month=? AND envelope_cents=140 AND paused=0').bind(month).run();
    await env.DB.prepare('INSERT INTO hosted_import_budget(month,baseline_cents,ceiling_cents,paused) VALUES(?,0,9000,0) ON CONFLICT(month) DO NOTHING').bind(month).run();
    await env.DB.exec('UPDATE generation_control SET enabled=1');
    // A saved narration can outlive a failed preview/export in this isolated
    // recipe. Close only its known fixture job before admitting another one;
    // keep narration, call journal, objects and reservations for replay.
    await env.DB.exec("UPDATE jobs SET status='failed',error_code='FIXTURE_FINISHED',lease_until=NULL WHERE status NOT IN ('ready','failed') AND id IN (SELECT job_id FROM narration_runs WHERE state='prepared' AND agency_id IN ('s05-description-20','s05-description-v3-20','s05-description-40'))");
    for(const durationSeconds of [20,40] as const){
      if(durationSeconds===20){
        for(const agency of ['s05-description-20','s05-description-v2-20']){
          const failed=await env.DB.prepare("SELECT job_id FROM narration_runs WHERE agency_id=? AND state='failed'").bind(agency).first<{job_id:string}>();
          if(failed)await env.DB.prepare("UPDATE jobs SET status='failed',error_code='FIXTURE_REJECTED',lease_until=NULL WHERE id=?").bind(failed.job_id).run();
        }
      }
      const label=durationSeconds===20?'description-v3-20':'description-40',scope=await seedNarrationFixture(env.DB,label,true);
      let admission=await env.DB.prepare('SELECT job_id AS jobId FROM generation_runs WHERE agency_id=?').bind(scope.agencyId).first<{jobId:string}>();
      if(!admission){
        if(mode==='--replay'||existsSync(`${directory}/report-${durationSeconds}.json`))throw new NarrationFailure('NARRATION_REVIEW_REQUIRED');
        const listing=narrationListing(true);listing.id=`listing-${label}`;listing.agencyId=scope.agencyId;
        listing.facts.locality={status:'user_provided',value:'Lyon 9',unit:'text',sourcePath:'manual.locality',rawEvidence:'Lyon 9'};
        listing.facts.area={status:'user_provided',value:65.95,unit:'m2',sourcePath:'manual.area',rawEvidence:'65,95 m²'};
        listing.facts.price={status:'user_provided',value:{amountCents:22900000,currency:'EUR',period:'total',charges:'not_applicable'},unit:'EUR_cent',sourcePath:'manual.price',rawEvidence:'229 000 €'};
        listing.description={text:propertyDescription,sourcePath:'manual.description',truncated:false};
        for(const p of listing.photos){p.agencyId=scope.agencyId;p.listingId=listing.id;p.objectKey=`agencies/${scope.agencyId}/imports/${listing.id}/${p.id}.png`;}
        await env.DB.prepare('UPDATE listing_imports SET result_json=? WHERE id=?').bind(JSON.stringify(listing),listing.id).run();
        await env.DB.prepare("UPDATE jobs SET status='failed',error_code='FIXTURE',lease_until=NULL WHERE id=?").bind(scope.jobId).run();
        await env.DB.prepare('INSERT INTO generation_access VALUES(?,?,1)').bind(scope.agencyId,`allocation-${label}`).run();
        admission=await admitGeneration(env.DB,scope.agencyId,`description-probe-${durationSeconds}`,{listingId:listing.id,durationSeconds},'true');
        await env.DB.prepare("UPDATE jobs SET status='scripting',stage='scripting',listing_id=? WHERE id=?").bind(listing.id,admission.jobId).run();
      }else if(!(await findNarration(env.DB,scope.agencyId,admission.jobId))&&existsSync(`${directory}/report-${durationSeconds}.json`))throw new NarrationFailure('NARRATION_REVIEW_REQUIRED');
      const calls={script:0,voice:0};
      const providers={mode:real?'real' as const:'mock' as const,script:{model:openai.model,plan:async(context:Parameters<typeof fixturePlan>[0],correction:boolean)=>{
        if(mode==='--replay')throw new NarrationFailure('NARRATION_REVIEW_REQUIRED');calls.script++;return openai.plan(context,correction);}},voice:{config,synthesize:async(text:string)=>{
        if(mode==='--replay')throw new NarrationFailure('NARRATION_REVIEW_REQUIRED');calls.voice++;return tts.synthesize(text);}}};
      const stored=await findNarration(env.DB,scope.agencyId,admission.jobId);
      if(stored?.state==='failed')throw new NarrationFailure('NARRATION_REVIEW_REQUIRED');
      const prepared=stored?.state==='prepared'?PreparedNarration.parse(JSON.parse(stored.result!))
        :await prepareJobNarration(env,scope.agencyId,admission.jobId,providers);
      if(stored?.state==='prepared'){
        const snapshot=JSON.parse(stored.snapshot),context=await scriptContext(snapshot.listing,snapshot.brand,snapshot.contact,snapshot.copyVersion,snapshot.customNarration,durationSeconds);
        validateScript(context,prepared.script);
      }
      const words=wordCount(prepared.script.scenes.map(s=>s.narrationText).join(' '));
      assert.ok(words<=narrationWordLimit(durationSeconds));assert.equal(prepared.durationFrames.reduce((n,f)=>n+f,0),durationSeconds*30);
      const files=[];for(const [index,asset] of prepared.audio.entries()){
        const bytes=await readNarrationAudio(env.MEDIA,{agencyId:scope.agencyId,jobId:admission.jobId},asset);files.push(bytes);
        await writeFile(`${directory}/${durationSeconds}-scene-${index+1}.wav`,bytes,{mode:0o600});
      }
      const previewFile=`${directory}/narration-${durationSeconds}.wav`;
      await writeFile(previewFile,narrationPreview(files,prepared.durationFrames),{mode:0o600});
      const costs=await env.DB.prepare('SELECT provider,state,reservation_cents,result_json FROM narration_calls WHERE job_id=? ORDER BY created_at,id').bind(admission.jobId).all();
      const result={at:new Date().toISOString(),listing:'user_supplied_description_with_synthetic_ids',mode,providerMock:!real,humanListening:'pending',
        runtime:'Node + local workerd D1/R2',durationSeconds,words,spokenDurationMs:prepared.audio.reduce((n,a)=>n+a.durationMs,0),callsThisRun:calls,costs,prepared,previewFile};
      await writeFile(`${directory}/report-${durationSeconds}.json`,JSON.stringify(result,null,2),{mode:0o600});report.push(result);
      // Exclude this completed recipe from the one-active-job admission guard.
      await env.DB.prepare("UPDATE jobs SET status='failed',error_code='FIXTURE_FINISHED',lease_until=NULL WHERE id=?").bind(admission.jobId).run();
      console.log(JSON.stringify({durationSeconds,words,spokenDurationMs:result.spokenDurationMs,callsThisRun:calls,previewFile}));
    }
    await writeFile(`${directory}/report.json`,JSON.stringify(report,null,2),{mode:0o600});
  }finally{await mf.dispose();}
}
main().catch(error=>{console.error(JSON.stringify({error:error instanceof NarrationFailure?error.code:error instanceof Error?error.name:'PROBE_FAILED',help:'Les détails privés sont conservés localement ; ne pas relancer un appel payé incertain.'}));process.exitCode=1;});
