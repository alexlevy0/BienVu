import {localSecret,evidence,remoteUrl} from './probe-common.mjs';
const base=process.env.BROWSER_PROBE_URL??'http://localhost:8788',remote=remoteUrl(base),name=process.argv[2];
if(!['agency','figaro','agency-gallery-check','agency-static-check','agency-keepalive-check'].includes(name))throw new Error('Cas navigateur non reconnu');
if(remote&&!process.env.PROBE_TOKEN)throw new Error('PROBE_TOKEN requis explicitement pour la cible distante');
const token=await localSecret('apps/pipeline/.dev.vars');
const run=Date.now();
try {
  const response=await fetch(`${base}/probe`,{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({case:name}),signal:AbortSignal.timeout(100_000)});
  await evidence(`browser-${name}-${run}`,{at:new Date().toISOString(),target:base,httpStatus:response.status,result:await response.json()},remote);
  if(!response.ok)process.exitCode=1;
} catch(error) {
  await evidence(`browser-${name}-${run}`,{at:new Date().toISOString(),target:base,error:'PROBE_TRANSPORT_FAILED',errorName:error.name,sourceOutcome:'unknown',durationMs:Date.now()-run,actualBilledEur:remote?null:0},remote);
  process.exitCode=1;
}
