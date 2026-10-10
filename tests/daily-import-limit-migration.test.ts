import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {beginImport,beginManualImport,failImport,generationRights} from '../packages/db/src/index';
import {URL_IMPORT_QUOTAS} from '../packages/contracts/src/import-quotas';

test('migration 0065 : 20 essais conservés, imports 21–40 autorisés, dernière place atomique et renouvellement UTC',async t=>{
  const mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:'export default {fetch(){return new Response("fixture")}}',compatibilityDate:'2026-09-27',d1Databases:['DB']}));
  t.after(()=>mf.dispose());const {DB}=await mf.getBindings<Pick<CloudflareEnv,'DB'>>();
  const directory=new URL('../packages/db/migrations/',import.meta.url);
  const migrate=async(file:string)=>DB.exec((await readFile(new URL(file,directory),'utf8')).replace(/^--.*$/gm,'').replace(/\n/g,' '));
  for(const file of (await readdir(directory)).filter(f=>f.endsWith('.sql')&&f<'0065').sort())await migrate(file);
  const now=Date.parse('2026-10-10T12:00:00Z'),at=new Date(now).toISOString(),source='https://fixtures.bienvu.example/vente';
  for(const agency of ['daily-first','daily-second'])await DB.prepare('INSERT INTO agencies(id,owner_user_id,name,created_at,updated_at) VALUES(?,?,?,?,?)').bind(agency,agency,agency,at,at).run();
  await DB.exec("INSERT INTO import_usage(day,attempts) VALUES('2026-10-09',20),('2026-10-10',20)");
  const usage=async()=>(await DB.prepare('SELECT day,attempts FROM import_usage ORDER BY day').all()).results;
  const before=await usage();
  await assert.rejects(beginImport(DB,'daily-first',source,'old-daily-limit-full',now),/IMPORT_LIMIT/);
  await migrate('0065_daily_import_allowance.sql');
  assert.deepEqual(await usage(),before);
  assert.deepEqual(URL_IMPORT_QUOTAS,{daily:40,monthly:300});
  assert.equal((await generationRights(DB,'daily-first','true',now)).importRetryAt,null);
  for(let attempt=21;attempt<40;attempt++){
    const key=`daily-raised-import-${attempt}`;
    const accepted=await beginImport(DB,'daily-first',source,key,now,attempt%2===0);
    await failImport(DB,'daily-first',accepted.row.id,'SOURCE_BLOCKED',{});
    const replay=await beginImport(DB,'daily-first',source,key,now);
    assert.equal(replay.fresh,false);assert.equal(replay.row.id,accepted.row.id);
  }
  const final=await Promise.allSettled(['daily-first','daily-second'].map(agency=>beginImport(DB,agency,source,`last-daily-slot-${agency}`,now)));
  assert.equal(final.filter(result=>result.status==='fulfilled').length,1);
  const rejected=final.find(result=>result.status==='rejected');assert.ok(rejected?.status==='rejected');assert.match(String(rejected.reason),/IMPORT_LIMIT/);
  const winner=final.find(result=>result.status==='fulfilled');assert.ok(winner?.status==='fulfilled');
  await failImport(DB,winner.value.row.agencyId,winner.value.row.id,'SOURCE_BLOCKED',{});
  const full=await usage();assert.deepEqual(full,[{day:'2026-10-09',attempts:20},{day:'2026-10-10',attempts:40}]);
  for(const agency of ['daily-first','daily-second']){
    assert.equal((await generationRights(DB,agency,'true',now)).importRetryAt,'2026-10-11T00:00:00.000Z');
    await assert.rejects(beginImport(DB,agency,source,`forty-first-${agency}`,now),/IMPORT_LIMIT/);
    await beginManualImport(DB,agency,`manual-full-day-${agency}`,'{}','a'.repeat(64),now);
  }
  const replay=await beginImport(DB,winner.value.row.agencyId,source,`last-daily-slot-${winner.value.row.agencyId}`,now);
  assert.equal(replay.fresh,false);assert.deepEqual(await usage(),full);
  const nextDay=Date.parse('2026-10-11T00:00:00Z');
  assert.equal((await generationRights(DB,'daily-first','true',nextDay)).importRetryAt,null);
  assert.equal((await beginImport(DB,'daily-first',source,'new-daily-allowance',nextDay)).fresh,true);
  assert.deepEqual(await usage(),[...full,{day:'2026-10-11',attempts:1}]);
});
