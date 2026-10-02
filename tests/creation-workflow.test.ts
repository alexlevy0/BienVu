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

test('photos du brouillon : réessai après put interrompu, retrait repris après panne R2, aucun PUT tardif rétabli',async t=>{
  const mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:'export default {fetch(){return new Response("test")}}',
    compatibilityDate:'2026-09-27',d1Databases:['DB'],r2Buckets:['MEDIA']}));t.after(()=>mf.dispose());
  const {DB,MEDIA}=await mf.getBindings<Pick<CloudflareEnv,'DB'|'MEDIA'>>(),env={DB,MEDIA};
  for(const file of (await readdir(new URL('../packages/db/migrations/',import.meta.url))).filter(f=>f.endsWith('.sql')).sort())
    await DB.exec((await readFile(new URL(`../packages/db/migrations/${file}`,import.meta.url),'utf8')).replace(/^--.*$/gm,'').replace(/\n/g,' '));
  const at=new Date().toISOString();await DB.prepare("INSERT INTO agencies(id,owner_user_id,name,created_at,updated_at) VALUES('retry-photos','retry-photos','Recette',?,?)").bind(at,at).run();
  const draft=await startManualCreationDraft(DB,'retry-photos','retry-photos-draft-01');
  const bytes=new Uint8Array(await sharp({create:{width:960,height:640,channels:3,background:'#557c6c'}}).png().toBuffer());
  const id='retry-photos-upload-01',signal=new AbortController().signal;
  await assert.rejects(uploadCreationPhoto({DB,MEDIA:{put:async()=>{throw Error('PUT_FAILED');},head:MEDIA.head.bind(MEDIA),delete:MEDIA.delete.bind(MEDIA)}},
    'retry-photos',draft.id,0,id,bytes,'image/png',normalizePhoto,signal),/PUT_FAILED/);
  const photo=await uploadCreationPhoto(env,'retry-photos',draft.id,0,id,bytes,'image/png',normalizePhoto,signal);
  assert.equal((await MEDIA.head(photo.objectKey))?.size,photo.sizeBytes);
  await assert.rejects(removeCreationPhoto({DB,MEDIA:{put:MEDIA.put.bind(MEDIA),head:MEDIA.head.bind(MEDIA),delete:async()=>{throw Error('DELETE_FAILED');}}},
    'retry-photos',draft.id,id),/DELETE_FAILED/);
  assert.ok(await DB.prepare('SELECT id FROM import_objects WHERE id=?').bind(id).first(),'Journal conservé pendant la panne');
  let normalizations=0;const refuseNormalization=async()=>{normalizations++;throw Error('SHOULD_NOT_NORMALIZE');};
  await assert.rejects(uploadCreationPhoto(env,'retry-photos',draft.id,0,id,bytes,'image/png',refuseNormalization,signal),errorCode('CONFLICT'));
  assert.equal(normalizations,0,'La suppression empêche aussi le retour depuis le cache R2');
  await removeCreationPhoto(env,'retry-photos',draft.id,id);
  assert.equal(await MEDIA.head(photo.objectKey),null);assert.equal(await DB.prepare('SELECT id FROM import_objects WHERE id=?').bind(id).first(),null);
  await removeCreationPhoto(env,'retry-photos',draft.id,id);
  const replacement=await uploadCreationPhoto(env,'retry-photos',draft.id,0,'retry-photos-replace-01',bytes,'image/png',normalizePhoto,signal);
  assert.ok(await MEDIA.head(replacement.objectKey));
  // A delete that arrives while R2.put is in progress must win.
  await removeCreationPhoto(env,'retry-photos',draft.id,replacement.id);
  const lateEnv={DB,MEDIA:{head:MEDIA.head.bind(MEDIA),delete:MEDIA.delete.bind(MEDIA),put:async(...args:Parameters<typeof MEDIA.put>)=>{
    const result=await MEDIA.put(...args);await removeCreationPhoto(env,'retry-photos',draft.id,'retry-photos-late-01');return result;}}};
  await assert.rejects(uploadCreationPhoto(lateEnv,'retry-photos',draft.id,0,'retry-photos-late-01',bytes,'image/png',normalizePhoto,signal),errorCode('CONFLICT'));
  assert.equal(JSON.parse((await findImport(DB,'retry-photos',draft.id))!.draftPhotos).length,0);
});

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

