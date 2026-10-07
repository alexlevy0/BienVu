import {test,type TestContext} from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {migrateNarrationProbe} from '../scripts/narration-fixtures';
import {normalizePhoto} from '../scripts/import-transport';
import {importSources,defaultVideoCustomization,customizedListing} from '../packages/contracts/src/index';
import {admitAnonymous,anonymousSession,createAnonymousSession,findGeneration,findImport,opaqueHash,trialInput,claimTrial,ensureAgency,creditGrant,failGeneration} from '../packages/db/src/index';
import {selectAdapter} from '../packages/importers/src/index';
import {prepareAnonymousManual,uploadAnonymousManual,completeAnonymousManual} from '../apps/web/lib/anonymous-manual';
import {submitTrialManual,type TrialManualSettings} from '../apps/web/lib/anonymous-manual-client';
import {startTrial,trialSessionResponse,type TrialEnv,type verifyTrialBot} from '../apps/web/lib/trials';
import {RequestFailure,respond} from '../apps/web/lib/http';
import {trialResponse} from '../apps/web/lib/trials';
import {loadGenerationListing} from '../apps/pipeline/src/generation-import';
import {purgeHostedImports} from '../apps/pipeline/src/import-cleanup';
import {cleanupAnonymousTrials} from '../apps/pipeline/src/trial-cleanup';
import {contentHash} from '../apps/web/lib/manual-listings';
import {videoFixture,videoReport} from '../fixtures/video';
import {generationVideo} from '../apps/web/lib/generations';
import {importResult} from '../apps/web/lib/imports';

