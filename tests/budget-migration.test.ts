import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';

test('migration budget 40 € : plafonds et historiques existants inchangés, hausse explicite bornée',async t=>{
  const mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:'export default {fetch(){return new Response("fixture")}}',
    compatibilityDate:'2026-09-28',d1Databases:['DB']}));t.after(()=>mf.dispose());
  const {DB}=await mf.getBindings<Pick<CloudflareEnv,'DB'>>();
  const migrate=async(file:string)=>DB.exec((await readFile(`packages/db/migrations/${file}`,'utf8')).replace(/^--.*$/gm,'').replace(/\n/g,' '));
  for(const file of (await readdir('packages/db/migrations')).filter(f=>f.endsWith('.sql')&&f<'0013').sort())await migrate(file);
  await DB.exec("INSERT INTO hosted_import_budget VALUES('2026-09',1875,2500,1); INSERT INTO hosted_import_costs(import_id,agency_id,month,created_at) VALUES('fixture','agency','2026-09','2026-09-28'); INSERT INTO import_usage(day,attempts) VALUES('2026-09-28',10);");
  const snapshot=async()=>Promise.all(['hosted_import_budget','hosted_import_costs','import_usage'].map(table=>DB.prepare(`SELECT * FROM ${table}`).all().then(r=>r.results)));
  const before=await snapshot();await migrate('0013_budget_envelope_40.sql');assert.deepEqual(await snapshot(),before);
  await DB.exec("UPDATE hosted_import_budget SET ceiling_cents=3500 WHERE month='2026-09'");
  assert.equal((await DB.prepare('SELECT ceiling_cents FROM hosted_import_budget').first<{ceiling_cents:number}>())?.ceiling_cents,3500);
  await assert.rejects(DB.exec("UPDATE hosted_import_budget SET ceiling_cents=3501"));
  const after=await snapshot();assert.deepEqual(after.slice(1),before.slice(1));
  assert.equal((await DB.prepare('SELECT baseline_cents,paused FROM hosted_import_budget').first<{baseline_cents:number;paused:number}>())?.paused,1);
});

test('migration budget 50 € : mois et dépenses conservés, hausse limitée au mois actif',async t=>{
  const mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:'export default {fetch(){return new Response("fixture")}}',
    compatibilityDate:'2026-09-28',d1Databases:['DB']}));t.after(()=>mf.dispose());
  const {DB}=await mf.getBindings<Pick<CloudflareEnv,'DB'>>();
  const migrate=async(file:string)=>DB.exec((await readFile(`packages/db/migrations/${file}`,'utf8')).replace(/^--.*$/gm,'').replace(/\n/g,' '));
  for(const file of (await readdir('packages/db/migrations')).filter(f=>f.endsWith('.sql')&&f<'0020').sort())await migrate(file);
  const month=new Date().toISOString().slice(0,7),older='2026-08';
  await DB.prepare('INSERT INTO hosted_import_budget VALUES(?,2385,3500,0)').bind(month).run();
  await DB.prepare('INSERT INTO hosted_import_budget VALUES(?,900,2500,1)').bind(older).run();
  await DB.prepare("INSERT INTO hosted_import_costs(import_id,agency_id,month,created_at) VALUES('budget-fixture','agency',?,?)")
    .bind(month,new Date().toISOString()).run();
  const beforeCosts=(await DB.prepare('SELECT * FROM hosted_import_costs').all()).results;
  await migrate('0020_budget_envelope_50.sql');
  assert.deepEqual((await DB.prepare('SELECT month,baseline_cents,ceiling_cents,paused FROM hosted_import_budget ORDER BY month').all()).results,
    [{month:older,baseline_cents:900,ceiling_cents:2500,paused:1},{month,baseline_cents:2385,ceiling_cents:4500,paused:0}]);
  assert.deepEqual((await DB.prepare('SELECT * FROM hosted_import_costs').all()).results,beforeCosts);
  assert.equal((await DB.prepare('SELECT budget_ceiling_cents AS value FROM trial_policy WHERE id=1').first<{value:number}>())?.value,4500);
  await assert.rejects(DB.prepare('UPDATE hosted_import_budget SET ceiling_cents=4501 WHERE month=?').bind(month).run());
  assert.deepEqual((await DB.prepare('PRAGMA foreign_key_check').all()).results,[]);
});
