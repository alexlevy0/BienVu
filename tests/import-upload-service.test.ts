import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdtemp,readFile,readdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {beginImport,startCreationDraft,blankCreationDraft,reserveHostedImport} from '../packages/db/src/index';

test('service photo workerd : compléter un import URL partiel, isolation et budget conservés',async t=>{
  const directory=await mkdtemp(path.join(tmpdir(),'bienvu-upload-service-'));t.after(()=>rm(directory,{recursive:true,force:true}));
  const require=createRequire(import.meta.url),wrangler=createRequire(require.resolve('wrangler/package.json'));
  const esbuild=await import(pathToFileURL(wrangler.resolve('esbuild')).href);
  const entry=path.join(directory,'fixture.ts'),out=path.join(directory,'worker.mjs');
  // Only the container transport is a fixture. Auth, owner lookup, D1 budget and
  // the deployed handler run in real workerd. No photo-decoding claim here.
  await writeFile(entry,`import handler from ${JSON.stringify(path.resolve('apps/pipeline/src/import-worker.ts'))};
    export default {fetch(request,env,ctx){return handler.fetch(request,{...env,IMPORT_CONTAINER:{getByName(){return {fetch(request){return new Response(request.body,{headers:{'Content-Type':'image/jpeg','X-Fixture-Container':'true'}});}}}}},ctx);}};`);
  await esbuild.build({entryPoints:[entry],outfile:out,bundle:true,platform:'neutral',mainFields:['module','main'],format:'esm',target:'es2022',external:['cloudflare:*','node:*'],conditions:['workerd','worker','browser']});
  const mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:await readFile(out,'utf8'),compatibilityDate:'2026-09-28',compatibilityFlags:['nodejs_compat'],
    bindings:{IMPORTS_ENABLED:'true',IMPORT_TOKEN:'fixture-import-token-1234567890123456'},d1Databases:['DB']}));t.after(()=>mf.dispose());
  const {DB}=await mf.getBindings<{DB:D1Database}>();
  for(const file of (await readdir('packages/db/migrations')).filter(f=>f.endsWith('.sql')).sort())
    await DB.exec((await readFile(`packages/db/migrations/${file}`,'utf8')).replace(/^--.*$/gm,'').replace(/\n/g,' '));
  const at=new Date().toISOString();await DB.prepare("INSERT INTO agencies(id,owner_user_id,name,created_at,updated_at) VALUES('service-photos','service-photos','Photos',?,?)").bind(at,at).run();
  const row=(await beginImport(DB,'service-photos','https://fixtures.bienvu.example/vente','service-partial-url-01')).row;
  await DB.prepare('INSERT INTO hosted_import_budget(month,baseline_cents,ceiling_cents,paused) VALUES(?,0,3500,0)').bind(at.slice(0,7)).run();
  await reserveHostedImport(DB,'service-photos',row.id);
  const headers={Authorization:'Bearer fixture-import-token-1234567890123456','Content-Type':'image/png','X-Agency-ID':'service-photos','X-Import-ID':row.id};
  const send=(extra:Record<string,string>={})=>mf.dispatchFetch('https://import.internal/normalize-photo',{method:'POST',headers:{...headers,...extra},body:new Uint8Array([1,2,3])});
  assert.equal((await send()).status,404,'Un scrape actif ne reçoit pas de photos manuelles');
  await startCreationDraft(DB,'service-photos',row.id,blankCreationDraft());
  const response=await send();assert.equal(response.status,200);assert.equal(response.headers.get('X-Fixture-Container'),'true');
  assert.deepEqual(new Uint8Array(await response.arrayBuffer()),new Uint8Array([1,2,3]));
  assert.equal((await DB.prepare('SELECT requests FROM hosted_import_costs WHERE import_id=?').bind(row.id).first<{requests:number}>())?.requests,1);
  assert.equal((await send({Authorization:'Bearer wrong'})).status,401);
  assert.notEqual((await send({'X-Agency-ID':'another-agency'})).status,200);
  await DB.prepare('UPDATE hosted_import_budget SET paused=1').run();assert.equal((await send()).status,429);
});
