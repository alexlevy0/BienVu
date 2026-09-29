import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import sharp from 'sharp';
const sprint04=process.argv.includes('--portals');
const folder=sprint04?'evidence/local/sprint-04/container':'evidence/remote/imports-cloudflare';
await mkdir(folder,{recursive:true});
const secret=(await readFile('apps/pipeline/.dev.vars.import.staging','utf8')).match(/^IMPORT_TOKEN=(.+)$/m)?.[1];
assert.ok(secret?.length>=32);
const run=(args)=>{const r=spawnSync('/usr/local/bin/docker',args,{encoding:'utf8',env:{...process.env,IMPORT_TOKEN:secret}});if(r.status!==0)throw new Error(r.stderr);return r.stdout.trim();};
const id=run(['run','-d','--rm','--platform','linux/amd64','--name','bienvu-import-recipe','-p','127.0.0.1::8080','-e','IMPORT_TOKEN',sprint04?'bienvu-importer:sprint-04':'bienvu-importer:sprint-03','node','--import','tsx','apps/importer/src/server.ts']);
const checks=[],started=Date.now();
try {
 const base='http://'+run(['port',id,'8080/tcp']);
 const headers={Authorization:`Bearer ${secret}`};
 let ready=false;
 for(let i=0;i<200;i++){try{ready=(await fetch(base+'/health',{headers,signal:AbortSignal.timeout(1000)})).ok;}catch{} if(ready)break;await new Promise(r=>setTimeout(r,200));}
 assert.ok(ready,'container health');
 assert.equal((await fetch(base+'/health')).status,401);checks.push('authentification du transport');
 const jpg=await sharp({create:{width:960,height:640,channels:3,background:'#305c52'}}).png().toBuffer();
 const response=await fetch(base+'/normalize-photo',{method:'POST',headers:{...headers,'Content-Type':'image/png'},body:jpg});
 assert.equal(response.status,200);const meta=await sharp(Buffer.from(await response.arrayBuffer())).metadata();assert.equal(meta.format,'jpeg');assert.equal(meta.width,960);assert.equal(meta.exif,undefined);checks.push('vrai décodage PNG vers JPEG sans métadonnées');
 for(const bytes of [Buffer.from('<svg/>'),await sharp({create:{width:5000,height:5000,channels:3,background:'white'}}).png().toBuffer()]) {
  assert.equal((await fetch(base+'/normalize-photo',{method:'POST',headers:{...headers,'Content-Type':'image/png'},body:bytes})).status,422);
 }checks.push('fichier invalide et image 25 mégapixels refusés');
 for(const url of ['https://127.0.0.1/','https://[::1]/','https://localtest.me/']){
  const r=await fetch(base+'/resource',{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify({url,kind:'page',hosts:[new URL(url).hostname],maxBytes:10000})});
  assert.equal(r.status,422);assert.equal(r.headers.get('X-Import-Error'),'UNSAFE_URL');
 }checks.push('IP privées IPv4/IPv6 et vraie résolution DNS loopback refusées');
 await mkdir(folder,{recursive:true});await writeFile(`${folder}/container-local.json`,JSON.stringify({at:new Date().toISOString(),mode:'local-docker-amd64',source:'synthetic-images + actual DNS, no agency import',checks,durationMs:Date.now()-started},null,2));console.log(checks);
} finally {await writeFile(`${folder}/container-local.log`,run(['logs',id]));run(['stop','-t','2',id]);}
