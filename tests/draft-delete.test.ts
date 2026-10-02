import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import sharp from 'sharp';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {startManualCreationDraft,deleteCreationDraft,uploadCreationPhoto,patchCreationDraft} from '../apps/web/lib/creation-drafts';
import {findImport,listImports} from '../packages/db/src/imports';
import {findCreationDraft} from '../packages/db/src/creation-drafts';
import {createPrivateImport,privateImportPhoto,purgeImport} from '../apps/web/lib/imports';
import {purgeHostedImports} from '../apps/pipeline/src/import-cleanup';
import {normalizePhoto} from '../scripts/import-transport';
import {fixtureImportTransport} from '../scripts/import-fixtures';
import {RequestFailure} from '../apps/web/lib/http';
const error=(code:string)=>(value:unknown)=>value instanceof RequestFailure&&value.code===code;

test('suppression de brouillon : isolation, upload tardif, reprise R2 et limites conservées après purge',async t=>{
  const mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:'export default {fetch(){return new Response("test")}}',
    compatibilityDate:'2026-09-27',d1Databases:['DB'],r2Buckets:['MEDIA']}));t.after(()=>mf.dispose());
  const {DB,MEDIA}=await mf.getBindings<Pick<CloudflareEnv,'DB'|'MEDIA'>>(),env={DB,MEDIA};
  const files=(await readdir(new URL('../packages/db/migrations/',import.meta.url))).filter(file=>file.endsWith('.sql')).sort();
  const migrate=async(file:string)=>DB.exec((await readFile(new URL('../packages/db/migrations/'+file,import.meta.url),'utf8')).replace(/^--.*$/gm,'').replace(/\n/g,' '));
  for(const file of files.filter(file=>file<'0022'))await migrate(file);
  const at=new Date().toISOString(),month=at.slice(0,7),day=at.slice(0,10);
  for(const id of ['delete-a','delete-b'])await DB.prepare('INSERT INTO agencies(id,owner_user_id,name,created_at,updated_at) VALUES(?,?,?,?,?)')
    .bind(id,'owner-'+id,'Fixture '+id,at,at).run();
  await DB.prepare('INSERT INTO hosted_import_budget(month,baseline_cents,ceiling_cents,paused) VALUES(?,2000,4500,0)').bind(month).run();
  await DB.prepare('UPDATE trial_policy SET budget_ceiling_cents=4500 WHERE id=1').run();
  const draft=await startManualCreationDraft(DB,'delete-a','delete-draft-key-001','Appartement à Lyon');
  const call=async(id:string,importId=draft.id)=>DB.prepare(`INSERT INTO draft_extract_calls(id,agency_id,import_id,text_hash,status,created_at)
    VALUES(?,'delete-a',?,?,'pending',?)`).bind(id,importId,'a'.repeat(64),at).run();
  await call('old-call');await migrate('0022_draft_extraction_usage.sql');
  // Current cleanup also collects the editor's private music journal. Keep the
  // extraction migration's historical fixture and add its cleanup dependency.
  await migrate('0032_editor_music.sql');
  await migrate('0033_editor_voice.sql');
  assert.equal((await DB.prepare('SELECT attempts FROM draft_extraction_usage WHERE agency_id=? AND day=?').bind('delete-a',day).first<{attempts:number}>())?.attempts,1);
  // Different text hashes represent five distinct analysis attempts.
  for(let index=1;index<5;index++)await DB.prepare(`INSERT INTO draft_extract_calls(id,agency_id,import_id,text_hash,status,created_at)
    VALUES(?,'delete-a',?,?,'pending',?)`).bind('call-'+index,draft.id,index.toString().repeat(64),at).run();
  const pictures=await Promise.all(['#305e4b','#c29568'].map(async background=>new Uint8Array(await sharp({create:{width:960,height:640,channels:3,background}}).png().toBuffer())));
  const first=await uploadCreationPhoto(env,'delete-a',draft.id,0,'delete-upload-first-001',pictures[0],'image/png',normalizePhoto,AbortSignal.timeout(20_000));
  let entered!:()=>void,release!:()=>void;
  const waiting=new Promise<void>(resolve=>entered=resolve),resume=new Promise<void>(resolve=>release=resolve);
  const delayed={...env,MEDIA:{head:MEDIA.head.bind(MEDIA),delete:MEDIA.delete.bind(MEDIA),put:async(...args:Parameters<typeof MEDIA.put>)=>{
    entered();await resume;return MEDIA.put(...args);}}};
  const late=uploadCreationPhoto(delayed,'delete-a',draft.id,1,'delete-upload-late-0001',pictures[1],'image/png',normalizePhoto,AbortSignal.timeout(20_000));
  const rejected=assert.rejects(late,error('CONFLICT'));await waiting;
  await assert.rejects(deleteCreationDraft(env,'delete-b',draft.id),error('NOT_FOUND'));
  assert.ok(await MEDIA.head(first.objectKey));
  const deletionAt=Date.now();await deleteCreationDraft(env,'delete-a',draft.id,deletionAt);
  assert.equal(await findCreationDraft(DB,'delete-a',draft.id),null);
  assert.equal((await listImports(DB,'delete-a')).some(row=>row.id===draft.id),false);
  await assert.rejects(privateImportPhoto(env,'delete-a',draft.id,first.id),error('NOT_FOUND'));
  await assert.rejects(patchCreationDraft(DB,'delete-a',draft.id,{version:1,changes:{title:'Retour'},confirm:[]}),error('NOT_FOUND'));
  assert.equal(await MEDIA.head(first.objectKey),null);
  release();await rejected;
  const keys=(await DB.prepare('SELECT object_key FROM import_objects WHERE import_id=? ORDER BY id').bind(draft.id).all<{object_key:string}>()).results.map(row=>row.object_key);
  assert.equal(keys.length,2);for(const key of keys)assert.equal(await MEDIA.head(key),null);
  // Simulate a worker disappearing after a put, before its post-put check.
  await MEDIA.put(first.objectKey,'interrupted-fixture');
  assert.equal(await purgeImport(env,'delete-a',draft.id,deletionAt+240_000),false);
  await deleteCreationDraft({...env,MEDIA:{...delayed.MEDIA,delete:async()=>{throw new Error('FIXTURE_R2_UNAVAILABLE');}}},'delete-a',draft.id,deletionAt+60_000);
  assert.equal((await findImport(DB,'delete-a',draft.id))?.leaseUntil,new Date(deletionAt).toISOString());
  assert.ok(await MEDIA.head(first.objectKey));
  assert.equal((await purgeHostedImports(env,deletionAt+300_001)).removed,1);
  assert.equal(await findImport(DB,'delete-a',draft.id),null);
  for(const key of keys)assert.equal(await MEDIA.head(key),null);
  assert.equal((await DB.prepare('SELECT count(*) n FROM draft_extract_calls').first<{n:number}>())?.n,0);
  assert.equal((await DB.prepare('SELECT attempts FROM draft_extraction_usage WHERE agency_id=? AND day=?').bind('delete-a',day).first<{attempts:number}>())?.attempts,5);
  assert.equal((await DB.prepare('SELECT baseline_cents FROM hosted_import_budget WHERE month=?').bind(month).first<{baseline_cents:number}>())?.baseline_cents,2025);
  const next=await startManualCreationDraft(DB,'delete-a','delete-draft-key-002');
  await assert.rejects(call('sixth-call',next.id),/EXTRACTION_LIMIT/);
  const ready=await createPrivateImport(env,'delete-b','https://fixtures.bienvu.example/vente','delete-ready-key-001',fixtureImportTransport());
  assert.equal(ready.status,'ready');await assert.rejects(deleteCreationDraft(env,'delete-b',ready.id),error('CONFLICT'));
  assert.equal((await findImport(DB,'delete-b',ready.id))?.status,'ready');
  for(const table of ['jobs','reservations','allocations'])assert.equal((await DB.prepare('SELECT count(*) n FROM '+table).first<{n:number}>())?.n,0);
});
