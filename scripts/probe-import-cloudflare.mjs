import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {randomUUID,createHash} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import sharp from 'sharp';
import {remoteSql} from './cloudflare-operator.mjs';
const folder='evidence/remote/imports-cloudflare',base='https://bienvu.online',service='https://bienvu-import-staging.alexlevy0.workers.dev';
await mkdir(folder,{recursive:true});
const [step,name]=process.argv.slice(2);
const secrets=await readFile('apps/pipeline/.dev.vars.import.staging','utf8');
const probe=secrets.match(/^PROBE_TOKEN=(.+)$/m)?.[1];assert.ok(probe?.length>=32);
const state=['import','manual','gates'].includes(step) ? JSON.parse(await readFile('evidence/remote/sprint-02-acceptance/accounts-fixture.json','utf8')) : {users:[]};
const [a,b]=state.users;
const q=x=>`'${String(x).replaceAll("'","''")}'`;
const save=(file,value)=>writeFile(`${folder}/${file}.json`,JSON.stringify(value,null,2));
const once=async file=>{try{await readFile(`${folder}/${file}.json`);throw new Error('ALREADY_ATTEMPTED: aucune relance automatique');}catch(e){if(e.code!=='ENOENT')throw e;}};
const request=(path,user=a,method='GET',body,extra={})=>fetch(`${base}${path}`,{method,redirect:'manual',signal:AbortSignal.timeout(85000),headers:{origin:base,...(user?{cookie:user.cookie}:{}),...(body!==undefined?{'Content-Type':'application/json'}:{}),...extra},...(body!==undefined?{body:JSON.stringify(body)}:{})});
async function verify(value){
 assert.equal(value.status,'ready');assert.ok(value.listing.photos.length>=3);
 assert.equal((await request(`/api/imports/${value.id}`,b)).status,404);
 const reread=await (await request(`/api/imports/${value.id}`)).json();assert.deepEqual(reread.listing,value.listing);
 for(const photo of value.listing.photos){
  const path=`/api/imports/${value.id}/photos/${photo.id}`;
  assert.equal((await request(path,b)).status,404);assert.equal((await request(path,null)).status,401);
  const response=await request(path);assert.equal(response.status,200);assert.equal(response.headers.get('Cache-Control'),'private, no-store');
  const bytes=Buffer.from(await response.arrayBuffer());assert.equal(createHash('sha256').update(bytes).digest('hex'),photo.contentHash);
  const meta=await sharp(bytes).metadata();assert.equal(meta.format,'jpeg');assert.equal(meta.exif,undefined);assert.ok(meta.width>=640&&meta.width<=2048);
  if(photo.sourceOrder<3)await writeFile(`${folder}/${value.id}-${photo.sourceOrder}.jpg`,bytes);
 }
 const [stored]=await remoteSql(`SELECT description_json FROM listings WHERE id=${q(value.id)}`);
 assert.deepEqual(JSON.parse(stored.description_json),value.listing.description);
 return {privateR2Readback:true,sha256Matches:true,jpegDecoded:true,otherAgencyDenied:true,descriptionPersisted:true};
}
if(step==='fixtures'){
 for(const [index,background] of ['#305c52','#ad674b','#d5ccad'].entries()){
  const file=`${folder}/photo-${index+1}.jpg`;await writeFile(file,await sharp({create:{width:960,height:640,channels:3,background}}).jpeg().toBuffer());
  await promisify(execFile)('pnpm',['exec','wrangler','r2','object','put',`bienvu-s00-private/probes/import-fixtures/photo-${index+1}.jpg`,'--file',file,'--content-type','image/jpeg','--remote','--config','apps/pipeline/wrangler.staging.import.jsonc']);
 }console.log('Trois photos synthétiques de recette téléversées.');
}else if(step==='operator'){
 assert.ok(['success','exception','timeout','late-launch','network'].includes(name));const file=`operator-${name}`;await once(file);await save(file,{at:new Date().toISOString(),attempted:true});
 const res=await fetch(`${service}/operator/probe/${name}`,{method:'POST',headers:{Authorization:`Bearer ${probe}`},signal:AbortSignal.timeout(90000)});
 const data=await res.json();await save(file,{httpStatus:res.status,...data});console.log(data);assert.equal(res.status,200);assert.equal(data.passed,true);
}else if(step==='status'){
 for(const path of ['state','browser-status']){
  const r=await fetch(`${service}/operator/${path}`,{headers:{Authorization:`Bearer ${probe}`}});const data=await r.json();await save(`${path}-${Date.now()}`,data);console.log(path,data);
 }
 console.log(await remoteSql("SELECT month,baseline_cents,ceiling_cents,paused,(SELECT coalesce(sum(reserved_cents),0) FROM hosted_import_costs c WHERE c.month=b.month) reserved FROM hosted_import_budget b;"));
}else if(step==='import'){
 const samples={
 'espaces-atypiques':'https://www.espaces-atypiques.com/ventes/69007-lyon-ancien-renove-au-coeur-du-7eme-14713/',
 orpi:'https://www.orpi.com/annonce-vente-appartement-t2-paris-12-75012-ddbf1828-1eb9-4ebe-885c-85f7e30057f1/',
 century21:'https://www.century21.fr/trouver_logement/detail/16965965448/',
 javascript:`${service}/fixtures/js-listing`,
 };assert.ok(samples[name]);const file=`import-${name}`;await once(file);
 const report={at:new Date().toISOString(),name,url:samples[name],source:name==='javascript'?'synthetic-fixture':'real-public-agency',idempotencyKey:randomUUID()};await save(file,report);
 const started=Date.now(),res=await request('/api/imports',a,'POST',{url:samples[name]},{'Idempotency-Key':report.idempotencyKey});
 const value=await res.json();Object.assign(report,{httpStatus:res.status,durationMs:Date.now()-started,result:value});await save(file,report);assert.equal(res.status,200);
 if(value.status==='ready')report.checks=await verify(value);else{assert.equal(value.status,'failed');assert.ok(value.errorCode);assert.equal(value.listing,null);}
 const again=await request('/api/imports',a,'POST',{url:samples[name]},{'Idempotency-Key':report.idempotencyKey});assert.equal((await again.json()).id,value.id);
 const [metrics]=await remoteSql(`SELECT diagnostics_json FROM listing_imports WHERE id=${q(value.id)}`);report.diagnostics=JSON.parse(metrics.diagnostics_json);
 await save(file,report);console.log({name,status:value.status,code:value.errorCode,photos:value.listing?.photos.length,durationMs:report.durationMs,diagnostics:report.diagnostics});
}else if(step==='manual'){
 await once('manual');const images=await Promise.all([1,2,3].map(n=>readFile(`${folder}/photo-${n}.jpg`)));
 const input={title:'RECETTE SYNTHÉTIQUE — saisie manuelle',propertyType:'apartment',transaction:'rent',locality:'Ville de recette',description:'Description saisie à la main.\n\nDeuxième paragraphe.',priceCents:95000,charges:'included',area:42.5,rooms:2,
 photos:images.map(bytes=>({size:bytes.length,mime:'image/jpeg',hash:createHash('sha256').update(bytes).digest('hex')}))};
 const key=randomUUID(),report={at:new Date().toISOString(),source:'synthetic-manual-fixture',idempotencyKey:key};await save('manual',report);
 const start=Date.now(),response=await request('/api/imports/manual',a,'POST',input,{'Idempotency-Key':key});const value=await response.json();Object.assign(report,{startStatus:response.status,id:value.id});await save('manual',report);assert.equal(response.status,201);
 const upload=(index,user,bytes=images[index])=>fetch(`${base}/api/imports/${value.id}/uploads/${index}`,{method:'PUT',headers:{origin:base,cookie:user.cookie,'Content-Type':'image/jpeg'},body:bytes,signal:AbortSignal.timeout(60000)});
 assert.equal((await upload(0,b)).status,404);assert.equal((await upload(0,a,images[1])).status,422);
 for(const index of [0,1,2])assert.equal((await upload(index,a)).status,200);
 assert.equal((await upload(0,a)).status,200);
 assert.equal((await request(`/api/imports/${value.id}/complete`,b,'POST')).status,404);
 const finish=await request(`/api/imports/${value.id}/complete`,a,'POST');const saved=await finish.json();assert.equal(finish.status,200);
 assert.equal(saved.listing.facts.title.status,'user_provided');assert.equal(saved.listing.description.text,input.description);
 report.result=saved;report.checks=await verify(saved);report.durationMs=Date.now()-start;await save('manual',report);console.log({manual:'ready',photos:saved.listing.photos.length,checks:report.checks,durationMs:report.durationMs});
}else if(step==='gates'){
 assert.equal((await request('/api/imports',null,'POST',{url:'https://example.com'})).status,401);
 assert.equal((await request('/api/imports',a,'POST',{url:'https://example.com'},{origin:'https://evil.example'})).status,403);
 assert.equal((await request('/api/imports',a,'POST',{url:'https://127.0.0.1/'},{'Idempotency-Key':randomUUID()})).status,422);
 assert.equal((await fetch(`${service}/resource`,{method:'POST',body:'{}'})).status,401);
 await save('gates',{at:new Date().toISOString(),checks:['session','csrf','private-url','private-service-auth']});console.log('Quatre garde-fous distants vérifiés.');
}else throw new Error('Étape inconnue');
