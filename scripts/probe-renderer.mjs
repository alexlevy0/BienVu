import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {writeFile,mkdir} from 'node:fs/promises';
import {setTimeout} from 'node:timers/promises';
import {localSecret,evidence,remoteUrl} from './probe-common.mjs';
const base=process.env.RENDER_PROBE_URL??'http://localhost:8789',remote=remoteUrl(base);
const fixture=process.argv[2]??'short',id=process.argv[3]??`probe-${fixture}-${Date.now()}`;
if(!['short','target'].includes(fixture))throw new Error('Choisir short ou target');
if(!/^[a-z0-9][a-z0-9-]{0,63}$/.test(id))throw new Error('Identifiant de rendu invalide');
if(remote&&!process.env.PROBE_TOKEN)throw new Error('PROBE_TOKEN requis explicitement pour la cible distante');
const token=await localSecret('apps/pipeline/.dev.vars');const headers={Authorization:`Bearer ${token}`,'Content-Type':'application/json'};
const started=Date.now();
const report={at:new Date(started).toISOString(),target:base,id,fixture,environment:remote?'cloudflare-container-probe':'local-container-probe',pass:false,actualBilledEur:remote?null:0};
const send=(path,init={})=>fetch(`${base}${path}`,{headers,signal:AbortSignal.timeout(15_000),...init});
try {
  assert.equal((await send('/state',{headers:{}})).status,401);
  const initialResponse=await send('/state');assert.ok(initialResponse.ok);
  report.initial=await initialResponse.json();
  if(!report.initial.budget){
    if(remote)throw new Error('Initialiser le budget distant après contrôle des dépenses');
    const initialized=await send('/budget',{method:'PUT',body:JSON.stringify({fixedAndOtherCents:0})});assert.equal(initialized.status,201);
  }
  const accepted=await send('/jobs',{method:'POST',body:JSON.stringify({id,fixture}),signal:AbortSignal.timeout(180_000)});
  report.receipt=await accepted.json();assert.ok(accepted.ok,JSON.stringify(report.receipt));assert.ok(['rendering','accepted','ready'].includes(report.receipt.status));
  console.log(`Job ${id} accepté. Attente du MP4 vérifié…`);
  const start=Date.now();
  while(Date.now()-start<650_000){
    const response=await send(`/jobs/${id}`);assert.ok(response.ok);report.result=await response.json();
    if(['ready','failed'].includes(report.result.status))break;await setTimeout(4000);
  }
  assert.equal(report.result?.status,'ready',JSON.stringify(report.result));
  const download=await send(`/jobs/${id}/file`,{signal:AbortSignal.timeout(60_000)});assert.ok(download.ok);
  const data=Buffer.from(await download.arrayBuffer());assert.equal(data.length,report.result.report.sizeBytes);
  assert.equal(createHash('sha256').update(data).digest('hex'),report.result.report.sha256);
  const dir=`evidence/${remote?'remote':'local'}`;await mkdir(dir,{recursive:true});await writeFile(`${dir}/${id}.mp4`,data);
  report.sha256Verified=true;
  const replay=await send('/jobs',{method:'POST',body:JSON.stringify({id,fixture})});assert.equal(replay.status,200);
  report.replayWithoutNewRender=true;report.pass=true;
} catch(error) {
  // Un timeout ne prouve ni l'arrêt du conteneur, ni l'absence de dépense distante.
  report.error={name:error.name,message:String(error.message).slice(0,1200)};process.exitCode=1;
} finally {
  try {const state=await send('/state');if(state.ok)report.finalState=await state.json();}catch {report.stateUnavailable=true;}
  report.durationMs=Date.now()-started;
  await evidence(`render-${id}-${started}`,report,remote);
}
if(report.pass)console.log('La sonde /state ne réveille pas le conteneur. Vérifier son arrêt après au moins 40 secondes.');
