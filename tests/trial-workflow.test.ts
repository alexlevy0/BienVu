import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import sharp from 'sharp';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {migrateNarrationProbe} from '../scripts/narration-fixtures';
import {admitAnonymous,createAnonymousSession,claimTrial,creditGrant,ensureAgency,listGenerations,findOwnedGeneration} from '../packages/db/src/index';
import {generationVideo} from '../apps/web/lib/generations';
test('Workflow anonyme complet workerd : import/voix/rendu simulés une fois, claim pendant rendu et reprise après crash',async t=>{
  const directory=await mkdtemp(path.join(tmpdir(),'bienvu-trial-workflow-'));t.after(()=>rm(directory,{recursive:true,force:true}));
  const require=createRequire(import.meta.url),wrangler=createRequire(require.resolve('wrangler/package.json'));
  const esbuild=await import(pathToFileURL(wrangler.resolve('esbuild')).href) as {build:(o:unknown)=>Promise<unknown>};
  const file=path.join(directory,'worker.mjs');await esbuild.build({entryPoints:['fixtures/generation-worker.ts'],outfile:file,bundle:true,platform:'neutral',mainFields:['module','main'],format:'esm',target:'es2022',external:['cloudflare:*','node:*'],conditions:['workerd','worker','browser']});
  const html=await readFile('fixtures/imports/century21.html','utf8'),images=await Promise.all([0,1,2].map(i=>sharp({create:{width:640,height:360,channels:3,background:{r:50+i*70,g:90,b:160}}}).jpeg().toBuffer()));let imports=0;
  const options={...convertV4MiniflareOptions({modules:true,script:await readFile(file,'utf8'),compatibilityDate:'2026-09-27',compatibilityFlags:['nodejs_compat'],
    bindings:{GENERATION_TOKEN:'fixture-generation-token-1234567890',GENERATIONS_ENABLED:'true',IMPORT_TOKEN:'fixture-import-token'},d1Databases:['DB'],r2Buckets:['MEDIA'],
    serviceBindings:{IMPORT_SERVICE:async request=>{imports++;const body=await request.json() as {url:string;kind:string};const image=images[body.url.includes('a.jpg')?0:body.url.includes('b.jpg')?1:2];return new Response(body.kind==='page'?html:image,{headers:{'Content-Type':body.kind==='page'?'text/html':'image/jpeg','X-Source-Url':body.url,'X-Source-Bytes':String(body.kind==='page'?Buffer.byteLength(html):image.byteLength),'X-Image-Width':'640','X-Image-Height':'360'}});}},
    durableObjects:{RENDERER:{className:'FixtureGenerationRenderer',useSQLite:true}},workflows:{GENERATION_WORKFLOW:{name:'fixture-trial',className:'FixtureGenerationWorkflow'}}}),resourcePersistencePath:path.join(directory,'storage')};
  let mf=new Miniflare(options);t.after(()=>mf.dispose());let env=await mf.getBindings<{DB:D1Database;MEDIA:R2Bucket}>();await migrateNarrationProbe(env.DB);
  await env.DB.prepare('INSERT INTO hosted_import_budget VALUES(?,0,2500,0)').bind(new Date().toISOString().slice(0,7)).run();await env.DB.exec('UPDATE generation_control SET enabled=1; UPDATE trial_policy SET enabled=1,free_enabled=1');
  const {session}=await createAnonymousSession(env.DB),input={url:'https://www.century21.fr/trouver_logement/detail/123456/'},proof={ipHmac:'a'.repeat(64),turnstileHash:'b'.repeat(64)};
  const pending=await admitAnonymous(env.DB,session,'workflow-anonymous-key',input,proof,'true');
  const headers={Authorization:'Bearer fixture-generation-token-1234567890','X-Agency-ID':session.scopeId};
  await mf.dispose();mf=new Miniflare(options);env=await mf.getBindings<{DB:D1Database;MEDIA:R2Bucket}>();await mf.dispatchFetch('https://test/tick',{headers});
  let status='queued';for(let i=0;i<100;i++){status=(await env.DB.prepare('SELECT status FROM jobs WHERE id=?').bind(pending.jobId).first<{status:string}>())!.status;if(['rendering','ready','failed'].includes(status))break;await new Promise(r=>setTimeout(r,100));}
  assert.equal(status,'rendering');assert.equal(imports,4);
  const user={id:'workflow-trial-owner',email:'owner@example.com'};await env.DB.prepare('INSERT INTO auth_user VALUES(?,?,?,1,NULL,?,?)').bind(user.id,'Owner',user.email,Date.now()-1000,Date.now()).run();const agency=await ensureAgency(env.DB,user);
  assert.equal((await claimTrial(env.DB,session,agency.id,pending.jobId)).creditStatus,'reserved');
  const before=(await env.DB.prepare('SELECT count(*) AS n FROM narration_calls').first<{n:number}>())!.n;assert.ok(before>4);
  await mf.dispose();mf=new Miniflare(options);env=await mf.getBindings<{DB:D1Database;MEDIA:R2Bucket}>();
  await mf.dispatchFetch(`https://test/reconcile/${pending.jobId}`,{headers});
  const done=(await findOwnedGeneration(env.DB,agency.id,pending.jobId))!;assert.equal(done.status,'ready');assert.equal(done.creditStatus,'consumed');assert.ok(done.previewKey);assert.ok(done.objectKey);
  const [a,b]=await Promise.all([1,2].map(()=>claimTrial(env.DB,session,agency.id,pending.jobId)));assert.equal(a.jobId,b.jobId);
  assert.equal((await creditGrant(env.DB,agency.id))!.remaining,2);assert.equal((await listGenerations(env.DB,agency.id)).jobs.length,1);
  assert.equal((await env.DB.prepare('SELECT count(*) AS n FROM narration_calls').first<{n:number}>())!.n,before);assert.equal(imports,4);
  const {RENDERER}=await mf.getBindings<{RENDERER:DurableObjectNamespace}>();assert.equal((await (await RENDERER.get(RENDERER.idFromName('generation-single-slot-v1')).fetch('https://fixture/count')).json() as {starts:number}).starts,1);
  const master=await generationVideo(new Request('https://test?download=1'),env,agency.id,pending.jobId);assert.deepEqual(new Uint8Array(await master.arrayBuffer()),new Uint8Array([1,2,3,4]));
  assert.equal((await env.DB.prepare('SELECT count(*) AS n FROM generation_shares').first<{n:number}>())!.n,0);
});
