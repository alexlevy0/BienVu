import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {remoteSql} from './cloudflare-operator.mjs';
const action=process.argv[2]??'state';assert.ok(['state','pause','resume','budget'].includes(action));
const month=new Date().toISOString().slice(0,7);
const token=(await readFile('apps/pipeline/.dev.vars.import.staging','utf8')).match(/^PROBE_TOKEN=(.+)$/m)?.[1];assert.ok(token?.length>=32);
if(action==='pause')await remoteSql(`UPDATE hosted_import_budget SET paused=1 WHERE month='${month}';`);
if(action==='resume'){
 const r=await remoteSql(`UPDATE hosted_import_budget SET paused=0 WHERE month='${month}' AND baseline_cents+
 (SELECT coalesce(sum(reserved_cents),0) FROM hosted_import_costs WHERE month='${month}')+50<=ceiling_cents RETURNING month;`);
 assert.equal(r.length,1,'Budget absent ou insuffisant : rapprocher les dépenses avant reprise.');
}
if(action==='budget'){
 const [baseline,ceiling]=process.argv.slice(3).map(Number);
 assert.ok(Number.isSafeInteger(baseline)&&baseline>=0&&Number.isSafeInteger(ceiling)&&ceiling<=2500&&ceiling>=baseline);
 await remoteSql(`INSERT INTO hosted_import_budget(month,baseline_cents,ceiling_cents,paused) VALUES('${month}',${baseline},${ceiling},1)
 ON CONFLICT(month) DO UPDATE SET baseline_cents=excluded.baseline_cents,ceiling_cents=excluded.ceiling_cents,paused=1;`);
}
const r=await fetch(`https://bienvu-import-staging.alexlevy0.workers.dev/operator/${action==='pause'?'stop':'state'}`,{method:action==='pause'?'POST':'GET',headers:{Authorization:`Bearer ${token}`}});
assert.equal(r.status,200);const container=await r.json();
const [budget]=await remoteSql(`SELECT *,baseline_cents+(SELECT coalesce(sum(reserved_cents),0) FROM hosted_import_costs WHERE month='${month}') engaged_cents FROM hosted_import_budget WHERE month='${month}';`);
console.log(JSON.stringify({at:new Date().toISOString(),container,budget:budget??null,alert:budget?.engaged_cents>=2000,note:'Provisions, pas une facture. Compteurs et coûts jamais remis à zéro.'},null,2));
