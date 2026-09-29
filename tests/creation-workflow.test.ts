import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import sharp from 'sharp';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {extractDescription,validateExtraction} from '../packages/narration/src/extraction';
import {createPrivateImport,importResult,privateImportPhoto,purgeImport} from '../apps/web/lib/imports';
import {startManualCreationDraft,patchCreationDraft,uploadCreationPhoto,removeCreationPhoto,finishCreationDraft} from '../apps/web/lib/creation-drafts';
import {saveProblemReport} from '../apps/web/lib/problem-reports';
import {findImport,listImports} from '../packages/db/src/imports';
import {normalizePhoto} from '../scripts/import-transport';
import {fixtureImportTransport} from '../scripts/import-fixtures';
import type {ImportTransport} from '../packages/importers/src/network';
import {RequestFailure} from '../apps/web/lib/http';
import {describeGuest} from '../apps/web/lib/guest-extraction';
import {createAnonymousSession} from '../packages/db/src/anonymous';
import type {GenerationRow} from '../packages/db/src/generation';

const sample='Appartement à vendre à Lyon 6, 65 m², 3 pièces, 280 000 €, avec terrasse.';
const extracted={fields:{propertyType:'apartment',transaction:'sale',locality:'Lyon 6e',priceCents:28000000,charges:null,area:65,rooms:3},
  evidence:{propertyType:'Appartement',transaction:'à vendre',locality:'Lyon 6',priceCents:'280 000 €',charges:null,area:'65 m²',rooms:'3 pièces'},ambiguous:[]};
const errorCode=(code:string)=>(e:unknown)=>e instanceof RequestFailure&&e.code===code;

test('extraction structurée : faits sourcés, absent et contradiction sans inventer',async()=>{
  const data=validateExtraction(sample,extracted);
  assert.equal(data.fields.title,'Appartement 3 pièces à Lyon 6e');
  assert.equal(data.fields.transaction,'sale');assert.equal(data.fields.priceCents,28000000);
  assert.equal(data.fields.area,65);assert.equal(data.fields.rooms,3);
  assert.equal(data.fields.description,sample);assert.equal('bedrooms' in data.fields,false);
  const noPrice=validateExtraction(sample,{...extracted,fields:{...extracted.fields,priceCents:null}});
  assert.equal(noPrice.fields.priceCents,null);
  const falsePrice=validateExtraction(sample,{...extracted,fields:{...extracted.fields,priceCents:38000000}});
  assert.equal(falsePrice.fields.priceCents,null);
  const uncertain=validateExtraction(sample,{...extracted,ambiguous:['priceCents','locality']});
  assert.equal(uncertain.provenance.priceCents?.confirm,true);
  assert.equal(uncertain.provenance.title?.confirm,true);
  let calls=0;
  const fetcher=(async (_url:string,init?:RequestInit)=>{calls++;
    const body=JSON.parse(String(init?.body));assert.deepEqual(body.tools,[]);assert.equal(body.store,false);
    return Response.json({status:'completed',output:[{type:'message',role:'assistant',status:'completed',content:[{type:'output_text',text:JSON.stringify(extracted)}]}],
      usage:{input_tokens:120,output_tokens:90}});}) as typeof fetch;
  const result=await extractDescription(sample,'sk-test_key_abcdefghijklmnop','gpt-5.4-mini',fetcher);
  assert.equal(calls,1);assert.equal(result.data.fields.locality,'Lyon 6e');assert.deepEqual(result.usage,{inputTokens:120,outputTokens:90});
  await assert.rejects(extractDescription(sample,'sk-test_key_abcdefghijklmnop','gpt-5.4-mini',
    (async()=>Response.json({status:'completed',output:[{type:'message',role:'assistant',status:'completed',content:[{type:'output_text',text:'{}'}]}]})) as typeof fetch));
});

