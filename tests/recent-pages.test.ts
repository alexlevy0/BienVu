import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {listImportPage,listImports,ImportStateFailure} from '../packages/db/src/imports';
import {blankCreationDraft,startCreationDraft} from '../packages/db/src/creation-drafts';
import {readRecentPages} from '../apps/web/lib/recent-pages';

test('récentes : pages complètes, dédoublonnage, curseurs et changement de propriétaire',async()=>{
  const calls:string[]=[];
  const fetcher=(async(input)=>{const url=String(input);calls.push(url);const cursor=new URL(url,'https://fixture.example').searchParams.get('cursor');
    const offset=cursor?Number(cursor):0;const values=Array.from({length:Math.min(20,65-offset)},(_,i)=>({id:String(offset+i)}));
    if(offset)values.unshift({id:String(offset-1)});
    return Response.json({jobs:values,nextCursor:offset+20<65?String(offset+20):null});}) as typeof fetch;
  const parse=(value:unknown)=>value as {id:string};
  const all=await readRecentPages('/api/generations','jobs',parse,()=>true,fetcher);
  assert.equal(all?.length,65);assert.equal(calls.length,4);assert.equal(all?.at(-1)?.id,'64');
  let current=true,requests=0;
  const switched=(async()=>{requests++;current=false;return Response.json({jobs:[{id:'former-owner'}],nextCursor:'more'});}) as typeof fetch;
  assert.equal(await readRecentPages('/api/generations','jobs',parse,()=>current,switched),null);assert.equal(requests,1);
  const repeated=(async()=>Response.json({jobs:[],nextCursor:'loop'})) as typeof fetch;
  await assert.rejects(readRecentPages('/api/generations','jobs',parse,()=>true,repeated),/RECENTS_CURSOR_INVALID/);
  const failed=(async()=>new Response('',{status:503})) as typeof fetch;
  await assert.rejects(readRecentPages('/api/generations','jobs',parse,()=>true,failed),/RECENTS_UNAVAILABLE/);
});

test('brouillons paginés : dates égales, isolation, expiration et suppression',async t=>{
  const mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:'export default {fetch(){return new Response("fixture")}}',
    compatibilityDate:'2026-09-27',d1Databases:['DB']}));t.after(()=>mf.dispose());const {DB}=await mf.getBindings<{DB:D1Database}>();
  for(const file of (await readdir(new URL('../packages/db/migrations/',import.meta.url))).filter(f=>f.endsWith('.sql')).sort())
    await DB.exec((await readFile(new URL('../packages/db/migrations/'+file,import.meta.url),'utf8')).replace(/^--.*$/gm,'').replace(/\n/g,' '));
  const at=new Date().toISOString(),future=new Date(Date.now()+86400_000).toISOString();
  for(const id of ['recent-a','recent-b'])await DB.prepare('INSERT INTO agencies(id,owner_user_id,name,created_at,updated_at) VALUES(?,?,?,?,?)')
    .bind(id,'owner-'+id,id,at,at).run();
  // Historical, metadata-only fixtures with extended expiry exercise multiple
  // pages while preserving the real admission triggers and daily/monthly caps.
  async function seed(id:string,owner:string,created:string,expiry=future){
    await DB.prepare(`INSERT INTO listing_imports(id,agency_id,idempotency_key,source_url,status,created_at,lease_until,expires_at,source_kind,input_json,input_hash)
      VALUES(?,?,?,'','importing',?,?,?,'manual','{"draft":1}',?)`).bind(id,owner,'key-'+id,created,expiry,expiry,'a'.repeat(64)).run();
    await startCreationDraft(DB,owner,id,blankCreationDraft());
  }
  const times=['2026-07-30','2026-07-31','2026-08-01','2026-08-02','2026-08-03'];
  const ids=Array.from({length:37},(_,i)=>'recent-draft-'+String(i).padStart(3,'0'));
  for(let i=0;i<ids.length;i++)await seed(ids[i],'recent-a',times[Math.floor(i/8)]+'T10:00:00.000Z');
  await seed('foreign-draft','recent-b',times[0]+'T10:00:00.000Z');
  await seed('expired-draft','recent-a',times[0]+'T10:00:00.000Z','2026-08-01T00:00:00.000Z');
  await seed('deleted-draft','recent-a',times[1]+'T10:00:00.000Z');
  await DB.prepare("UPDATE listing_imports SET status='deleting' WHERE id='deleted-draft'").run();
  const first=await listImportPage(DB,'recent-a',undefined,true);assert.equal(first.imports.length,30);assert.ok(first.nextCursor);
  const second=await listImportPage(DB,'recent-a',first.nextCursor!,true);assert.equal(second.imports.length,7);assert.equal(second.nextCursor,null);
  assert.deepEqual([...first.imports,...second.imports].map(row=>row.id).sort(),ids);
  assert.ok([...first.imports,...second.imports].every(row=>row.status==='needs_input'));
  assert.deepEqual((await listImportPage(DB,'recent-b',undefined,true)).imports.map(row=>row.id),['foreign-draft']);
  assert.equal((await listImports(DB,'recent-a')).length,30);
  await assert.rejects(listImportPage(DB,'recent-a','invalid'),error=>error instanceof ImportStateFailure&&error.code==='VALIDATION_ERROR');
  for(const table of ['jobs','reservations','allocations','cost_events'])assert.equal((await DB.prepare('SELECT COUNT(*) n FROM '+table).first<{n:number}>())?.n,0);
});
