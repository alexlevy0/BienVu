import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {migrateNarrationProbe,seedNarrationFixture} from '../scripts/narration-fixtures';
import {admitGeneration,setGenerationProgress,findGeneration,findNarration,generationView} from '../packages/db/src/index';
import {videoFixture} from '../fixtures/video';
import {propertyDescription} from '../fixtures/listing-description';
import {getJobVideo} from '../apps/pipeline/src/video-manifest';
import {CartesiaVoiceConfig,CARTESIA_DEFAULT_VOICE} from '../packages/contracts/src/index';
import {hashJson,DEFAULT_SCRIPT_MODEL} from '../packages/narration/src/index';
import {LOCALITY_SPEECH_VERSION} from '../packages/voice/src/index';

for(const {voiceEnabled,invalidScript} of [{voiceEnabled:true,invalidScript:false},{voiceEnabled:false,invalidScript:false},{voiceEnabled:true,invalidScript:true}])test(`Workflow workerd réel ${invalidScript?'narration invalide et crédit libéré':voiceEnabled?'avec voix':'sans voix ni sous-titres'}, fournisseurs simulés : reprise et erreur publique`,async t=>{
  const directory=await mkdtemp(path.join(tmpdir(),'bienvu-generation-'));t.after(()=>rm(directory,{recursive:true,force:true}));
  const require=createRequire(import.meta.url),wrangler=createRequire(require.resolve('wrangler/package.json'));
  const esbuild=await import(pathToFileURL(wrangler.resolve('esbuild')).href) as {build:(o:unknown)=>Promise<unknown>};
  const file=path.join(directory,'worker.mjs');await esbuild.build({entryPoints:['fixtures/generation-worker.ts'],outfile:file,bundle:true,platform:'neutral',mainFields:['module','main'],format:'esm',target:'es2022',external:['cloudflare:*','node:*'],conditions:['workerd','worker','browser']});
  const options={...convertV4MiniflareOptions({modules:true,script:await readFile(file,'utf8'),compatibilityDate:'2026-09-27',compatibilityFlags:['nodejs_compat'],
    bindings:{GENERATION_TOKEN:'fixture-generation-token-1234567890',GENERATIONS_ENABLED:'true'},d1Databases:['DB'],r2Buckets:['MEDIA'],
    durableObjects:{RENDERER:{className:'FixtureGenerationRenderer',useSQLite:true}},
    workflows:{GENERATION_WORKFLOW:{name:'fixture-generation',className:invalidScript?'FixtureInvalidScriptWorkflow':'FixtureGenerationWorkflow'}}}),resourcePersistencePath:path.join(directory,'storage')};
  let mf=new Miniflare(options);t.after(()=>mf.dispose());let env=await mf.getBindings<{DB:D1Database;MEDIA:R2Bucket}>();await migrateNarrationProbe(env.DB);
  const scope=await seedNarrationFixture(env.DB,'workflow',true),fixture=await videoFixture();
  await env.DB.prepare("UPDATE jobs SET status='failed',error_code='FIXTURE' WHERE id=?").bind(scope.jobId).run();
  const listing=fixture.listing;listing.agencyId=scope.agencyId;listing.id='listing-workflow';listing.description={text:propertyDescription,sourcePath:'fixture.description',truncated:false};
  for(const p of listing.photos){p.agencyId=scope.agencyId;p.listingId=listing.id;p.objectKey=`agencies/${scope.agencyId}/imports/${listing.id}/${p.id}.png`;
    await env.MEDIA.put(p.objectKey,new Uint8Array(fixture.files.get(p.id)!),{customMetadata:{sha256:p.contentHash}});}
  await env.DB.prepare('UPDATE listing_imports SET result_json=? WHERE id=?').bind(JSON.stringify(listing),listing.id).run();
  await env.DB.prepare('INSERT INTO generation_access VALUES(?,?,1)').bind(scope.agencyId,'allocation-workflow').run();
  await env.DB.prepare('INSERT INTO hosted_import_budget VALUES(?,0,3500,0)').bind(new Date().toISOString().slice(0,7)).run();await env.DB.exec('UPDATE generation_control SET enabled=1');
  const headers={'Content-Type':'application/json',Authorization:'Bearer fixture-generation-token-1234567890','X-Agency-ID':scope.agencyId,'Idempotency-Key':'fixture-workflow-idempotency'};
  assert.equal((await mf.dispatchFetch('https://test/generations',{method:'POST',body:'{}'})).status,401);
  const input={listingId:listing.id,durationSeconds:40 as const,subtitlesEnabled:!voiceEnabled,...(!voiceEnabled?{voiceEnabled:false}:{})};
  const create=()=>mf.dispatchFetch('https://test/generations',{method:'POST',headers,body:JSON.stringify(input)});
  const missing=listing.photos[0];await env.MEDIA.delete(missing.objectKey);
  assert.equal((await create()).status,422);
  assert.equal((await env.DB.prepare('SELECT count(*) AS n FROM generation_runs').first<{n:number}>())!.n,0);
  await env.MEDIA.put(missing.objectKey,new Uint8Array(fixture.files.get(missing.id)!),{customMetadata:{sha256:missing.contentHash}});
  const pending=await admitGeneration(env.DB,scope.agencyId,headers['Idempotency-Key'],input,'true');
  assert.equal(pending.launchStatus,'pending');
  // Coupure entre la réservation et le démarrage : la réconciliation reprend l'intention.
  await mf.dispose();mf=new Miniflare(options);env=await mf.getBindings<{DB:D1Database;MEDIA:R2Bucket}>();
  assert.equal((await mf.dispatchFetch('https://test/tick',{headers})).status,200);
  const first=await create();assert.equal(first.status,202);const job=await first.json() as {id:string};
  assert.equal((await (await create()).json() as {id:string}).id,job.id);
  let row:{status:string}|null=null;
  for(let i=0;i<70;i++){row=await env.DB.prepare('SELECT status FROM jobs WHERE id=?').bind(job.id).first();if(['rendering','ready','failed'].includes(row!.status))break;await new Promise(r=>setTimeout(r,200));}
  if(invalidScript){
    assert.equal(row!.status,'failed');
    const failed=(await findGeneration(env.DB,scope.agencyId,job.id))!;
    assert.equal(failed.errorCode,'SCRIPT_INVALID');assert.equal(failed.narrationErrorCode,'SCRIPT_INVALID');
    assert.equal((await (await mf.dispatchFetch(`https://test/job/${job.id}`,{headers})).json() as {errorCode:string}).errorCode,'SCRIPT_INVALID');
    const historical={...failed,errorCode:'GENERATION_FAILED'};
    assert.equal(generationView(historical).errorCode,'SCRIPT_INVALID');
    assert.equal(generationView({...historical,narrationErrorCode:'PRIVATE_PROVIDER_DIAGNOSTIC'}).errorCode,'GENERATION_FAILED');
    assert.equal(generationView({...historical,errorCode:'GENERATION_TIMEOUT'}).errorCode,'GENERATION_TIMEOUT');
    assert.equal(generationView({...historical,status:'scripting',errorCode:null}).errorCode,null);
    assert.equal(await findGeneration(env.DB,'another-agency',job.id),null);
    assert.deepEqual(await env.DB.prepare('SELECT reserved,consumed FROM allocations WHERE agency_id=?').bind(scope.agencyId).first(),{reserved:0,consumed:0});
    assert.equal((await env.DB.prepare("SELECT count(*) AS n FROM narration_calls WHERE job_id=? AND provider!='openai'").bind(job.id).first<{n:number}>())!.n,0);
    assert.equal((await env.DB.prepare('SELECT count(*) AS n FROM generation_artifacts').first<{n:number}>())!.n,0);
    return;
  }
  assert.equal(row!.status,'rendering');
  const narration=(await findNarration(env.DB,scope.agencyId,job.id))!;
  assert.equal(narration.configHash,await hashJson({voice:CartesiaVoiceConfig.parse({voice:CARTESIA_DEFAULT_VOICE}),
    scriptModel:DEFAULT_SCRIPT_MODEL,promptVersion:JSON.parse(narration.script!).promptVersion,mode:'mock',...(!voiceEnabled?{voiceEnabled:false}:{}),durationSeconds:40,...(voiceEnabled?{localitySpeechVersion:LOCALITY_SPEECH_VERSION}:{})}));
  assert.equal(JSON.parse(narration.script!).copyVersion,'description-copy/2');
  assert.equal((await getJobVideo(env.DB,scope.agencyId,job.id))!.manifest.scenes.reduce((n,s)=>n+s.durationFrames,0),1200);
  const voiceCalls=await env.DB.prepare("SELECT DISTINCT provider FROM narration_calls WHERE job_id=? AND provider!='openai'")
    .bind(job.id).all<{provider:string}>();
  assert.deepEqual(voiceCalls.results,voiceEnabled?[{provider:'cartesia'}]:[]);
  assert.equal((await getJobVideo(env.DB,scope.agencyId,job.id))!.manifest.subtitlesEnabled,false);
  assert.equal((await getJobVideo(env.DB,scope.agencyId,job.id))!.manifest.audio.length===0,!voiceEnabled);
  const progressRow=(await findGeneration(env.DB,scope.agencyId,job.id))!;
  await setGenerationProgress(env.DB,progressRow,42);
  await setGenerationProgress(env.DB,progressRow,17);
  assert.equal((await env.DB.prepare('SELECT progress_percent AS percent FROM jobs WHERE id=?').bind(job.id).first<{percent:number}>())!.percent,42);
  // Détruire workerd pendant le sleep, après le stockage R2. La requête HTTP est terminée depuis longtemps.
  const beforeCalls=(await env.DB.prepare('SELECT count(*) AS n FROM narration_calls').first<{n:number}>())!.n;
  if(voiceEnabled)assert.ok(beforeCalls>1);
  else assert.equal(beforeCalls,1);
  await mf.dispose();mf=new Miniflare(options);env=await mf.getBindings<{DB:D1Database;MEDIA:R2Bucket}>();
  await mf.dispatchFetch(`https://test/reconcile/${job.id}`,{headers});
  for(let i=0;i<100;i++){row=await env.DB.prepare('SELECT status FROM jobs WHERE id=?').bind(job.id).first();if(['ready','failed'].includes(row!.status))break;await new Promise(r=>setTimeout(r,200));}
  assert.equal(row!.status,'ready');
  assert.equal((await env.DB.prepare('SELECT progress_percent AS percent FROM jobs WHERE id=?').bind(job.id).first<{percent:number}>())!.percent,100);
  assert.deepEqual(await env.DB.prepare('SELECT reserved,consumed FROM allocations WHERE agency_id=?').bind(scope.agencyId).first(),{reserved:0,consumed:1});
  assert.equal((await env.DB.prepare('SELECT count(*) AS n FROM generation_artifacts').first<{n:number}>())!.n,1);
  assert.equal((await env.DB.prepare('SELECT count(*) AS n FROM narration_calls').first<{n:number}>())!.n,beforeCalls);
  assert.equal((await env.DB.prepare('SELECT count(*) AS n FROM generation_runs').first<{n:number}>())!.n,1);
  const {RENDERER:render}=await mf.getBindings<{RENDERER:DurableObjectNamespace}>();const count=await render.get(render.idFromName('generation-single-slot-v1')).fetch('https://fixture/count');
  assert.equal((await count.json() as {starts:number}).starts,1);
});
