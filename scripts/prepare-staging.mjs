import {readFile,writeFile} from 'node:fs/promises';
const id=process.env.BIENVU_D1_ID;
if(!id||!/^[a-f0-9-]{36}$/.test(id))throw new Error('BIENVU_D1_ID requis : identifiant de la base de staging créée explicitement.');
const plan=process.env.BIENVU_WORKERS_PLAN??'free';
if(!['free','paid'].includes(plan))throw new Error('BIENVU_WORKERS_PLAN doit être free ou paid.');
for(const [file,target,name] of [
  ['apps/web/wrangler.jsonc','apps/web/wrangler.staging.jsonc','bienvu-web-probe-staging'],
  ['apps/pipeline/wrangler.jsonc','apps/pipeline/wrangler.staging.jsonc','bienvu-browser-probe-staging'],
  ['apps/pipeline/wrangler.render.jsonc','apps/pipeline/wrangler.staging.render.jsonc','bienvu-render-probe-staging'],
]) {
  const c=JSON.parse(await readFile(file,'utf8'));c.name=name;c.vars.PROBE_MODE='remote';
  // La limite CPU personnalisée nécessite Workers Paid. Le plan Free applique sa propre limite.
  if(name==='bienvu-browser-probe-staging'&&plan==='free')delete c.limits;
  c.r2_buckets[0].bucket_name='bienvu-s00-private';
  if(c.d1_databases){c.d1_databases[0].database_name='bienvu-s00-staging';c.d1_databases[0].database_id=id;}
  await writeFile(target,JSON.stringify(c,null,2));console.log(`${target} préparé, appels distants toujours désactivés.`);
}
console.log(`Plan prévu pour web/import : ${plan}. Le renderer Containers exige Workers Paid dans tous les cas.`);
