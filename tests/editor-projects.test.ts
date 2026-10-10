import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {beginImport,beginManualImport,reserveHostedImport,markImportDeleting,removeImport,ImportStateFailure} from '../packages/db/src/index';
import {startManualCreationDraft} from '../apps/web/lib/creation-drafts';

const directory=new URL('../packages/db/migrations/',import.meta.url);
const hash='a'.repeat(64);

test('projets éditeur : migration sans perte, plus de 30 projets, indépendance des quotas de liens et du budget des fichiers',async t=>{
  const mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:'export default {fetch(){return new Response("fixture")}}',
    compatibilityDate:'2026-09-28',d1Databases:['DB']}));t.after(()=>mf.dispose());
  const {DB}=await mf.getBindings<Pick<CloudflareEnv,'DB'>>();
  const migrate=async(file:string)=>DB.exec((await readFile(new URL(file,directory),'utf8')).replace(/^--.*$/gm,'').replace(/\n/g,' '));
  const files=(await readdir(directory)).filter(f=>f.endsWith('.sql')).sort();
  for(const file of files.filter(f=>f<'0047'))await migrate(file);
  const now=Date.now(),at=new Date(now).toISOString(),day=at.slice(0,10),month=at.slice(0,7);
  await DB.prepare('INSERT INTO agencies(id,owner_user_id,name,created_at,updated_at) VALUES(?,?,?,?,?)').bind('projects','owner','Projects',at,at).run();
  const history=[];
  // Seed the historical columns before exercising the current import API.
  for(let i=0;i<30;i++){
    const id=crypto.randomUUID(),created=new Date(now-86400_000).toISOString();history.push(id);
    await DB.prepare(`INSERT INTO listing_imports(id,agency_id,idempotency_key,source_url,source_kind,input_json,input_hash,status,created_at,lease_until,expires_at)
      VALUES(?,'projects',?,'','manual','{}',?,'importing',?,?,?)`)
      .bind(id,`historical-project-${i}`,hash,created,new Date(now).toISOString(),new Date(now+30*86400_000).toISOString()).run();
  }
  await DB.prepare('INSERT INTO hosted_import_budget(month,baseline_cents,ceiling_cents,paused) VALUES(?,9000,9000,1)').bind(month).run();
  for(const file of files.filter(f=>f>='0047'))await migrate(file);
  assert.equal((await DB.prepare('SELECT count(*) n FROM listing_imports WHERE estimate_only=0').first<{n:number}>())?.n,30);
  assert.equal((await DB.prepare('SELECT sum(attempts) n FROM project_creation_usage').first<{n:number}>())?.n,30,'Existing creation history survives migration');
  const linked=await beginImport(DB,'projects','https://fixtures.bienvu.example/vente','linked-after-thirty-projects',now);
  assert.equal(linked.fresh,true,'Existing project count must not block an otherwise permitted link');
  // Exhausted link allowances and paused transfer budget must not affect either editor choice.
  await DB.prepare('UPDATE import_usage SET attempts=60 WHERE day=?').bind(day).run();
  const before=(await DB.prepare('SELECT id FROM listing_imports ORDER BY id').all<{id:string}>()).results;
  const budgetBefore=await DB.prepare('SELECT * FROM hosted_import_budget WHERE month=?').bind(month).first();
  const empty=await startManualCreationDraft(DB,'projects','editor-empty-after-thirty'),demo=await startManualCreationDraft(DB,'projects','editor-demo-after-thirty');
  assert.notEqual(empty.id,demo.id);assert.equal(empty.photos.length,0);assert.equal(demo.photos.length,0);
  const replay=await startManualCreationDraft(DB,'projects','editor-empty-after-thirty');assert.equal(replay.id,empty.id);
  const after=(await DB.prepare('SELECT id FROM listing_imports ORDER BY id').all<{id:string}>()).results;
  assert.equal(after.length,before.length+2);assert.ok(before.every(row=>after.some(other=>row.id===other.id)),'No existing project removed');
  assert.equal((await DB.prepare('SELECT count(*) n FROM hosted_import_costs').first<{n:number}>())?.n,0);
  assert.equal((await DB.prepare('SELECT count(*) n FROM generation_runs').first<{n:number}>())?.n,0);
  assert.equal((await DB.prepare('SELECT attempts FROM import_usage WHERE day=?').bind(day).first<{attempts:number}>())?.attempts,60);
  assert.deepEqual(await DB.prepare('SELECT * FROM hosted_import_budget WHERE month=?').bind(month).first(),budgetBefore);
  await assert.rejects(beginImport(DB,'projects','https://fixtures.bienvu.example/vente','linked-after-full-allowance',now),e=>e instanceof ImportStateFailure&&e.code==='IMPORT_LIMIT');
  await assert.rejects(reserveHostedImport(DB,'projects',empty.id),e=>e instanceof ImportStateFailure&&e.code==='IMPORT_BUDGET_LIMIT','Personal file processing still requires its transfer budget');
  assert.equal((await DB.prepare('PRAGMA foreign_key_check').all()).results.length,0);
});

