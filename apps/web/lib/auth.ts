import {betterAuth} from 'better-auth';
import {ensureAgency} from '@bienvu/db';
import {sendAuthEmail} from './auth-email';

export type AuthEnvironment = Pick<CloudflareEnv, 'DB' | 'PROBE_MODE' | 'BETTER_AUTH_URL' | 'BETTER_AUTH_SECRET' | 'GOOGLE_CLIENT_ID' | 'GOOGLE_CLIENT_SECRET'> &
  Partial<Pick<CloudflareEnv, 'AUTH_EMAIL' | 'AUTH_EMAIL_MODE' | 'AUTH_EMAIL_FROM' | 'AUTH_EMAIL_VERIFICATION_BYPASS'>>;

export function authOrigin(env: AuthEnvironment): string {
  const url = new URL(env.BETTER_AUTH_URL);
  const local = env.PROBE_MODE === 'local' && url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname);
  if (url.origin !== env.BETTER_AUTH_URL || url.username || url.password || (url.protocol !== 'https:' && !local))
    throw new Error('INVALID_AUTH_ORIGIN');
  if (!env.BETTER_AUTH_SECRET || env.BETTER_AUTH_SECRET.length < 32) throw new Error('AUTH_SECRET_REQUIRED');
  return url.origin;
}

export function googleConfigured(env: AuthEnvironment) {
  return Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);
}

export function emailVerificationBypassed(env: AuthEnvironment): boolean {
  if (env.AUTH_EMAIL_VERIFICATION_BYPASS !== 'true') return false;
  const url = new URL(authOrigin(env));
  if (env.PROBE_MODE !== 'local' || url.protocol !== 'http:' || !['localhost', '127.0.0.1'].includes(url.hostname))
    throw new Error('EMAIL_VERIFICATION_BYPASS_LOCAL_ONLY');
  return true;
}

// Une instance par requête : aucun binding ni état utilisateur partagé entre Workers.
export function createAuth(env: AuthEnvironment, waitUntil?: (task: Promise<unknown>) => void) {
  const origin = authOrigin(env);
  const bypassVerification = emailVerificationBypassed(env);
  const discardTokens = {accessToken: null, refreshToken: null, idToken: null,
    accessTokenExpiresAt: null, refreshTokenExpiresAt: null};
  return betterAuth({
    appName: 'BienVu', baseURL: origin, secret: env.BETTER_AUTH_SECRET, database: env.DB,
    trustedOrigins: [origin],
    emailAndPassword: {enabled: true, minPasswordLength: 12, maxPasswordLength: 128,
      requireEmailVerification: !bypassVerification, autoSignIn: bypassVerification, resetPasswordTokenExpiresIn: 30 * 60,
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: ({user, token}) => sendAuthEmail(env, user.email, 'reset', `${origin}/connexion?mode=reset#token=${encodeURIComponent(token)}`)},
    emailVerification: {sendOnSignUp: !bypassVerification, sendOnSignIn: false, autoSignInAfterVerification: false, expiresIn: 60 * 60,
      sendVerificationEmail: ({user, url}) => sendAuthEmail(env, user.email, 'verify', url)},
    user: {modelName: 'auth_user', changeEmail: {enabled: false}, deleteUser: {enabled: false},
      validateUserInfo: ({user, source}) => source.method === 'email-password' && source.action === 'create-user' || user.emailVerified === true
        ? undefined : {error: 'VERIFIED_EMAIL_REQUIRED'}},
    session: {modelName: 'auth_session', expiresIn: 7 * 24 * 60 * 60, updateAge: 24 * 60 * 60,
      cookieCache: {enabled: false}},
    account: {modelName: 'auth_account', accountLinking: {enabled: true, requireLocalEmailVerified: true,
      trustedProviders: [], allowDifferentEmails: false}, encryptOAuthTokens: true,
      storeStateStrategy: 'database', storeAccountCookie: false, skipStateCookieCheck: false},
    verification: {modelName: 'auth_verification'},
    socialProviders: googleConfigured(env) ? {google: {clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET,
      prompt: 'select_account', accessType: 'online', includeGrantedScopes: false}} : {},
    advanced: {useSecureCookies: origin.startsWith('https:'), cookiePrefix: 'bienvu',
      ...(waitUntil ? {backgroundTasks: {handler: (task: Promise<unknown>) => waitUntil(task.catch(() => {
        // Ni adresse, ni lien, ni erreur du fournisseur dans les traces.
        console.error(JSON.stringify({event: 'auth_background_failed'}));
      }))}} : {}),
      defaultCookieAttributes: {httpOnly: true, sameSite: 'lax', path: '/'},
      ipAddress: {ipAddressHeaders: ['cf-connecting-ip']}, database: {generateId: 'uuid'}},
    rateLimit: {enabled: true, storage: 'database', modelName: 'auth_rate_limit', window: 60, max: 60,
      customRules: {'/sign-in/social': {window: 60, max: 10}, '/sign-in/email': {window: 60, max: 5},
        '/sign-up/email': {window: 60, max: 3}, '/request-password-reset': {window: 60, max: 3},
        '/send-verification-email': {window: 60, max: 3}, '/reset-password': {window: 60, max: 5}}},
    logger: {disabled: true},
    onAPIError: {errorURL: `${origin}/connexion?error=oauth`},
    databaseHooks: {
      user: {create: {before: async (user, context) => {
        // Seulement le flux e-mail local ; aucune confiance supplémentaire accordée à Google.
        if (bypassVerification && context?.path === '/sign-up/email') return {data: {...user, emailVerified: true}};
      }}},
      // Le fournisseur ne sert qu'à l'identité ; aucun accès ultérieur à ses API.
      account: {create: {before: async data => ({data: {...data, ...discardTokens}})},
        update: {before: async data => ({data: {...data, ...discardTokens}})}},
      session: {create: {before: async (session, context) => {
        // Better Auth a déjà vérifié le mot de passe avant de créer cette session.
        // Ne jamais vérifier un compte sur la seule présence de son adresse dans la requête.
        if (bypassVerification && context?.path === '/sign-in/email')
          await env.DB.prepare('UPDATE auth_user SET emailVerified=1,updatedAt=? WHERE id=? AND emailVerified=0')
            .bind(Date.now(), session.userId).run();
        const user = await env.DB.prepare('SELECT id FROM auth_user WHERE id=? AND emailVerified=1').bind(session.userId).first();
        if (!user) throw new Error('VERIFIED_OWNER_REQUIRED');
      }, after: async session => {
        const user = await env.DB.prepare('SELECT id,email FROM auth_user WHERE id=? AND emailVerified=1')
          .bind(session.userId).first<{id: string; email: string}>();
        if (!user) throw new Error('VERIFIED_OWNER_REQUIRED');
        await ensureAgency(env.DB, user);
      }}},
    },
  });
}
