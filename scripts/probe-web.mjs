import assert from 'node:assert/strict';
import {localSecret,evidence,remoteUrl} from './probe-common.mjs';
const base=process.env.WEB_PROBE_URL??'http://localhost:8787',remote=remoteUrl(base);
if(remote&&!process.env.PROBE_TOKEN)throw new Error('PROBE_TOKEN requis explicitement pour la cible distante');
const token=await localSecret('apps/web/.dev.vars');const headers={Authorization:`Bearer ${token}`};
const checks=[];let cookie;
try {
  assert.equal((await fetch(`${base}/api/probe`)).status,401);checks.push('sans secret : 401');
  assert.equal((await fetch(`${base}/api/probe`,{headers})).status,401);checks.push('sans cookie : 401');
  const created=await fetch(`${base}/api/probe`,{method:'POST',headers});assert.equal(created.status,201);
  const setCookie=created.headers.get('set-cookie');assert.match(setCookie,/HttpOnly/i);assert.match(setCookie,/Secure/i);assert.match(setCookie,/SameSite=strict/i);
  cookie=setCookie.split(';')[0];assert.equal((await created.json()).ok,true);checks.push('D1/R2 écrits, cookie HttpOnly Secure Strict');
  const read=await fetch(`${base}/api/probe`,{headers:{...headers,Cookie:cookie}});assert.equal(read.status,200);assert.equal((await read.json()).ok,true);checks.push('cookie relu, D1/R2 concordants');
  const foreign=await fetch(`${base}/api/probe`,{headers:{...headers,Cookie:'bienvu_probe=unknown'}});assert.equal(foreign.status,404);checks.push('cookie inconnu : 404');
} finally {if(cookie){const cleaned=await fetch(`${base}/api/probe`,{method:'DELETE',headers:{...headers,Cookie:cookie}});assert.equal(cleaned.status,200);checks.push('artefacts de sonde nettoyés');}}
await evidence('web-probe',{at:new Date().toISOString(),target:base,environment:remote?'cloudflare-remote':'workerd-local',checks,pass:true},remote);
