import {GoogleProjectId, VoiceFailure} from '@bienvu/contracts';
import {googleJson, type VoiceFetch} from './http';

const tokenEndpoint = 'https://oauth2.googleapis.com/token';
const scope = 'https://www.googleapis.com/auth/cloud-platform';
const encode = (value: string) => btoa(value).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
type Account = {type: 'service_account'; project_id: string; client_email: string; private_key: string; private_key_id: string};

function accountCredentials(value: unknown, projectId: string): Account {
  if (!value || typeof value !== 'object') throw new VoiceFailure('VOICE_CONFIG_INVALID');
  const data = value as Record<string, unknown>;
  if (!GoogleProjectId.safeParse(projectId).success || data.type !== 'service_account' || data.project_id !== projectId
    || typeof data.client_email !== 'string' || !new RegExp(`^[a-z0-9-]+@${projectId}\\.iam\\.gserviceaccount\\.com$`).test(data.client_email)
    || typeof data.private_key_id !== 'string' || !/^[a-f0-9]{40}$/.test(data.private_key_id)
    || typeof data.private_key !== 'string' || data.private_key.length > 8000
    || data.token_uri !== tokenEndpoint) throw new VoiceFailure('VOICE_CONFIG_INVALID');
  return data as Account;
}

// Instance par requête/job : ne pas partager une promesse d'I/O entre requêtes Workers.
export async function googleServiceAccountAccess(value: unknown, projectId: string, options: {
  fetch?: VoiceFetch; now?: () => number;
} = {}): Promise<() => Promise<string>> {
  const account = accountCredentials(value, projectId);
  const match = account.private_key.trim().match(/^-----BEGIN PRIVATE KEY-----\s*([A-Za-z0-9+/=\s]+)\s*-----END PRIVATE KEY-----$/);
  if (!match) throw new VoiceFailure('VOICE_CONFIG_INVALID');
  let key: CryptoKey;
  try {
    const bytes = Uint8Array.from(atob(match[1].replace(/\s/g, '')), char => char.charCodeAt(0));
    key = await crypto.subtle.importKey('pkcs8', bytes, {name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256'}, false, ['sign']);
  } catch {throw new VoiceFailure('VOICE_CONFIG_INVALID');}
  const now = options.now ?? Date.now;
  let cached: {token: string; expiresAt: number} | undefined;
  let pending: Promise<string> | undefined;
  async function exchange(): Promise<string> {
    const issued = Math.floor(now() / 1000);
    const header = encode(JSON.stringify({alg: 'RS256', typ: 'JWT', kid: account.private_key_id}));
    const claims = encode(JSON.stringify({iss: account.client_email, scope, aud: tokenEndpoint, iat: issued, exp: issued + 3600}));
    const input = `${header}.${claims}`;
    const signed = new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(input)));
    const signature = encode(String.fromCharCode(...signed));
    const result = await googleJson(tokenEndpoint, {method: 'POST', headers: {'content-type': 'application/x-www-form-urlencoded'},
      body: new URLSearchParams({grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${input}.${signature}`}).toString()},
    {fetch: options.fetch ?? fetch, maxBytes: 16_384, timeoutMs: 15_000, auth: true});
    const body = result.body as Record<string, unknown> | null;
    if (!body || body.token_type !== 'Bearer' || typeof body.access_token !== 'string' || !/^[\x21-\x7E]{20,8192}$/.test(body.access_token)
      || typeof body.expires_in !== 'number' || !Number.isInteger(body.expires_in) || body.expires_in < 120 || body.expires_in > 3600)
      throw new VoiceFailure('VOICE_AUTH_FAILED');
    cached = {token: body.access_token, expiresAt: now() + (body.expires_in - 60) * 1000};
    return cached.token;
  }
  return async () => {
    if (cached && cached.expiresAt > now()) return cached.token;
    pending ??= exchange();
    try {return await pending;} finally {pending = undefined;}
  };
}
