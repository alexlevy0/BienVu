import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import sharp from 'sharp';
import {migrateNarrationProbe,seedNarrationFixture} from '../scripts/narration-fixtures';
import {findGeneration,generationView,confirmGenerationMap} from '../packages/db/src/index';
import {videoFixture} from '../fixtures/video';
import {getJobVideo} from '../apps/pipeline/src/video-manifest';

test('Workflow workerd : attente avant les fournisseurs, reprise sur le même job et décision conservée après redémarrage',async t=>{
  const directory=await mkdtemp(path.join(tmpdir(),'bienvu-map-workflow-'));t.after(()=>rm(directory,{recursive:true,force:true}));
  const require=createRequire(import.meta.url),wrangler=createRequire(require.resolve('wrangler/package.json'));
  const esbuild=await import(pathToFileURL(wrangler.resolve('esbuild')).href) as {build:(o:unknown)=>Promise<unknown>};
  const file=path.join(directory,'worker.mjs');await esbuild.build({entryPoints:['fixtures/generation-worker.ts'],outfile:file,bundle:true,platform:'neutral',mainFields:['module','main'],format:'esm',target:'es2022',external:['cloudflare:*','node:*'],conditions:['workerd','worker','browser']});
  const options={...convertV4MiniflareOptions({modules:true,script:await readFile(file,'utf8'),compatibilityDate:'2026-09-27',compatibilityFlags:['nodejs_compat'],
    bindings:{GENERATION_TOKEN:'fixture-generation-token-1234567890',GENERATIONS_ENABLED:'true'},d1Databases:['DB'],r2Buckets:['MEDIA'],
    durableObjects:{RENDERER:{className:'FixtureGenerationRenderer',useSQLite:true}},
    workflows:{GENERATION_WORKFLOW:{name:'fixture-map-confirmation',className:'FixtureMapConfirmationWorkflow'}}}),resourcePersistencePath:path.join(directory,'storage')};
  type Bindings={DB:D1Database;MEDIA:R2Bucket};
  let mf=new Miniflare(options);t.after(()=>mf.dispose());let env=await mf.getBindings<Bindings>();await migrateNarrationProbe(env.DB);
  const scope=await seedNarrationFixture(env.DB,'workflow-map',true),fixture=await videoFixture();
  await env.DB.prepare("UPDATE jobs SET status='failed',error_code='FIXTURE',lease_until=NULL WHERE id=?").bind(scope.jobId).run();
  const listing=fixture.listing;listing.agencyId=scope.agencyId;listing.id='listing-workflow-map';listing.facts.locality.value='La Rochelle';
  for(const p of listing.photos){p.agencyId=scope.agencyId;p.listingId=listing.id;p.objectKey=`agencies/${scope.agencyId}/imports/${listing.id}/${p.id}.png`;
    await env.MEDIA.put(p.objectKey,new Uint8Array(fixture.files.get(p.id)!),{customMetadata:{sha256:p.contentHash}});}
  await env.DB.prepare('UPDATE listing_imports SET result_json=? WHERE id=?').bind(JSON.stringify(listing),listing.id).run();
  await env.DB.prepare('INSERT INTO generation_access VALUES(?,?,1)').bind(scope.agencyId,'allocation-workflow-map').run();
  await env.DB.prepare('INSERT INTO hosted_import_budget VALUES(?,0,3500,0)').bind(new Date().toISOString().slice(0,7)).run();await env.DB.exec('UPDATE generation_control SET enabled=1');
  await env.MEDIA.put('fixture-map-plate.jpg',new Uint8Array(await sharp({create:{width:2160,height:3840,channels:3,background:'#acbb9d'}}).jpeg().toBuffer()));
  const headers={'Content-Type':'application/json',Authorization:'Bearer fixture-generation-token-1234567890','X-Agency-ID':scope.agencyId,'Idempotency-Key':'fixture-map-workflow-idempotency'};
  const create=()=>mf.dispatchFetch('https://test/generations',{method:'POST',headers,body:JSON.stringify({listingId:listing.id,durationSeconds:20,voiceEnabled:false})});
  const response=await create();assert.equal(response.status,202);const job=await response.json() as {id:string};
  async function until(check:()=>Promise<boolean>,timeout=25_000){const started=Date.now();while(!await check()){assert.ok(Date.now()-started<timeout,'Workflow timeout');await new Promise(r=>setTimeout(r,200));}}
  await until(async()=>Boolean(generationView((await findGeneration(env.DB,scope.agencyId,job.id))!).mapConfirmation));
  for(const table of ['narration_runs','avatar_tasks','photo_animations','video_manifests'])assert.equal((await env.DB.prepare(`SELECT count(*) n FROM ${table} WHERE job_id=?`).bind(job.id).first<{n:number}>())!.n,0);
  const first=(await findGeneration(env.DB,scope.agencyId,job.id))!;assert.equal(first.status,'importing');assert.equal(first.creditsUsed,0);
  const expiry=generationView(first).mapConfirmation!.expiresAt;
  await new Promise(r=>setTimeout(r,5500));
  assert.equal(generationView((await findGeneration(env.DB,scope.agencyId,job.id))!).mapConfirmation?.expiresAt,expiry);
  assert.equal((await env.DB.prepare('SELECT count(*) n FROM narration_runs WHERE job_id=?').bind(job.id).first<{n:number}>())!.n,0);
  await confirmGenerationMap(env.DB,scope.agencyId,job.id,{candidateId:'city-1'});
  await until(async()=>['ready','failed'].includes((await findGeneration(env.DB,scope.agencyId,job.id))!.status));
  const final=(await findGeneration(env.DB,scope.agencyId,job.id))!;assert.equal(final.status,'ready');assert.equal(generationView(final).creditsUsed,1);
  const frozen=(await getJobVideo(env.DB,scope.agencyId,job.id))!;
  assert.equal(frozen.manifest.map?.settings.location?.latitude,47.76);assert.equal(frozen.manifest.map?.settings.location?.longitude,5.73);
  assert.equal(frozen.manifest.map?.settings.zoomStart,12);assert.equal(frozen.manifest.map?.settings.zoomEnd,14.5);
  assert.equal(frozen.manifest.photoTimeline!.reduce((n,c)=>n+c.durationFrames,0),480);
  assert.equal(frozen.manifest.scenes.reduce((n,c)=>n+c.durationFrames,0),600);assert.equal(generationView(final).preparation?.map,'ready');
  assert.equal((await (await create()).json() as {id:string}).id,job.id);
  assert.equal((await env.DB.prepare('SELECT count(*) n FROM generation_runs').first<{n:number}>())!.n,1);
  await mf.dispose();mf=new Miniflare(options);env=await mf.getBindings<Bindings>();
  assert.equal(generationView((await findGeneration(env.DB,scope.agencyId,job.id))!).creditsUsed,1);
  assert.equal((await confirmGenerationMap(env.DB,scope.agencyId,job.id,{candidateId:'city-1'})).selectedId,'city-1');
  assert.equal((await getJobVideo(env.DB,scope.agencyId,job.id))!.hash,frozen.hash);
  assert.deepEqual((await env.DB.prepare('PRAGMA foreign_key_check').all()).results,[]);
});
