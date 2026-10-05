import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {emptyCreationFields,propertyPrice,propertyCaption,PropertyListingInput,ManualListingInput} from '../packages/contracts/src/index';
import {ensureAgency,admitGeneration,failGeneration,beginManualImport,startCreationDraft,blankCreationDraft} from '../packages/db/src/index';
import {migrateNarrationProbe} from '../scripts/narration-fixtures';
import {fixtureImportTransport} from '../scripts/import-fixtures';
import {createPrivateImport} from '../apps/web/lib/imports';
import {customizeImportedListing,patchCreationDraft} from '../apps/web/lib/creation-drafts';
import {readPropertyGroups,propertyPage,propertyDetail,archiveProperty,propertyPhoto,preparePropertyDraft,findProperty} from '../apps/web/lib/properties';
import {propertyGroups,type PropertyRecord} from '../apps/web/lib/property-catalog';
import {propertyZip} from '../apps/web/lib/property-download';

async function fixture(t:{after(fn:()=>Promise<void>):void}){
  const mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:'export default {fetch(){return new Response("fixture")}}',compatibilityDate:'2026-09-27',d1Databases:['DB'],r2Buckets:['MEDIA']}));
  t.after(()=>mf.dispose());const env=await mf.getBindings<{DB:D1Database;MEDIA:R2Bucket}>();await migrateNarrationProbe(env.DB);
  const at=new Date(Date.now()-1000).toISOString();for(const id of ['property-owner','property-foreign'])await env.DB.prepare('INSERT INTO auth_user(id,name,email,emailVerified,createdAt,updatedAt) VALUES(?,?,?,1,?,?)').bind(id,id,id+'@example.invalid',at,at).run();
  const agency=await ensureAgency(env.DB,{id:'property-owner',email:'property-owner@example.invalid'}),foreign=await ensureAgency(env.DB,{id:'property-foreign',email:'property-foreign@example.invalid'});
  await env.DB.prepare('INSERT INTO hosted_import_budget VALUES(?,0,9500,0)').bind(at.slice(0,7)).run();await env.DB.exec('UPDATE generation_control SET enabled=1; UPDATE trial_policy SET free_enabled=1');
  const imported=await createPrivateImport(env,agency.id,'https://fixtures.bienvu.example/vente','property-source-key00',fixtureImportTransport());
  const draft=await customizeImportedListing(env,agency.id,imported.id,'property-draft-key00',AbortSignal.timeout(20000));
  return {env,agency,foreign,imported,draft,at};
}
test('Mes biens : import, brouillon et export sont regroupés ; données et photos isolées par agence',async t=>{
  const f=await fixture(t),{env,agency,foreign}=f;
  let groups=await readPropertyGroups(env,agency.id);assert.equal(groups.length,1);assert.equal(groups[0].summary.photoCount,3);assert.equal(groups[0].summary.draftCount,1);
  const id=groups[0].summary.id,job=await admitGeneration(env.DB,agency.id,'property-generation-key00',{listingId:f.imported.id,voiceEnabled:false,subtitlesEnabled:false},'true');
  await failGeneration(env.DB,job,'GENERATION_FAILED');
  groups=await readPropertyGroups(env,agency.id);assert.equal(groups.length,1);assert.equal(groups[0].summary.videoCount,1);assert.equal(groups[0].summary.attentionCount,1);
  assert.equal(findProperty(groups,`job:${job.jobId}`).summary.id,id);
  assert.equal(findProperty(groups,encodeURIComponent(id)).summary.id,id);
  const detail=await propertyDetail(env,agency.id,id,null,'Notre agence');assert.equal(detail.jobs[0].id,job.jobId);assert.equal(detail.photos.length,3);assert.equal(detail.drafts[0].id,f.draft.id);assert.ok(detail.caption.includes('Notre agence'));
  assert.equal(detail.property.visualCount,1);assert.equal(detail.property.textCount,1);
  assert.equal((await readPropertyGroups(env,foreign.id)).length,0);await assert.rejects(propertyDetail(env,foreign.id,id,null,'Étranger'),/NOT_FOUND/);
  const photo=await propertyPhoto(env,agency.id,id,detail.photos[0].id,new Request('https://test/photo?download=1'));assert.equal(photo.status,200);assert.match(photo.headers.get('content-disposition')!,/^attachment/);assert.ok((await photo.arrayBuffer()).byteLength>0);
  await assert.rejects(propertyPhoto(env,foreign.id,id,detail.photos[0].id,new Request('https://test/photo')),/NOT_FOUND/);
  await assert.rejects(propertyPhoto(env,agency.id,id,'a'.repeat(64),new Request('https://test/photo')),/NOT_FOUND/);
  assert.equal(JSON.stringify(detail).includes('objectKey'),false);assert.equal(JSON.stringify(detail).includes('input_json'),false);
});
test('Archivage réversible : alias conservés, médias et crédits inchangés, aucune publication supprimée',async t=>{
  const f=await fixture(t),{env,agency,foreign}=f,groups=await readPropertyGroups(env,agency.id),id=groups[0].summary.id;
  const before=await env.DB.prepare('SELECT count(*) n FROM import_objects WHERE agency_id=?').bind(agency.id).first();
  const archived=await archiveProperty(env,agency.id,id,true);let next=await readPropertyGroups(env,agency.id);
  assert.equal(next.length,1);assert.equal(next[0].summary.archived,true);assert.equal(findProperty(next,id).summary.id,archived.id);
  assert.equal(propertyPage(next,new URLSearchParams()).properties.length,0);assert.equal(propertyPage(next,new URLSearchParams({filter:'archived'})).properties.length,1);
  await assert.rejects(archiveProperty(env,foreign.id,archived.id,false),/NOT_FOUND/);
  await archiveProperty(env,agency.id,archived.id,false);next=await readPropertyGroups(env,agency.id);assert.equal(next[0].summary.archived,false);
  assert.deepEqual(await env.DB.prepare('SELECT count(*) n FROM import_objects WHERE agency_id=?').bind(agency.id).first(),before);
  assert.equal((await env.DB.prepare('SELECT count(*) n FROM generation_runs WHERE owner_agency_id=?').bind(agency.id).first<{n:number}>())!.n,0);
  assert.deepEqual(await preparePropertyDraft(env,agency.id,id,'property-edit-key00',AbortSignal.timeout(10000)),{draftId:f.draft.id});
});
test('Copies de montage : source explicite regroupée même après un changement des photos',async t=>{
  const f=await fixture(t),{env,agency}=f,first=(await readPropertyGroups(env,agency.id))[0];
  const input=JSON.stringify({editorSource:f.draft.id,editorVersion:1});
  const copy=await beginManualImport(env.DB,agency.id,'property-editor-copy-key00',input,'a'.repeat(64));await startCreationDraft(env.DB,agency.id,copy.row.id,blankCreationDraft());
  const groups=await readPropertyGroups(env,agency.id);assert.equal(groups.length,1);assert.equal(groups[0].summary.id,first.summary.id);assert.equal(groups[0].summary.draftCount,2);
  await patchCreationDraft(env.DB,agency.id,f.draft.id,{version:f.draft.version,changes:{title:'Nouvelle présentation du bien'},confirm:[]});
  assert.equal((await readPropertyGroups(env,agency.id))[0].summary.title,'Nouvelle présentation du bien');
});
test('Recherche, vente/location, pagination et dossiers distincts ne fusionnent pas les titres homonymes',()=>{
  const make=(n:number):PropertyRecord=>({key:`listing:property-${n}`,id:`property-${n}`,kind:'listing',parent:null,originHash:null,canonicalUrl:null,projectId:null,
    createdAt:new Date(2026,0,n+1).toISOString(),updatedAt:new Date(2026,0,n+1).toISOString(),fields:{...emptyCreationFields(),title:'Appartement',locality:n%2?'Paris':'Lyon',transaction:n%2?'sale':'rent',priceCents:95000},photos:[],editable:true,editor:false,status:'importing',jobId:null});
  const groups=propertyGroups(Array.from({length:31},(_,i)=>make(i)),[]);assert.equal(groups.length,31);
  const first=propertyPage(groups,new URLSearchParams());assert.equal(first.properties.length,24);const next=propertyPage(groups,new URLSearchParams({cursor:first.nextCursor!}));assert.equal(next.properties.length,7);
  assert.equal(new Set([...first.properties,...next.properties].map(p=>p.id)).size,31);
  assert.equal(propertyPage(groups,new URLSearchParams({q:'Lyon',filter:'rent'})).total,16);assert.equal(propertyPage(groups,new URLSearchParams({filter:'sale'})).total,15);
  assert.throws(()=>propertyPage(groups,new URLSearchParams({sort:'unknown'})),/VALIDATION_ERROR/);
  assert.equal(propertyPrice(make(0).fields),'950 € / mois');assert.equal(propertyCaption(make(0).fields).includes('À louer'),true);
  const a={...make(1),canonicalUrl:'https://source.example/one',projectId:'folder-a'},b={...make(2),canonicalUrl:'https://source.example/one',projectId:'folder-b'};
  assert.equal(propertyGroups([a,b],[{id:'folder-a',name:'A',archived:0,createdAt:a.createdAt},{id:'folder-b',name:'B',archived:0,createdAt:b.createdAt}]).length,2);
});
test('Une fiche peut être enregistrée sans lancer de vidéo et sans trois photos',()=>{
  const input={...emptyCreationFields(),title:'Appartement à compléter',propertyType:'apartment',transaction:'sale',locality:'Lyon',description:'',photos:[]};
  assert.equal(PropertyListingInput.safeParse(input).success,true);
  assert.equal(ManualListingInput.safeParse(input).success,false);
  assert.equal(PropertyListingInput.safeParse({...input,rooms:-1}).success,false);
  assert.equal(PropertyListingInput.safeParse({...input,transaction:'rent',priceCents:92000}).success,false);
});
test('ZIP : fichiers non compressés, noms UTF-8 et somme de contrôle standard',async()=>{
  const blob=propertyZip([{name:'vidéo.mp4',bytes:new Uint8Array([1,2,3])},{name:'texte.txt',bytes:new TextEncoder().encode('123456789')}]),bytes=new Uint8Array(await blob.arrayBuffer()),view=new DataView(bytes.buffer);
  assert.equal(blob.type,'application/zip');assert.equal(view.getUint32(0,true),0x04034b50);assert.equal(view.getUint16(6,true),0x800);
  const firstLength=30+view.getUint16(26,true)+3;assert.equal(view.getUint32(firstLength+14,true),0xcbf43926,'CRC32 connu de la chaîne 123456789');
  assert.equal(view.getUint32(bytes.length-22,true),0x06054b50);assert.equal(view.getUint16(bytes.length-12,true),2);
});
