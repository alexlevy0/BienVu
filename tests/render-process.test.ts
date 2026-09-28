import {test} from 'node:test';
import assert from 'node:assert/strict';
import {runBoundedNode} from '../apps/renderer/src/render-process';

test('renderer : un calcul bloqué est tué sans bloquer les réponses du parent',async()=>{
  let ticks=0;const interval=setInterval(()=>ticks++,20);const start=Date.now();
  try{await assert.rejects(runBoundedNode(['-e','while(true) {}'],{timeoutMs:400}),/RENDER_PROCESS_TIMEOUT/);}
  finally{clearInterval(interval);}
  assert.ok(ticks>=5);assert.ok(Date.now()-start<3000);
});
test('renderer : sortie en erreur et annulation explicites, succès distinct',async()=>{
  await runBoundedNode(['-e','process.exit(0)'],{timeoutMs:3000});
  await assert.rejects(runBoundedNode(['-e','console.error("x".repeat(20000));process.exitCode=2'],{timeoutMs:3000}),error=>{
    assert.ok(error instanceof Error);assert.equal(error.message,'RENDER_PROCESS_FAILED');
    assert.ok(error.cause&&typeof error.cause==='object'&&'stderr' in error.cause);
    assert.equal(String(error.cause.stderr).length,4000);return true;
  });
  const abort=new AbortController();const running=runBoundedNode(['-e','setInterval(()=>{},100)'],{timeoutMs:3000,signal:abort.signal});
  abort.abort();await assert.rejects(running,/RENDER_CANCELLED/);
});
