// Read the active Cloudflare deployment before recording it. Never infer a
// production release from a successful build or an uploaded, inactive version.
import { accountId, cloudflare } from './cloudflare-operator.mjs';

export async function recordAdminDeployment() {
  const worker = 'bienvu-web-probe-staging',
    base = `/accounts/${accountId}/workers/scripts/${worker}`;
  const deployments = await cloudflare(base + '/deployments');
  const active = deployments.deployments[0];
  if (active?.versions.length !== 1 || active.versions[0].percentage !== 100)
    throw Error('SINGLE_ACTIVE_DEPLOYMENT_REQUIRED');
  // Script settings describe the latest upload, which may be inactive after a rollback.
  const version = await cloudflare(base + '/versions/' + active.versions[0].version_id);
  const bindings = version.resources?.bindings;
  const release = bindings?.find((b) => b.name === 'BIENVU_RELEASE')?.text;
  const admin = bindings?.find((b) => b.name === 'SUPER_ADMIN_EMAIL')?.text;
  if (!/^[a-f0-9]{12,40}$/.test(release ?? '') || !admin || !active.created_on)
    throw Error('DEPLOYMENT_METADATA_MISSING');
  const quote = (s) => "'" + String(s).replaceAll("'", "''") + "'",
    id = 'deploy-' + active.id;
  const sql = `INSERT INTO admin_operation_entries(id,actor_id,kind,target,body,state,created_at)
 SELECT ${quote(id)},id,'change',${quote('Mise en production · ' + release)},${quote('Version web ' + release + ' activée à 100 %. Déploiement Cloudflare ' + active.id + '.')},NULL,${quote(active.created_on)}
 FROM auth_user WHERE email=${quote(admin)} COLLATE NOCASE AND emailVerified=1
 ON CONFLICT(id) DO NOTHING RETURNING id`;
  const result = await cloudflare(`/accounts/${accountId}/d1/database/0219384e-d439-4421-840e-32c551afdb0d/query`, {
    method: 'POST',
    body: JSON.stringify({ sql }),
  });
  if (result.some((r) => !r.success)) throw Error('DEPLOYMENT_HISTORY_WRITE_FAILED');
  return { release, deployment: active.id, recorded: result[0]?.results.length > 0 };
}
if (process.argv[1] && import.meta.url === new URL(process.argv[1], 'file://').href)
  console.log(JSON.stringify(await recordAdminDeployment()));