const base='https://bienvu.example',at=()=>new Date().toISOString();
const seed={title:'Maison à Lyon',locality:'Lyon',propertyType:'house' as const,transaction:'sale' as const,priceCents:20_000_000,area:85,rooms:3,charges:null,description:'Une maison avec un séjour lumineux et un jardin.'};
const settings:TrialManualSettings={subtitlesEnabled:false,voiceEnabled:false,durationSeconds:40,aspectRatio:'16:9',customization:{...defaultVideoCustomization(),photoOrder:[2,0,1]}};
async function setup(t:TestContext){
  const mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:'export default {fetch(){return new Response("fixture")}}',compatibilityDate:'2026-09-27',d1Databases:['DB'],r2Buckets:['MEDIA']}));
  t.after(()=>mf.dispose());const bindings=await mf.getBindings<{DB:D1Database;MEDIA:R2Bucket}>();await migrateNarrationProbe(bindings.DB);
  await bindings.DB.exec('UPDATE trial_policy SET enabled=1,free_enabled=1; UPDATE generation_control SET enabled=1');
  await bindings.DB.prepare('INSERT INTO hosted_import_budget VALUES(?,0,9000,0)').bind(at().slice(0,7)).run();
  const env={...bindings,PROBE_MODE:'remote',IMPORT_MODE:'cloudflare',BETTER_AUTH_URL:base,BETTER_AUTH_SECRET:'s'.repeat(32),GENERATIONS_ENABLED:'true',ANONYMOUS_TRIALS_ENABLED:'true',
    TURNSTILE_SITE_KEY:'fixture-key',TURNSTILE_SECRET_KEY:'fixture-secret',TRIAL_IP_HMAC_SECRET:'i'.repeat(32),IMPORT_TOKEN:'t'.repeat(32),
    IMPORT_SERVICE:{fetch:async()=>{throw new Error('UNEXPECTED_NETWORK');}}} as unknown as TrialEnv;
  const reply=await trialSessionResponse(new Request(base+'/api/trial'),env),cookie=reply.headers.get('set-cookie')!.split(';')[0];
  const session=(await anonymousSession(env.DB,cookie.split('=')[1]))!;
  const headers={Origin:base,Cookie:cookie,'cf-connecting-ip':'203.0.113.5'};
  const files=await Promise.all(['#204f43','#ad674b','#d6ceb1'].map(async background=>new File([await sharp({create:{width:960,height:640,channels:3,background}}).png().toBuffer()],background+'.png',{type:'image/png'})));
  const listing={...seed,photos:await Promise.all(files.map(async file=>({hash:await contentHash(new Uint8Array(await file.arrayBuffer())),size:file.size,mime:'image/png' as const})))};
  const request=(path:string,body?:unknown,key='manual-trial-fixture-key',proof='fixture-token')=>new Request(base+path,{method:'POST',headers:{...headers,'Content-Type':'application/json','Idempotency-Key':key},body:JSON.stringify(body??{listing,turnstileToken:proof})});
  let verifies=0;const verify:typeof verifyTrialBot=async(_env,token)=>{verifies++;if(typeof token!=='string'||!token)throw new RequestFailure('BOT_VERIFICATION_FAILED');return opaqueHash(token);};
  return {env,session,cookie,headers,files,listing,request,verify,verifies:()=>verifies};
}
test('l’essai accepte toutes les sources du registre connecté et conserve les contrôles de route et HTTPS',()=>{
  const urls=[
    'https://www.espaces-atypiques.com/ventes/21200-beaune-propriete-947eb/',
    'https://www.orpi.com/annonce-vente-maison-12345678-1234-1234-1234-123456789012/',
    'https://www.century21.fr/trouver_logement/detail/123456/',
    'https://immobilier.lefigaro.fr/annonces/annonce-123456.html',
    'https://www.seloger.com/annonces/achat/appartement/lyon-69/123456.htm',
    'https://www.leboncoin.fr/ad/ventes_immobilieres/123456',
    'https://www.bienici.com/annonce/vente/lyon/appartement/123456',
    'https://www.ladresse.com/annonce/achat/maison/begles-33130/14649049',
    'https://www.cesaretbrutus.com/bien/vente-dune-maison-de-famille-7-pieces-27165-m%c2%b2-a-limonest-mcl-10287-cesaretbrutus69/',
    'https://www.iadfrance.fr/annonce/appartement-vente-3-pieces-lyon-55m2/r2125326',
    'https://remax.fr/fr/mandats/vente-maison-ch3-charente-maritime---17-etaules/749351027-200',
  ];
  assert.deepEqual(new Set(urls.map(url=>selectAdapter(url).id)),new Set(importSources.map(source=>source.id)));
  for(const url of [...urls,'https://agence.example/annonce/123']){const parsed=trialInput({url});assert.equal('url' in parsed&&parsed.url,url);}
  assert.throws(()=>trialInput({url:'https://www.iadfrance.fr/'}),/NOT_A_LISTING/);
  for(const url of ['http://iadfrance.fr/annonce/123','https://127.0.0.1/private','https://agence.internal/annonce'])assert.throws(()=>trialInput({url}),/INVALID_URL/);
  assert.throws(()=>trialInput({url:urls[0],customization:{...defaultVideoCustomization(),runwayClips:1}}),/RUNWAY_LOGIN_REQUIRED/);
});
test('saisie anonyme : fichiers privés, reprise des uploads, réglages et génération sans session de compte',async t=>{
  const s=await setup(t),{env,session,headers,files,listing,request,verify}=s;
  await assert.rejects(prepareAnonymousManual(new Request(base+'/api/trial/manual',{method:'POST',headers:{Origin:base,'Content-Type':'application/json'},body:JSON.stringify({listing})}),env,true,verify),/NOT_FOUND/);
  await assert.rejects(prepareAnonymousManual(new Request(base+'/api/trial/manual',{method:'POST',headers:{...headers,Origin:'https://attacker.example','Content-Type':'application/json'},body:JSON.stringify({listing})}),env,true,verify),/FORBIDDEN/);
  await assert.rejects(prepareAnonymousManual(request('/api/trial/manual',{listing,turnstileToken:''}),env,true,verify),/BOT_VERIFICATION_FAILED/);
  assert.equal((await env.DB.prepare('SELECT count(*) n FROM listing_imports').first<{n:number}>())!.n,0);
  const prepared=await (await prepareAnonymousManual(request('/api/trial/manual'),env,true,verify)).json() as {id:string};
  const repetitions=await Promise.all([1,2,3].map(()=>prepareAnonymousManual(request('/api/trial/manual'),env,true,verify)));
  assert.ok((await Promise.all(repetitions.map(r=>r.json() as Promise<{id:string}>))).every(r=>r.id===prepared.id));assert.equal(s.verifies(),2);
  assert.equal((await anonymousSession(env.DB,s.cookie.split('=')[1]))!.creditsReserved,0);
  assert.equal((await env.DB.prepare('SELECT count(*) n FROM jobs').first<{n:number}>())!.n,0);
  assert.equal((await env.DB.prepare('SELECT sum(reserved_cents) n FROM hosted_import_costs').first<{n:number}>())!.n,50);
  await assert.rejects(completeAnonymousManual(request(`/api/trial/manual/${prepared.id}/complete`,{}),env,prepared.id),/INSUFFICIENT_PHOTOS/);
  const other=await createAnonymousSession(env.DB),foreignHeaders={...headers,Cookie:`__Host-bienvu-trial=${other.proof}`};
  const upload=(index:number,h=headers)=>new Request(`${base}/api/trial/manual/${prepared.id}/uploads/${index}`,{method:'PUT',headers:{...h,'Content-Type':'image/png'},body:files[index]});
  await assert.rejects(uploadAnonymousManual(upload(0,foreignHeaders),env,prepared.id,'0',normalizePhoto),/NOT_FOUND/);
  await assert.rejects(admitAnonymous(env.DB,other.session,'cross-session-generation',{listingId:prepared.id},{ipHmac:'a'.repeat(64),turnstileHash:'b'.repeat(64)},'true'),/NOT_FOUND/);
  let interrupt=true;
  const broken={...env,MEDIA:{head:env.MEDIA.head.bind(env.MEDIA),put:async(...args:Parameters<R2Bucket['put']>)=>{if(interrupt){interrupt=false;throw new Error('UPLOAD_INTERRUPTED');}return env.MEDIA.put(...args);}}} as TrialEnv;
  await assert.rejects(uploadAnonymousManual(upload(0),broken,prepared.id,'0',normalizePhoto),/UPLOAD_INTERRUPTED/);
  const progress:string[]=[],calls:string[]=[];
  const fetcher:typeof fetch=async(target,init)=>{
    const path=String(target),req=new Request(base+path,{...init,headers:{...Object.fromEntries(new Headers(init?.headers)),...headers}});calls.push(path);
    return respond(()=>trialResponse(async()=>{
      if(path==='/api/trial/manual')return prepareAnonymousManual(req,env,true,verify);
      const slot=/\/uploads\/(\d+)$/.exec(path);if(slot)return uploadAnonymousManual(req,env,prepared.id,slot[1],normalizePhoto);
      if(path.endsWith('/complete'))return completeAnonymousManual(req,env,prepared.id);
      return startTrial(req,env,true,verify);
    }));
  };
  const intent={fingerprint:'fixture',key:'manual-trial-fixture-key'};
  const job=await submitTrialManual({listing,photos:files},settings,intent,'',message=>progress.push(message),fetcher);
  assert.equal(s.verifies(),2,'la preuve vérifiée avant les uploads sert aussi au lancement');
  assert.equal(job.status,'queued');assert.equal(job.ownership,'anonymous');assert.equal(job.sourceKind,'manual');assert.equal(job.downloadUrl,null);assert.equal(job.masterAccess,'locked');
  const row=(await findGeneration(env.DB,session.scopeId,job.id))!;
  const stored=JSON.parse(row.input);assert.equal(stored.listingId,prepared.id);assert.equal(stored.voiceEnabled,false);assert.equal(stored.subtitlesEnabled,false);assert.equal(stored.durationSeconds,40);assert.equal(stored.aspectRatio,'16:9');
  let network=0;const loaded=await loadGenerationListing({...env,IMPORT_TOKEN:'t'.repeat(32),IMPORT_SERVICE:{fetch:async()=>{network++;throw 0;}} as unknown as Fetcher},row);
  const saved=importResult(await findImport(env.DB,session.scopeId,prepared.id)).listing!,selected=customizedListing(saved,settings.customization);
  assert.equal(network,0);assert.equal(loaded.listingId,prepared.id);assert.equal(saved.facts.rooms?.value,3);assert.equal(saved.description?.text,seed.description);assert.equal(selected.photos[0].id,`${prepared.id}_2`);
  assert.ok(progress.some(p=>p.includes('3/3')));
  const replay=await submitTrialManual({listing,photos:files},settings,intent,'',()=>{},fetcher);assert.equal(replay.id,job.id);
  assert.equal(calls.filter(path=>path.includes('/uploads/')).length,3);assert.equal(s.verifies(),2);
  assert.equal((await anonymousSession(env.DB,s.cookie.split('=')[1]))!.creditsReserved,1);
  await assert.rejects(startTrial(request('/api/trial',{listingId:prepared.id,...settings,voiceEnabled:true}),env,true,verify),/CONFLICT/);
  await assert.rejects(startTrial(request('/api/trial',{listingId:prepared.id,customization:{...defaultVideoCustomization(),runwayPhotos:[0]}}),env,true,verify),/RUNWAY_LOGIN_REQUIRED/);
  await assert.rejects(startTrial(new Request(base+'/api/trial',{method:'POST',headers:{...foreignHeaders,'Content-Type':'application/json','Idempotency-Key':'foreign-fixture-start'},body:JSON.stringify({listingId:prepared.id})}),env,true,verify),/NOT_FOUND/);
  const f=await videoFixture('anonymous'),master=new Uint8Array([1,2,3]),preview=new Uint8Array([4,5,6]);
  const masterKey=`agencies/${session.scopeId}/jobs/${job.id}/video/master.mp4`,previewKey=`agencies/${session.scopeId}/jobs/${job.id}/video/preview.mp4`,report=videoReport('d'.repeat(64),f.manifest,master);
  await env.MEDIA.put(masterKey,master,{httpMetadata:{contentType:'video/mp4'},customMetadata:{sha256:report.sha256}});
  await env.MEDIA.put(previewKey,preview,{httpMetadata:{contentType:'video/mp4'},customMetadata:{sha256:await contentHash(preview)}});
  await env.DB.batch([
    env.DB.prepare('INSERT INTO generation_artifacts VALUES(?,?,?,?)').bind(job.id,masterKey,JSON.stringify(report),at()),
    env.DB.prepare('INSERT INTO generation_previews VALUES(?,?,?,?)').bind(job.id,previewKey,JSON.stringify({...report,watermarked:true,sizeBytes:3,sha256:await contentHash(preview)}),at()),
    env.DB.prepare("UPDATE jobs SET status='ready',lease_until=NULL,updated_at=? WHERE id=?").bind(at(),job.id),
  ]);
  assert.equal((await anonymousSession(env.DB,s.cookie.split('=')[1]))!.creditsConsumed,1);
  await assert.rejects(prepareAnonymousManual(request('/api/trial/manual',undefined,'second-manual-project','new-token'),env,true,verify),/TRIAL_USED/);
  await assert.rejects(generationVideo(new Request(base),env,session.scopeId,job.id),/NOT_FOUND/);
  await env.DB.prepare('INSERT INTO auth_user VALUES(?,?,?,1,NULL,?,?)').bind('manual-owner','Owner','owner@example.com',Date.now()-1000,Date.now()).run();
  const agency=await ensureAgency(env.DB,{id:'manual-owner',email:'owner@example.com'});await claimTrial(env.DB,session,agency.id,job.id);
  assert.equal((await creditGrant(env.DB,agency.id))!.remaining,3);
  assert.deepEqual(new Uint8Array(await (await generationVideo(new Request(base),env,agency.id,job.id)).arrayBuffer()),master);
  await cleanupAnonymousTrials(env,Date.now()+32*86400_000);assert.ok(await findImport(env.DB,session.scopeId,prepared.id));assert.ok(await env.MEDIA.head(masterKey));
});
test('uploads anonymes : plafond atomique, expiration, nettoyage et quotas conservés après purge',async t=>{
  const s=await setup(t),{env,request,verify,headers,files}=s;
  await env.DB.exec('UPDATE trial_policy SET session_daily=2');
  const first=await (await prepareAnonymousManual(request('/api/trial/manual'),env,true,verify)).json() as {id:string};
  const replies=await Promise.allSettled(['a','b','c'].map(label=>prepareAnonymousManual(request('/api/trial/manual',undefined,'second-fixture-key-'+label,'token-'+label),env,true,verify)));
  assert.equal(replies.filter(r=>r.status==='fulfilled').length,1);assert.equal(replies.filter(r=>r.status==='rejected').length,2);
  const upload=new Request(base+`/api/trial/manual/${first.id}/uploads/0`,{method:'PUT',headers:{...headers,'Content-Type':'image/png'},body:files[0]});
  await uploadAnonymousManual(upload,env,first.id,'0',normalizePhoto);
  await env.DB.prepare('UPDATE listing_imports SET lease_until=? WHERE id=?').bind(new Date(Date.now()-400_000).toISOString(),first.id).run();
  await assert.rejects(uploadAnonymousManual(upload,env,first.id,'0',normalizePhoto),/CONFLICT/);
  assert.equal((await purgeHostedImports(env)).removed,1);
  assert.equal((await env.MEDIA.list({prefix:`agencies/${s.session.scopeId}/imports/${first.id}/`})).objects.length,0);
  await assert.rejects(prepareAnonymousManual(request('/api/trial/manual',undefined,'after-purge-fixture-key','after-purge-token'),env,true,verify),/TRIAL_LIMIT/);
  await cleanupAnonymousTrials(env,Date.now()+3*86400_000);
  const privateData=await env.DB.prepare('SELECT ip_hmac,turnstile_hash,input_json FROM anonymous_manual_imports WHERE import_id=?').bind(first.id).first();
  assert.deepEqual(privateData,{ip_hmac:null,turnstile_hash:null,input_json:'{}'});
});
test('une preuve manuelle expirée doit être renouvelée ; un échec rend le crédit et garde les photos pour réessayer',async t=>{
  const s=await setup(t),{env,request,verify,headers,files}=s;
  const first=await (await prepareAnonymousManual(request('/api/trial/manual'),env,true,verify)).json() as {id:string};
  for(const [index,file] of files.entries())await uploadAnonymousManual(new Request(base+`/api/trial/manual/${first.id}/uploads/${index}`,{
    method:'PUT',headers:{...headers,'Content-Type':'image/png'},body:file}),env,first.id,String(index),normalizePhoto);
  await completeAnonymousManual(request(`/api/trial/manual/${first.id}/complete`,{}),env,first.id);
  await env.DB.prepare('UPDATE anonymous_manual_imports SET verified_until=? WHERE import_id=?').bind(new Date(Date.now()-1000).toISOString(),first.id).run();
  await assert.rejects(startTrial(request('/api/trial',{listingId:first.id,...settings,turnstileToken:''}),env,true,verify),/BOT_VERIFICATION_FAILED/);
  assert.equal((await env.DB.prepare('SELECT count(*) n FROM jobs').first<{n:number}>())!.n,0);
  const job=await (await startTrial(request('/api/trial',{listingId:first.id,...settings,turnstileToken:'renewed-proof'}),env,true,verify)).json() as {id:string};
  const row=(await findGeneration(env.DB,s.session.scopeId,job.id))!;await failGeneration(env.DB,row,'GENERATION_FAILED');
  assert.equal((await anonymousSession(env.DB,s.cookie.split('=')[1]))!.creditsReserved,0);
  const retry=await (await startTrial(request('/api/trial',{listingId:first.id,...settings,turnstileToken:'retry-proof'},'manual-generation-retry-key'),env,true,verify)).json() as {id:string};
  assert.notEqual(retry.id,job.id);assert.equal((await findImport(env.DB,s.session.scopeId,first.id))!.status,'ready');
  assert.equal((await env.DB.prepare('SELECT count(*) n FROM anonymous_manual_imports').first<{n:number}>())!.n,1);
});
