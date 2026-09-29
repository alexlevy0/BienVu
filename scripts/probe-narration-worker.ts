import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdir, mkdtemp, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {createHash, randomBytes} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {Miniflare, convertV4MiniflareOptions} from 'miniflare';
import {PreparedNarration} from '../packages/contracts/src/index';
import {migrateNarrationProbe,seedNarrationFixture} from './narration-fixtures';
import {toneFixture} from '../fixtures/voice';
import {DEFAULT_SCRIPT_MODEL} from '../packages/narration/src/index';

const root=fileURLToPath(new URL('../',import.meta.url)),output=path.join(root,'evidence/local/sprint-05/narration-worker');
await mkdir(output,{recursive:true});
const build=await promisify(execFile)(process.execPath,[path.join(root,'node_modules/wrangler/bin/wrangler.js'),
  'deploy','fixtures/narration-worker.ts','--dry-run','--outdir',output,'--name','bienvu-narration-fixture','--compatibility-date','2026-09-28'],
  {cwd:root,env:{...process.env,WRANGLER_SEND_METRICS:'false'},timeout:60000});
await writeFile(path.join(output,'build.log'),build.stdout+build.stderr);
const directory=await mkdtemp(path.join(tmpdir(),'bienvu-narration-http-')),token=randomBytes(32).toString('base64url');
let interceptedRequests=0;
const providerFixture=async(request:Request)=>{
  // Le pont Miniflare reconstruit la Request sortante et ne conserve pas
  // sa propriété redirect ; la politique est vérifiée dans les tests client.
  assert.equal(request.method,'POST');
  interceptedRequests++;
  if(request.url==='https://api.openai.com/v1/responses') {
    const body=await request.json() as {input:{content:string}[]},data=JSON.parse(body.input[1].content);
    const plan={scenes:['intro','area','price','contact'].map((kind,index)=>({copyId:`${kind}/direct`,photoAssetId:data.photos[index%data.photos.length]}))};
    return Response.json({id:'resp_fixture',model:DEFAULT_SCRIPT_MODEL,status:'completed',usage:{input_tokens:1000,output_tokens:200},
      output:[{type:'message',role:'assistant',status:'completed',content:[{type:'output_text',text:JSON.stringify(plan)}]}]});
  }
  if(request.url==='https://texttospeech.googleapis.com/v1/text:synthesize')
    return Response.json({audioContent:Buffer.from(toneFixture(5000)).toString('base64')});
  throw new Error('NO_NETWORK_IN_NARRATION_FIXTURE');
};
const options=(enabled:boolean)=>({...convertV4MiniflareOptions({modules:true,scriptPath:path.join(output,'narration-worker.js'),
  compatibilityDate:'2026-09-28',d1Databases:['DB'],r2Buckets:['MEDIA'],bindings:{NARRATION_TOKEN:token,NARRATION_ENABLED:String(enabled),
    NARRATION_AGENCY_ID:'s05-worker',NARRATION_JOB_ID:'job-worker'},outboundService:providerFixture}),
  resourcePersistencePath:directory});
const mf=new Miniflare(options(true));
const jobPath='/agencies/s05-worker/jobs/job-worker',url=(p:string)=>`https://narration-fixture.invalid${p}`;
const headers={authorization:`Bearer ${token}`};
const prepare=(h:Record<string,string>=headers,body?:string)=>mf.dispatchFetch(url(`${jobPath}/prepare`),{method:'POST',headers:h,...(body?{body}:{})});
try {
  const {DB}=await mf.getBindings<{DB:D1Database}>();await migrateNarrationProbe(DB);await seedNarrationFixture(DB,'worker',true);
  assert.equal((await prepare({})).status,401);
  assert.equal((await prepare({authorization:'Bearer incorrect'})).status,401);
  assert.equal((await mf.dispatchFetch(url('/agencies/other/jobs/job-worker/prepare'),{method:'POST',headers})).status,404);
  assert.equal((await prepare(headers,JSON.stringify({model:'attacker-controlled'}))).status,400);
  assert.equal((await DB.prepare('SELECT count(*) n FROM narration_calls').first<{n:number}>())!.n,0);
  const first=await prepare();assert.equal(first.status,200);
  const data=await first.json() as {providerMock:boolean;callsThisRun:{script:number;voice:number};result:unknown};
  assert.equal(data.providerMock,true);assert.deepEqual(data.callsThisRun,{script:1,voice:4});
  const result=PreparedNarration.parse(data.result);assert.equal(result.script.scenes.length,4);
  assert.equal(result.durationFrames.reduce((a,b)=>a+b,0),663);
  assert.equal(result.script.copyVersion,'factual-copy/2');
  assert.ok(result.script.provenance.every(p=>p.status==='user_provided'));
  const stored=await mf.dispatchFetch(url(jobPath),{headers});assert.equal(stored.status,200);
  assert.equal(stored.headers.get('cache-control'),'no-store');
  assert.deepEqual((await stored.json() as {result:unknown}).result,result);
  const asset=result.audio[0],audioPath=`${jobPath}/audio/${asset.id}`;
  assert.equal((await mf.dispatchFetch(url(audioPath))).status,401);
  assert.equal((await mf.dispatchFetch(url(audioPath.replace('s05-worker','another')),{headers})).status,404);
  const audio=await mf.dispatchFetch(url(audioPath),{headers});assert.equal(audio.status,200);
  assert.equal(createHash('sha256').update(new Uint8Array(await audio.arrayBuffer())).digest('hex'),asset.sha256);
  const second=await prepare();assert.equal(second.status,200);
  const replay=await second.json() as typeof data;assert.deepEqual(replay.callsThisRun,{script:0,voice:0});assert.deepEqual(replay.result,result);
  await mf.setOptions(options(false));
  assert.equal((await prepare()).status,503);
  assert.equal((await mf.dispatchFetch(url(jobPath),{headers})).status,200);
  const {DB:reopened}=await mf.getBindings<{DB:D1Database}>();
  const count=await reopened.prepare('SELECT count(*) n, sum(reservation_cents) cents FROM narration_calls').first<{n:number;cents:number}>();
  assert.deepEqual(count,{n:5,cents:0});
  assert.equal(interceptedRequests,5);
  const report={runtime:'local-workerd',nodejsCompat:false,outboundNetwork:false,providerMock:true,
    nativeFetch:true,interceptedRequests,
    first:data.callsThisRun,replay:replay.callsThisRun,scenes:4,durationFrames:663,
    checks:['anonymous-denied','wrong-token-denied','foreign-agency-denied','client-provider-overrides-denied','private-script',
      'private-audio-hash-readback','manual-provenance','replay-without-provider','pause-blocks-prepare','paused-read-remains-available','persistent-call-count']};
  await writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{await mf.dispose();await rm(directory,{recursive:true,force:true});}
