import {localSecret,evidence,remoteUrl} from './probe-common.mjs';
const base=process.env.BROWSER_PROBE_URL??'http://localhost:8788',remote=remoteUrl(base);
if(remote&&!process.env.PROBE_TOKEN)throw new Error('PROBE_TOKEN requis explicitement pour la cible distante');
const token=await localSecret('apps/pipeline/.dev.vars');
const response=await fetch(`${base}/status`,{headers:{Authorization:`Bearer ${token}`},signal:AbortSignal.timeout(20_000)});
const body=await response.text();
let result;try{result=JSON.parse(body);}catch{result={error:'NON_JSON_RESPONSE',body:body.slice(0,300)};}
await evidence(`browser-status-${Date.now()}`,{at:new Date().toISOString(),target:base,httpStatus:response.status,result},remote);
if(!response.ok)process.exitCode=1;