test('prix abrégés : conversion exacte, omission récupérée et demande reformulée sans perdre les détails',()=>{
  const supplied=(evidence:string,priceCents:number|null=20_000_000)=>({
    fields:{...extracted.fields,locality:'Lyon',priceCents,area:null,rooms:null},
    evidence:{...extracted.evidence,transaction:'vendre',locality:'Lyon',priceCents:evidence,area:null,rooms:null},ambiguous:[]});
  for(const [amount,cents] of [['200k€',20_000_000],['200K',20_000_000],['200 K euros',20_000_000],
    ['200,5k€',20_050_000],['1,2 M€',120_000_000],['200 000 €',20_000_000],['200000 EUR',20_000_000]] as const){
    const text=`Je voudrais vendre un appartement a Lyon a ${amount}`;
    const data=validateExtraction(text,supplied(amount,cents));
    assert.equal(data.fields.priceCents,cents,amount);assert.equal(data.originalText,text);
    assert.equal(data.fields.area,null);assert.equal(data.fields.rooms,null);
    assert.ok(data.fields.description?.startsWith('Découvrez cet appartement à vendre à Lyon, au prix de '));
    assert.equal(data.fields.description?.includes(amount),false,amount);
  }
  const text='Je voudrais vendre un appartement à Lyon à 200k€ avec un balcon et une cave.';
  const data=validateExtraction(text,supplied('200k€',null));
  assert.equal(data.fields.priceCents,20_000_000);assert.equal(data.provenance.priceCents?.evidence,'200k€');
  assert.equal(data.fields.description?.replace(/\s/g,' '),'Découvrez cet appartement à vendre à Lyon, au prix de 200 000 € avec un balcon et une cave.');
  assert.equal(data.fields.description?.includes('lumineux'),false);assert.equal(data.originalText,text);
  assert.equal(data.provenance.description?.source,'ai');
});

test('prix abrégés : devises, unités, montant ambigu et loyer non mensuel ne deviennent pas un prix certain',()=>{
  const supplied=(priceCents:number|null,evidence:string,ambiguous:string[]=[])=>({
    fields:{...extracted.fields,locality:'Lyon',priceCents,area:null,rooms:null},
    evidence:{...extracted.evidence,transaction:'vendre',locality:'Lyon',priceCents:evidence,area:null,rooms:null},ambiguous});
  for(const amount of ['200k USD','200k$','200k GBP','200k CHF','200 kcal','-200k€','200000 dollars']){
    const text=`Je voudrais vendre un appartement à Lyon à ${amount}`;
    assert.equal(validateExtraction(text,supplied(20_000_000,'200k')).fields.priceCents,null,amount);
  }
  const followers='Je voudrais vendre un appartement à Lyon, mon compte a 200k abonnés.';
  assert.equal(validateExtraction(followers,supplied(null,'200k')).fields.priceCents,null);
  const several='Je voudrais vendre un appartement à Lyon à 200k€ ou 220 000 €.';
  assert.equal(validateExtraction(several,supplied(null,'200k€')).fields.priceCents,null);
  const ambiguous=validateExtraction(several,supplied(20_000_000,'200k€',['priceCents']));
  assert.equal(ambiguous.provenance.priceCents?.confirm,true);assert.equal(ambiguous.provenance.description?.confirm,true);
  assert.ok(ambiguous.fields.description?.includes('200k€ ou 220 000 €'));
  const rent='Je voudrais louer un appartement à Lyon à 200k€ pour l’année.';
  const rental=supplied(null,'200k€');rental.fields.transaction='rent';rental.evidence.transaction='louer';
  assert.equal(validateExtraction(rent,rental).fields.priceCents,null);
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