test('brouillon partagé : imports incomplets, uploads immédiats, reprise, isolation et signalements persistés',async t=>{
  const mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:'export default {fetch(){return new Response("test")}}',
    compatibilityDate:'2026-09-27',d1Databases:['DB'],r2Buckets:['MEDIA']}));
  t.after(()=>mf.dispose());const {DB,MEDIA}=await mf.getBindings<Pick<CloudflareEnv,'DB'|'MEDIA'>>(),env={DB,MEDIA};
  for(const file of (await readdir(new URL('../packages/db/migrations/',import.meta.url))).filter(f=>f.endsWith('.sql')).sort())
    await DB.exec((await readFile(new URL(`../packages/db/migrations/${file}`,import.meta.url),'utf8')).replace(/^--.*$/gm,'').replace(/\n/g,' '));
  const at=new Date().toISOString();for(const id of ['workflow-a','workflow-b'])
    await DB.prepare('INSERT INTO agencies(id,owner_user_id,name,created_at,updated_at) VALUES(?,?,?,?,?)').bind(id,id,'Recette',at,at).run();
  const source='https://fixtures.bienvu.example/vente',base=fixtureImportTransport();
  const withoutPhotos:ImportTransport={async load(...args){const value=await base.load(...args);if(args[1]==='page'){
    value.bytes=new TextEncoder().encode(new TextDecoder().decode(value.bytes).replace('"image":["/photos/a.jpg","/photos/b.jpg","/photos/c.jpg"]','"image":[]'));
    value.sourceBytes=value.bytes.length;}return value;}};
  const imported=await createPrivateImport(env,'workflow-a',source,'partial-import-key-001',withoutPhotos);
  const paused=importResult(imported);assert.equal(paused.status,'needs_input');assert.equal(paused.draft?.data.fields.locality,'Ville de recette');
  assert.equal(paused.draft?.photos.length,0);assert.equal(await DB.prepare('SELECT id FROM jobs').first(),null);
  assert.equal((await listImports(DB,'workflow-a')).find(row=>row.id===imported.id)?.status,'needs_input');
  await assert.rejects(privateImportPhoto(env,'workflow-b',imported.id,'any'),errorCode('NOT_FOUND'));
  await assert.rejects(patchCreationDraft(DB,'workflow-b',imported.id,{version:paused.draft!.version,changes:{title:'Autre'},confirm:[]}),errorCode('NOT_FOUND'));
  const replay=await createPrivateImport(env,'workflow-a',source,'partial-import-key-001',{load:async()=>{throw new Error('NETWORK_REIMPORT');}});
  assert.equal(replay.id,imported.id);
  const pictures=await Promise.all(['#224f43','#ad694d','#cdc5a4'].map(async background=>new Uint8Array(await sharp({create:{width:960,height:640,channels:3,background}}).png().toBuffer())));
  const uploadIds=['workflow-upload-0001','workflow-upload-0002','workflow-upload-0003'];
  await uploadCreationPhoto(env,'workflow-a',imported.id,0,uploadIds[0],pictures[0],'image/png',normalizePhoto,AbortSignal.timeout(20_000));
  const original=await findImport(DB,'workflow-a',imported.id);
  await removeCreationPhoto(env,'workflow-a',imported.id,uploadIds[0]);
  await assert.rejects(uploadCreationPhoto(env,'workflow-a',imported.id,0,uploadIds[0],pictures[0],'image/png',normalizePhoto,
    AbortSignal.timeout(20_000)),errorCode('CONFLICT'));
  assert.equal(importResult(await findImport(DB,'workflow-a',imported.id)).draft?.photos.length,0);
  for(let index=0;index<3;index++)await uploadCreationPhoto(env,'workflow-a',imported.id,index,`workflow-retry-000${index+1}`,
    pictures[index],'image/png',normalizePhoto,AbortSignal.timeout(20_000));
  const current=importResult(await findImport(DB,'workflow-a',imported.id)).draft!;
  assert.equal(current.version,paused.draft?.version);assert.equal(current.photos.length,3);
  await assert.rejects(finishCreationDraft(env,'workflow-a',imported.id,current.version+1),errorCode('CONFLICT'));
  const ready=await finishCreationDraft(env,'workflow-a',imported.id,current.version);
  assert.equal(ready.status,'ready');assert.equal((await finishCreationDraft(env,'workflow-a',imported.id,current.version)).id,ready.id);
  assert.equal(importResult(ready).listing?.facts.locality.value,'Ville de recette');
  assert.equal((await DB.prepare('SELECT count(*) n FROM jobs').first<{n:number}>())?.n,0);
  assert.ok(original?.leaseUntil);

  const missingLocality:ImportTransport={async load(...args){const value=await base.load(...args);if(args[1]==='page'){
    value.bytes=new TextEncoder().encode(new TextDecoder().decode(value.bytes).replace('"addressLocality":"Ville de recette"','"addressLocality":""'));
    value.sourceBytes=value.bytes.length;}return value;}};
  const second=importResult(await createPrivateImport(env,'workflow-b',source,'partial-import-key-002',missingLocality));
  assert.equal(second.status,'needs_input');assert.equal(second.draft?.photos.length,3);assert.equal(second.draft?.data.fields.locality,null);
  assert.equal((await listImports(DB,'workflow-b')).find(row=>row.id===second.id)?.previewPhotoId,second.draft?.photos[0].id);
  const repaired=await patchCreationDraft(DB,'workflow-b',second.id,{version:second.draft!.version,changes:{locality:'Lyon 6e'},confirm:[]});
  await assert.rejects(patchCreationDraft(DB,'workflow-b',second.id,{version:second.draft!.version,changes:{title:'Valeur périmée'},confirm:[]}),errorCode('CONFLICT'));
  assert.equal((await finishCreationDraft(env,'workflow-b',second.id,repaired.version)).status,'ready');

  const manual=await startManualCreationDraft(DB,'workflow-a','description-key-001',sample);
  assert.equal(manual.data.originalText,sample);
  const corrected=await patchCreationDraft(DB,'workflow-a',manual.id,{version:manual.version,changes:{locality:'Lyon 6e'},confirm:[]});
  assert.equal((await DB.prepare('SELECT count(*) n FROM reservations').first<{n:number}>())?.n,0);
  assert.equal((await DB.prepare('SELECT count(*) n FROM draft_extract_calls').first<{n:number}>())?.n,0);
  await assert.rejects(patchCreationDraft(DB,'workflow-a',manual.id,{version:manual.version,changes:{locality:'Paris'},confirm:[]}),errorCode('CONFLICT'));
  assert.equal(corrected.data.fields.locality,'Lyon 6e');
  assert.equal(await purgeImport(env,'workflow-a',manual.id,Date.now()+31*86400_000),true);

  const jobId='workflow-job-0001';
  await DB.prepare(`INSERT INTO allocations(id,agency_id,kind,period_key,quota_limit,valid_from,valid_until)
    VALUES('workflow-allocation','workflow-a','trial','lifetime',1,?,?)`)
    .bind(at,new Date(Date.now()+86400_000).toISOString()).run();
  await DB.batch([
    DB.prepare(`INSERT INTO jobs(id,agency_id,listing_id,source_url,idempotency_key,status,stage,reservation_id,created_at,updated_at)
      VALUES(?,?,?,?,'report-key-001','ready','rendering','workflow-reservation',?,?)`).bind(jobId,'workflow-a',ready.id,source,at,at),
    DB.prepare(`INSERT INTO reservations(id,agency_id,job_id,allocation_id,status,created_at,updated_at)
      VALUES('workflow-reservation','workflow-a',?,'workflow-allocation','consumed',?,?)`).bind(jobId,at,at),
  ]);
  const job={jobId,status:'ready'} as GenerationRow;
  const report=await saveProblemReport(DB,job,'agency:workflow-a','report-idempotent-001',{category:'voice',comment:'La voix coupe le dernier mot.'});
  assert.deepEqual(await saveProblemReport(DB,job,'agency:workflow-a','report-idempotent-001',{category:'voice',comment:'La voix coupe le dernier mot.'}),report);
  await assert.rejects(saveProblemReport(DB,job,'agency:workflow-a','report-idempotent-001',{category:'photos',comment:'Autre'}),errorCode('CONFLICT'));
  const persisted=await DB.prepare('SELECT job_id AS jobId,category,comment,status FROM generation_reports WHERE id=?').bind(report.id)
    .first<{jobId:string;category:string;comment:string;status:string}>();
  assert.deepEqual(persisted,{jobId,category:'voice',comment:'La voix coupe le dernier mot.',status:'new'});
  await saveProblemReport(DB,job,'agency:workflow-a','report-idempotent-002',{category:'photos',comment:'La photo est coupée.'});
  await saveProblemReport(DB,job,'agency:workflow-a','report-idempotent-003',{category:'technical',comment:'Lecture interrompue.'});
  await assert.rejects(saveProblemReport(DB,job,'agency:workflow-a','report-idempotent-004',
    {category:'other',comment:'Encore un signalement.'}),errorCode('RATE_LIMITED'));

  await DB.prepare('INSERT INTO hosted_import_budget(month,baseline_cents,ceiling_cents,paused) VALUES(?,0,2500,0)')
    .bind(at.slice(0,7)).run();
  const guest=await createAnonymousSession(DB);let providerCalls=0,verifyCalls=0;
  const guestEnv={DB,MEDIA,PROBE_MODE:'local',BETTER_AUTH_URL:'http://localhost:8787',BETTER_AUTH_SECRET:'s'.repeat(32),
    TRIAL_IP_HMAC_SECRET:'h'.repeat(32),ANONYMOUS_TRIALS_ENABLED:'true',GENERATION_TOKEN:'g'.repeat(32),
    GENERATION_SERVICE:{fetch:async()=>{providerCalls++;return Response.json({data:validateExtraction(sample,extracted)});}}};
  const verify=async()=>{verifyCalls++;return 'test-hash';};
  const guestRequest=(key:string,text=sample)=>new Request('http://localhost:8787/api/trial/describe',{method:'POST',
    headers:{Origin:'http://localhost:8787','Content-Type':'application/json','Idempotency-Key':key,
      Cookie:`bienvu-trial=${guest.proof}`},body:JSON.stringify({text,turnstileToken:'fixture-token'})});
  const first=await describeGuest(guestRequest('guest-extract-key-001'),guestEnv as never,false,verify as never);
  assert.equal((await first.json() as {data:{fields:{rooms:number}}}).data.fields.rooms,3);
  assert.equal((await (await describeGuest(guestRequest('guest-extract-key-001'),guestEnv as never,false,verify as never)).json() as {extraction:string}).extraction,'ready');
  assert.equal(providerCalls,1);assert.equal(verifyCalls,1);
  await assert.rejects(describeGuest(guestRequest('guest-extract-key-001',sample+' autre'),guestEnv as never,false,verify as never),errorCode('CONFLICT'));
  await describeGuest(guestRequest('guest-extract-key-002'),guestEnv as never,false,verify as never);
  await assert.rejects(describeGuest(guestRequest('guest-extract-key-003'),guestEnv as never,false,verify as never),errorCode('RATE_LIMITED'));
  assert.equal(providerCalls,2);assert.equal((await DB.prepare('SELECT baseline_cents AS value FROM hosted_import_budget WHERE month=?')
    .bind(at.slice(0,7)).first<{value:number}>())?.value,10);
  // The pilot ceiling remains binding even when the older hosted ledger has a higher cap.
  await DB.prepare('UPDATE hosted_import_budget SET ceiling_cents=3500 WHERE month=?').bind(at.slice(0,7)).run();
  await DB.prepare('UPDATE trial_policy SET budget_ceiling_cents=10 WHERE id=1').run();
  const otherGuest=await createAnonymousSession(DB);
  await assert.rejects(DB.prepare(`INSERT INTO guest_extract_calls
    (id,session_id,ip_hmac,idempotency_key,text_hash,status,created_at) VALUES(?,?,?,?,?,'pending',?)`)
    .bind(crypto.randomUUID(),otherGuest.session.id,'f'.repeat(64),'budget-check','a'.repeat(64),at).run(),/EXTRACTION_LIMIT/);
  assert.equal((await DB.prepare('SELECT baseline_cents AS value FROM hosted_import_budget WHERE month=?')
    .bind(at.slice(0,7)).first<{value:number}>())?.value,10);
});
