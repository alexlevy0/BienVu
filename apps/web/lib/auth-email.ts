type MailEnvironment = Pick<CloudflareEnv, 'DB' | 'PROBE_MODE' | 'BETTER_AUTH_URL' | 'BETTER_AUTH_SECRET'> &
  Partial<Pick<CloudflareEnv, 'AUTH_EMAIL' | 'AUTH_EMAIL_MODE' | 'AUTH_EMAIL_FROM'>>;

export function emailConfigured(env: MailEnvironment): boolean {
  if (!env.AUTH_EMAIL || !env.AUTH_EMAIL_FROM || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(env.AUTH_EMAIL_FROM)) return false;
  const origin = new URL(env.BETTER_AUTH_URL);
  if (env.AUTH_EMAIL_MODE === 'local') return env.PROBE_MODE === 'local' &&
    origin.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(origin.hostname);
  return env.AUTH_EMAIL_MODE === 'cloudflare' && env.PROBE_MODE !== 'local' && origin.protocol === 'https:' &&
    !/\.(example|invalid|test)$/.test(env.AUTH_EMAIL_FROM);
}

// Budget défensif : 50 messages/jour pour le service, 3/adresse/10 minutes.
// Les adresses sont HMACées pour ne pas ajouter de données personnelles aux compteurs.
export async function reserveAuthEmail(env: MailEnvironment, email: string, now = Date.now()): Promise<boolean> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(env.BETTER_AUTH_SECRET), {name: 'HMAC', hash: 'SHA-256'}, false, ['sign']);
  const digest = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(email.toLowerCase()));
  const address = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
  await env.DB.prepare('DELETE FROM auth_mail_limits WHERE expires_at <= ?').bind(now).run();
  for (const [scope, window, max] of [[address, 600_000, 3], ['daily', 86_400_000, 50]] as const) {
    const bucket = Math.floor(now / window);
    const result = await env.DB.prepare(`INSERT INTO auth_mail_limits(key,count,expires_at) VALUES(?,1,?)
      ON CONFLICT(key) DO UPDATE SET count=count+1 WHERE count < ? RETURNING count`)
      .bind(`${scope}:${bucket}`, (bucket + 1) * window, max).first();
    if (!result) return false;
  }
  return true;
}

export async function sendAuthEmail(env: MailEnvironment, to: string, purpose: 'verify' | 'reset', url: string) {
  if (!emailConfigured(env)) throw new Error('EMAIL_UNAVAILABLE');
  if (!await reserveAuthEmail(env, to)) {
    console.log(JSON.stringify({event: 'auth_email_limited', purpose}));
    return;
  }
  const subject = purpose === 'verify' ? 'Confirmez votre adresse e-mail — BienVu' : 'Votre mot de passe — BienVu';
  const instruction = purpose === 'verify' ? 'Confirmez votre adresse pour accéder à votre agence.' : 'Choisissez un nouveau mot de passe pour votre compte.';
  try {
    await env.AUTH_EMAIL!.send({from: env.AUTH_EMAIL_FROM!, to, subject,
      text: `${instruction}\n\n${url}\n\nCe lien expire dans ${purpose === 'verify' ? '60' : '30'} minutes.\nSi vous n’êtes pas à l’origine de cette demande, ignorez ce message.\n\nBienVu`});
    // Accepté par le transport, sans garantir la réception dans la messagerie.
    console.log(JSON.stringify({event: 'auth_email_submitted', purpose}));
  } catch (error) {
    const code = error && typeof error === 'object' ? Reflect.get(error, 'code') : undefined;
    const knownCodes = ['E_RECIPIENT_NOT_ALLOWED', 'E_RECIPIENT_SUPPRESSED', 'E_SENDER_NOT_VERIFIED',
      'E_SENDER_DOMAIN_NOT_AVAILABLE', 'E_DELIVERY_FAILED', 'E_RATE_LIMIT_EXCEEDED', 'E_DAILY_LIMIT_EXCEEDED', 'E_INTERNAL_SERVER_ERROR'];
    // Liste blanche seulement : les messages du fournisseur peuvent contenir une adresse ou un jeton.
    console.error(JSON.stringify({event: 'auth_email_failed', purpose,
      code: knownCodes.includes(code) ? code : 'EMAIL_DELIVERY_FAILED'}));
    throw new Error('EMAIL_DELIVERY_FAILED');
  }
}
