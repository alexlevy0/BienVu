import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {resolve} from 'node:path';
import {gunzipSync} from 'node:zlib';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {redactErrorText,errorPath,safeExceptionProperties} from '../apps/web/lib/error-tracking-policy';
import {captureServerException,withServerErrorTracking,errorTrackingOptions} from '../apps/web/lib/error-tracking-server';
import {RequestFailure,respond} from '../apps/web/lib/http';
const env={POSTHOG_ENABLED:'true',POSTHOG_PROJECT_TOKEN:'phc_public_fixture_project_key',POSTHOG_HOST:'https://eu.i.posthog.com'};
async function decode(body:unknown){const bytes=body instanceof Blob?Buffer.from(await body.arrayBuffer()):typeof body==='string'?Buffer.from(body):Buffer.from(body as Uint8Array);return JSON.parse((bytes[0]===31?gunzipSync(bytes):bytes).toString());}

test('Exceptions : messages et frames utiles conservés, clés, URLs signées et coordonnées retirées',()=>{
 const message='Failed for alex@example.fr, 06 12 34 56 78: https://user:SECRET_URL@bienvu.online/api?code=SECRET_CODE#token=SECRET_HASH password=SECRET_PASSWORD Bearer SECRET_AUTH phx_SECRET_PERSONAL_KEY';
 const safe=safeExceptionProperties({$exception_list:[{type:'TypeError',value:message,mechanism:{type:'onerror',handled:false},stacktrace:{type:'raw',frames:[{filename:'https://bienvu.online/_next/static/chunks/app.js?token=SECRET_TOKEN',function:'render',lineno:12,colno:34,chunk_id:'chunk-fixture',vars:{password:'SECRET_FRAME'},pre_context:['SECRET_SOURCE']}]}}],bv_error_source:'nextjs',bv_error_digest:'123456',headers:{cookie:'SECRET_COOKIE'},body:'SECRET_BODY',$exception_steps:['SECRET_STEPS'],$pathname:'/api/generations/264c088b-5fe7-49f5-aca7-ff4332bc5531?token=SECRET_QUERY'});
 assert.ok(!JSON.stringify(safe).includes('SECRET_'));assert.ok(!JSON.stringify(safe).includes('alex@example.fr'));
 assert.equal((safe.$exception_list as any[])[0].stacktrace.frames[0].chunk_id,'chunk-fixture');
 assert.equal((safe.$exception_list as any[])[0].stacktrace.frames[0].lineno,12);assert.equal((safe.$exception_list as any[])[0].mechanism.handled,false);
 assert.equal(safe.$pathname,'/api/generations/[id]');assert.equal(safe.bv_error_digest,'123456');assert.equal(redactErrorText('TypeError: undefined is not a function'),'TypeError: undefined is not a function');
});
test('Exceptions : chaînes et taille bornées, routes sans paramètres privés',()=>{
 assert.equal(errorPath('/biens/264c088b-5fe7-49f5-aca7-ff4332bc5531?email=person@example.fr#token=x'),'/biens/[id]');
 assert.equal(errorPath('/validation/SECRET_VALIDATION'),'/validation/[token]');assert.equal(errorPath('/biens/listing%3A264c088b-5fe7-49f5-aca7-ff4332bc5531'),'/biens/[id]');
 const output=safeExceptionProperties({$exception_list:Array.from({length:10},()=>({value:'x'.repeat(10000),stacktrace:{frames:Array.from({length:100},()=>({filename:'app.js',lineno:1}))}}))});
 assert.equal((output.$exception_list as any[]).length,5);assert.equal((output.$exception_list as any[])[0].stacktrace.frames.length,50);assert.equal((output.$exception_list as any[])[0].value.length,4000);
});
test('Sourcemaps : les frames du Worker final utilisent son ID, les modules internes restent intacts',()=>{
 const id='11111111-1111-4111-8111-111111111111',filter=errorTrackingOptions(fetch,id).before_send as (event:any)=>any;
 const event=filter({event:'$exception',properties:{$exception_list:[{value:'test',stacktrace:{frames:[{filename:'apps/web/worker.js',chunk_id:'intermediate',lineno:123,colno:7},{filename:'cloudflare-internal:d1-api',lineno:42}]}}]}});
 const [app,internal]=event.properties.$exception_list[0].stacktrace.frames;assert.equal(app.chunk_id,id);assert.equal(app.in_app,true);assert.equal(app.lineno,123);assert.equal(internal.chunk_id,undefined);
});
test('Serveur : requêtes isolées, déduplication, choix du replay et arrêt de collecte',async()=>{
 const events:Record<string,any>[]=[],pending:Promise<unknown>[]=[];
 const fetcher:typeof fetch=async(_url,init)=>{const payload=await decode(init?.body);events.push(...(payload.batch??[payload]));return Response.json({status:1});};
 const ctx={waitUntil(p:Promise<unknown>){pending.push(p);}};
 assert.equal(captureServerException(Error('Outside request'),{source:'api'}),false);
 await Promise.all([1,2].map(async n=>withServerErrorTracking(new Request(`https://bienvu.online/api/test?token=SECRET_${n}`,{headers:n===1?{'X-Analytics-Consent':'2','X-PostHog-Session-ID':'11111111-1111-4111-8111-111111111111','X-PostHog-Distinct-ID':'user:fixture-user-000001'}:{'X-PostHog-Session-ID':'SECRET_UNCONSENTED','cookie':'SECRET_COOKIE'}}),env,ctx,async()=>{
  await new Promise(r=>setTimeout(r,n*2));const error=Error('Test request '+n+' token=SECRET_TOKEN');assert.equal(captureServerException(error,{source:'api',requestId:'request-'+n}),true);assert.equal(captureServerException(error,{source:'worker'}),false);
 },fetcher)));
 for(const config of [{...env,POSTHOG_ENABLED:'false'},{...env,POSTHOG_ERROR_TRACKING_ENABLED:'false'},{...env,POSTHOG_HOST:'https://us.i.posthog.com'}])withServerErrorTracking(null,config,ctx,()=>assert.equal(captureServerException(Error('Disabled'),{source:'scheduled'}),false),fetcher);
 await Promise.all(pending);assert.equal(events.length,2);
 const [a,b]=['request-1','request-2'].map(id=>events.find(e=>e.properties.bv_request_id===id)!);
 assert.equal(a.distinct_id,'user:fixture-user-000001');assert.equal(a.properties.$session_id,'11111111-1111-4111-8111-111111111111');
 assert.equal(b.distinct_id,'bienvu:server');assert.equal(b.properties.$session_id,undefined);assert.ok(!JSON.stringify(events).includes('SECRET_'));assert.ok(events.every(e=>e.event==='$exception'&&e.properties.$exception_list.length&&e.properties.$process_person_profile===false));
});
test('API : seule une exception inattendue est capturée, le diagnostic et la réponse restent utilisables',async()=>{
 const pending:Promise<unknown>[]=[],events:unknown[]=[];const fetcher:typeof fetch=async(_url,init)=>{events.push(await decode(init?.body));throw Error('Ingestion offline');};
 const ctx={waitUntil(p:Promise<unknown>){pending.push(p);}};
 for(const error of [new RequestFailure('FORBIDDEN'),new RequestFailure('VALIDATION_ERROR'),Error('Unexpected API failure')]){
  const response=await withServerErrorTracking(new Request('https://bienvu.online/api/test'),env,ctx,()=>respond(async()=>{throw error;}),fetcher);
  assert.ok(response.status>=400);assert.ok(response.headers.get('X-Request-ID'));assert.equal(response.headers.get('Cache-Control'),'private, no-store');
 }
 await Promise.all(pending);assert.equal(events.length,1);
});
test('Worker réel : SDK Node et AsyncLocalStorage compatibles, émission après la réponse via waitUntil',async t=>{
 const require=createRequire(import.meta.url),esbuild=createRequire(require.resolve('tsx'))('esbuild');
 const built=await esbuild.build({stdin:{contents:`import {withServerErrorTracking,captureServerException} from './apps/web/lib/error-tracking-server';export default{fetch(request,env,ctx){return withServerErrorTracking(request,env,ctx,()=>{captureServerException(new TypeError('WORKER_FIXTURE token=SECRET_TOKEN'),{source:'worker'});return new Response('original response',{status:500});});}};`,resolveDir:resolve('.'),loader:'ts'},bundle:true,write:false,format:'esm',platform:'node',external:['node:*'],define:{'process.env.NEXT_PUBLIC_BIENVU_RELEASE':'"worker-fixture"'}});
 const events:Record<string,any>[]=[],mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:built.outputFiles[0].text,compatibilityDate:'2026-09-27',compatibilityFlags:['nodejs_compat'],bindings:env,outboundService:async request=>{
  assert.equal(new URL(request.url).host,'eu.i.posthog.com');const payload=await decode(new Uint8Array(await request.arrayBuffer()));events.push(...(payload.batch??[payload]));return Response.json({status:1});
 }}));t.after(()=>mf.dispose());const response=await mf.dispatchFetch('https://bienvu.online/api/test');assert.equal(response.status,500);assert.equal(await response.text(),'original response');
 for(let n=0;n<30&&!events.length;n++)await new Promise(r=>setTimeout(r,100));assert.equal(events.length,1);assert.ok(!JSON.stringify(events).includes('SECRET_TOKEN'));assert.ok(events[0].properties.$exception_list[0].stacktrace.frames.length>0);assert.equal(events[0].properties.bv_release,'worker-fixture');
});
