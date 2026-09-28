// Opérateur local : OAuth de Wrangler existant, jamais embarqué dans l'application.
// Les corps/erreurs peuvent contenir des données privées : ne pas les journaliser.
import {readFile} from 'node:fs/promises';
import {homedir} from 'node:os';
import {join} from 'node:path';
export const accountId = '5fd251f918593d6bd7594889c4ec8343';
export async function cloudflare(path, init = {}) {
  const config = await readFile(join(homedir(), 'Library/Preferences/.wrangler/config/default.toml'), 'utf8');
  const token = config.match(/^oauth_token\s*=\s*"([^"]+)"/m)?.[1];
  if (!token) throw new Error('WRANGLER_AUTH_REQUIRED');
  const response = await fetch(`https://api.cloudflare.com/client/v4${path}`, {...init,
    signal: AbortSignal.timeout(60_000), headers: {Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...init.headers}});
  const data = await response.json();
  if (!response.ok || data.success === false) throw new Error(`CLOUDFLARE_${response.status}_${data.errors?.map(e => e.code).join('_') ?? 'REQUEST_FAILED'}`);
  return data.result;
}
export async function remoteSql(sql) {
  const result = await cloudflare(`/accounts/${accountId}/d1/database/0219384e-d439-4421-840e-32c551afdb0d/query`, {method: 'POST', body: JSON.stringify({sql})});
  if (result.some(r => !r.success)) throw new Error('D1_QUERY_FAILED');
  return result.at(-1)?.results ?? [];
}
