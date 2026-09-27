// Sonde Node/Docker sans Worker ; ne valide pas Containers ni R2.
import assert from 'node:assert/strict';
import {setTimeout} from 'node:timers/promises';
import {localSecret,evidence} from './probe-common.mjs';
const base='http://localhost:8080';
const headers={Authorization:`Bearer ${await localSecret('apps/pipeline/.dev.vars','RENDER_TOKEN')}`,'Content-Type':'application/json'};
const id=`node-${Date.now()}`;
assert.equal((await fetch(`${base}/health`)).status,401);
const create=()=>fetch(`${base}/jobs`,{method:'POST',headers,body:JSON.stringify({id,fixture:'short'})});
const response=await create();assert.equal(response.status,202);
const replay=await create();assert.equal(replay.status,202);
const conflict=await fetch(`${base}/jobs`,{method:'POST',headers,body:JSON.stringify({id,fixture:'target'})});assert.equal(conflict.status,409);
const competing=await fetch(`${base}/jobs`,{method:'POST',headers,body:JSON.stringify({id:`${id}-other`,fixture:'short'})});assert.equal(competing.status,409);
let result;const start=Date.now();while(Date.now()-start<600_000){result=await (await fetch(`${base}/jobs/${id}`,{headers})).json();if(['ready','failed'].includes(result.status))break;await setTimeout(3000);}
assert.equal(result?.status,'ready');
const file=await fetch(`${base}/jobs/${id}/file`,{headers});assert.ok(file.ok);assert.equal(Number(file.headers.get('content-length')),result.report.sizeBytes);await file.body.cancel();
await evidence('render-server',{at:new Date().toISOString(),environment:'local-node-http',checks:['secret required','202 before completion','idempotent replay','payload conflict rejected','concurrent job rejected','ready after MP4 verification'],result,pass:true});
