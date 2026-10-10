// Run after build:web and prepare:web. All storage is disposable and local.
// --send-test sends this synthetic exception to PostHog with is_test=true;
// the default intercepts ingestion and never sends an analytics event.
import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {gunzipSync} from 'node:zlib';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
const out=resolve('evidence/local/posthog-error-tracking'),dir=resolve('apps/web/.open-next/posthog-worker');
const config=JSON.parse(await readFile(resolve(dir,'wrangler.jsonc'),'utf8'));
const live=process.argv.includes('--send-test'),events=[],receipts=[],probeToken='local-error-tracking-probe-token-00000001';
await mkdir(out,{recursive:true,mode:0o700});
const mf=new Miniflare(convertV4MiniflareOptions({modules:true,scriptPath:resolve(dir,'worker.js'),
 compatibilityDate:config.compatibility_date,compatibilityFlags:config.compatibility_flags,
 bindings:{POSTHOG_ENABLED:'true',POSTHOG_PROJECT_TOKEN:live?config.vars.POSTHOG_PROJECT_TOKEN:'phc_public_fixture_project_key',POSTHOG_HOST:'https://eu.i.posthog.com',PROBE_MODE:'true',PROBE_TOKEN:probeToken,BIENVU_RELEASE:config.vars.BIENVU_RELEASE,BIENVU_WORKER_CHUNK_ID:config.vars.BIENVU_WORKER_CHUNK_ID,TRAFFIC_ENABLED:'false'},
 d1Databases:{DB:'local-errors-only'},r2Buckets:['MEDIA'],serviceBindings:{ASSETS:async()=>new Response('Not found',{status:404})},
 outboundService:async request=>{
  assert.equal(new URL(request.url).host,'eu.i.posthog.com','only PostHog may receive this local probe');
  const bytes=Buffer.from(await request.clone().arrayBuffer());const payload=JSON.parse((bytes[0]===31?gunzipSync(bytes):bytes).toString());events.push(...payload.batch);
  if(!live)return Response.json({status:1});
  // Miniflare's Request belongs to another realm; pass its bytes to native fetch.
  const response=await fetch(request.url,{method:request.method,headers:Object.fromEntries(request.headers),body:bytes});
  receipts.push(response.status);return response;
 }}));
try{
 assert.equal((await mf.dispatchFetch('https://bienvu.online/api/probe')).status,401);
 // An empty local D1 deliberately lacks probe_sessions. The actual compiled
 // Next route catches its error inside the scope established by worker.ts.
 const response=await mf.dispatchFetch('https://bienvu.online/api/probe',{method:'POST',headers:{Authorization:'Bearer '+probeToken}});
 assert.equal(response.status,500);assert.ok(response.headers.get('X-Request-ID'));
 for(let n=0;n<50&&!events.length;n++)await new Promise(r=>setTimeout(r,100));
 assert.equal(events.length,1);const event=events[0];assert.equal(event.event,'$exception');assert.equal(event.properties.bv_error_source,'api');assert.equal(event.properties.is_test,true);
 assert.equal(event.properties.bv_release,config.vars.BIENVU_RELEASE);assert.ok(event.properties.$exception_list[0].stacktrace.frames.length);assert.ok(!JSON.stringify(events).includes(probeToken));
 const appFrames=event.properties.$exception_list[0].stacktrace.frames.filter(frame=>frame.filename.endsWith('/worker.js'));assert.ok(appFrames.length);assert.ok(appFrames.every(frame=>frame.chunk_id===config.vars.BIENVU_WORKER_CHUNK_ID&&frame.in_app===true));
 const bucket=await mf.getR2Bucket('MEDIA');assert.equal((await bucket.list()).objects.length,0,'the route removes its temporary object even after a D1 failure');
 if(live){for(let n=0;n<50&&!receipts.length;n++)await new Promise(r=>setTimeout(r,100));assert.ok(receipts.some(status=>status>=200&&status<300),'PostHog accepted the synthetic exception');}
 await writeFile(resolve(out,live?'real-project-test.json':'compiled-worker.json'),JSON.stringify({at:new Date().toISOString(),live,receipts,status:response.status,version:config.vars.BIENVU_RELEASE,source:event.properties.bv_error_source,exceptions:events.length,frames:event.properties.$exception_list[0].stacktrace.frames,passed:true},null,2),{mode:0o600});
 console.log(JSON.stringify({passed:true,compiledNextAndOuterWorker:true,status:response.status,exceptions:events.length,sentToProject:live}));
}finally{await mf.dispose();}