test('créations rapprochées : limite atomique par agence et heure UTC, rejouable, non remboursée par suppression',async t=>{
  const mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:'export default {fetch(){return new Response("fixture")}}',
    compatibilityDate:'2026-09-28',d1Databases:['DB']}));t.after(()=>mf.dispose());
  const {DB}=await mf.getBindings<Pick<CloudflareEnv,'DB'>>();
  for(const file of (await readdir(directory)).filter(f=>f.endsWith('.sql')).sort())
    await DB.exec((await readFile(new URL(file,directory),'utf8')).replace(/^--.*$/gm,'').replace(/\n/g,' '));
  const now=Date.parse('2026-10-06T12:30:00Z'),at=new Date(now).toISOString();
  for(const id of ['rate-a','rate-b'])await DB.prepare('INSERT INTO agencies(id,owner_user_id,name,created_at,updated_at) VALUES(?,?,?,?,?)').bind(id,id,id,at,at).run();
  const create=(agency:string,key:string,time=now)=>beginManualImport(DB,agency,key,'{}',hash,time);
  const first=await create('rate-a','rate-historical-00');
  for(let i=1;i<59;i++)await create('rate-a',`rate-historical-${i}`);
  const concurrent=await Promise.allSettled([create('rate-a','rate-concurrent-a'),create('rate-a','rate-concurrent-b')]);
  assert.equal(concurrent.filter(r=>r.status==='fulfilled').length,1);
  const rejected=concurrent.find(r=>r.status==='rejected');assert.ok(rejected?.status==='rejected'&&rejected.reason instanceof ImportStateFailure&&rejected.reason.code==='PROJECT_RATE_LIMIT');
  const replay=await create('rate-a','rate-historical-00');assert.equal(replay.fresh,false);assert.equal(replay.row.id,first.row.id);
  const allowance=async()=>DB.prepare("SELECT attempts FROM project_creation_usage WHERE agency_id='rate-a' AND hour='2026-10-06T12'").first<{attempts:number}>();
  assert.equal((await allowance())?.attempts,60);
  assert.equal(await markImportDeleting(DB,'rate-a',first.row.id,now+1200_001),true);
  await removeImport(DB,'rate-a',first.row.id);
  await assert.rejects(create('rate-a','rate-after-deletion'),/PROJECT_RATE_LIMIT/);assert.equal((await allowance())?.attempts,60);
  assert.equal((await create('rate-b','rate-other-agency')).fresh,true);
  assert.equal((await create('rate-a','rate-next-hour-allowed',Date.parse('2026-10-06T13:00:00Z'))).fresh,true);
  assert.equal((await DB.prepare('SELECT count(*) n FROM import_usage').first<{n:number}>())?.n,0,'Project creations do not spend URL allowances');
  assert.equal((await DB.prepare('PRAGMA foreign_key_check').all()).results.length,0);
});
