import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdtemp,readFile,readdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const exec=promisify(execFile);
test('fixture HTTP : un rendu échoué conserve le reçu et la dépense réservée dans les preuves',async()=>{
  const directory=await mkdtemp(path.join(tmpdir(),'bienvu-ledger-'));
  const id='fixture-failed-render';let creations=0;
  const server=createServer((request,response)=>{
    response.setHeader('content-type','application/json');
    if(!request.headers.authorization){response.writeHead(401);response.end('{}');return;}
    if(request.url==='/state')response.end(JSON.stringify({container:{status:'stopped'},budget:{attempts:1,committedCents:50}}));
    else if(request.url==='/jobs'&&request.method==='POST'){
      creations++;response.writeHead(202);response.end(JSON.stringify({id,status:'rendering'}));
    }else if(request.url===`/jobs/${id}`)response.end(JSON.stringify({id,status:'failed',error:'RENDER_FAILED',report:{synthetic:true}}));
    else{response.writeHead(404);response.end('{}');}
  });
  try{
    await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
    const address=server.address();assert.ok(address&&typeof address!=='string');
    const script=fileURLToPath(new URL('../scripts/probe-renderer.mjs',import.meta.url));
    await assert.rejects(exec(process.execPath,[script,'short',id],{
      cwd:directory,env:{...process.env,PROBE_TOKEN:'fixture-only-token-not-a-secret-0000',RENDER_PROBE_URL:`http://127.0.0.1:${address.port}`},timeout:30_000,
    }),(error:unknown)=>(error as {code:unknown}).code===1);
    const evidence=path.join(directory,'evidence/local');const files=await readdir(evidence);assert.equal(files.length,1);
    const report=JSON.parse(await readFile(path.join(evidence,files[0]),'utf8'));
    assert.equal(report.pass,false);assert.equal(report.receipt.status,'rendering');assert.equal(report.result.error,'RENDER_FAILED');
    assert.equal(report.finalState.budget.committedCents,50);assert.equal(creations,1);
    assert.equal(report.sha256Verified,undefined);assert.equal(JSON.stringify(report).includes('fixture-only-token'),false);
  }finally{
    await new Promise<void>(resolve=>server.close(()=>resolve()));
    await rm(directory,{recursive:true,force:true});
  }
});
