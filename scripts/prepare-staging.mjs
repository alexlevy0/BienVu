import {readFile,writeFile} from 'node:fs/promises';
const id=process.env.BIENVU_D1_ID;
if(!id||!/^[a-f0-9-]{36}$/.test(id))throw new Error('BIENVU_D1_ID requis : identifiant de la base de staging créée explicitement.');
const plan=process.env.BIENVU_WORKERS_PLAN??'free';
if(!['free','paid'].includes(plan))throw new Error('BIENVU_WORKERS_PLAN doit être free ou paid.');
const targetScope=process.env.BIENVU_STAGING_TARGET??'all';
if(!['all','web'].includes(targetScope))throw new Error('BIENVU_STAGING_TARGET doit être all ou web.');
for(const [file,target,name] of [
  ['apps/web/wrangler.jsonc','apps/web/wrangler.staging.jsonc','bienvu-web-probe-staging'],
  ['apps/pipeline/wrangler.jsonc','apps/pipeline/wrangler.staging.jsonc','bienvu-browser-probe-staging'],
  ['apps/pipeline/wrangler.render.jsonc','apps/pipeline/wrangler.staging.render.jsonc','bienvu-render-probe-staging'],
]) {
  if(targetScope==='web'&&name!=='bienvu-web-probe-staging')continue;
  const c=JSON.parse(await readFile(file,'utf8'));c.name=name;c.vars.PROBE_MODE='remote';
  if (name === 'bienvu-web-probe-staging') {
    const origin = process.env.BIENVU_WEB_ORIGIN ?? '';
    if (origin && (new URL(origin).origin !== origin || !origin.startsWith('https://'))) throw new Error('BIENVU_WEB_ORIGIN doit être une origine HTTPS exacte.');
    c.vars.BETTER_AUTH_URL = origin;
    c.vars.GOOGLE_CLIENT_ID = process.env.BIENVU_GOOGLE_CLIENT_ID ?? '';
    c.vars.AUTH_EMAIL_VERIFICATION_BYPASS = 'false';
    c.vars.IMPORT_MODE = 'disabled';
    const sender = process.env.BIENVU_AUTH_EMAIL_FROM ?? '';
    if (sender && (plan !== 'paid' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(sender) || /\.(example|invalid|test)$/.test(sender)))
      throw new Error('Un expéditeur réel vérifié et BIENVU_WORKERS_PLAN=paid sont requis pour les e-mails.');
    const recipient = process.env.BIENVU_AUTH_EMAIL_TO ?? '';
    if (recipient && (!sender || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient)))
      throw new Error('BIENVU_AUTH_EMAIL_TO exige un destinataire valide et un expéditeur configuré.');
    c.vars.AUTH_EMAIL_MODE = sender ? 'cloudflare' : 'disabled';
    c.vars.AUTH_EMAIL_FROM = sender;
    if (sender) c.send_email = [{name: 'AUTH_EMAIL', allowed_sender_addresses: [sender],
      ...(recipient ? {allowed_destination_addresses: [recipient]} : {})}];
    else delete c.send_email;
  }
  // La limite CPU personnalisée nécessite Workers Paid. Le plan Free applique sa propre limite.
  if(name==='bienvu-browser-probe-staging'&&plan==='free')delete c.limits;
  c.r2_buckets[0].bucket_name='bienvu-s00-private';
  if(c.d1_databases){c.d1_databases[0].database_name='bienvu-s00-staging';c.d1_databases[0].database_id=id;}
  await writeFile(target,JSON.stringify(c,null,2));console.log(`${target} préparé ; aucun déploiement ni appel applicatif lancé.`);
}
console.log(`Plan prévu pour web/import : ${plan}. Le renderer Containers exige Workers Paid dans tous les cas.`);
