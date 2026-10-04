import {EmailRequest, EmailSignIn, EmailSignUp, PasswordReset} from '@bienvu/contracts';
import {authOrigin, createAuth, emailVerificationBypassed, googleConfigured, type AuthEnvironment} from './auth';
import {emailConfigured} from './auth-email';
import {assertSameOrigin, boundedJson, RequestFailure, respond} from './http';
import {authLoginPath, authReturnPath} from './auth-navigation';

export function handleAuthRequest(request: Request, env: AuthEnvironment, waitUntil?: (task: Promise<unknown>) => void) {
  return respond(async () => {
    const inputURL = new URL(request.url), path = inputURL.pathname;
    const origin = authOrigin(env);
    const returnTo = authReturnPath(inputURL.searchParams.get('next'));
    const bypassVerification = emailVerificationBypassed(env);
    if (bypassVerification && inputURL.origin !== origin) throw new RequestFailure('FORBIDDEN');
    if (path === '/api/auth/status' && request.method === 'GET')
      return Response.json({google: googleConfigured(env), email: true, emailDelivery: emailConfigured(env)});
    const auth = createAuth(env, waitUntil);
    if (path === '/api/auth/get-session' && request.method === 'GET') {
      const session = await auth.api.getSession({headers: request.headers});
      return Response.json(session?.user.emailVerified ? {user: {id: session.user.id, name: session.user.name, email: session.user.email},
        session: {expiresAt: session.session.expiresAt}} : null);
    }
    let body: Record<string, unknown> | undefined;
    if (request.method === 'POST') {
      assertSameOrigin(request, env);
      if (path === '/api/auth/sign-out') body = {};
      else if (path === '/api/auth/sign-in/social') {
        const input = await boundedJson(request);
        const continueListing = input && typeof input === 'object' && 'continueListing' in input && input.continueListing === true;
        const continueTrial = input && typeof input === 'object' && 'continueTrial' in input && input.continueTrial === true;
        if (!input || typeof input !== 'object' || Object.keys(input).length !== (continueListing || continueTrial ? 2 : 1) ||
          !('provider' in input) || input.provider !== 'google')
          throw new RequestFailure('VALIDATION_ERROR');
        if (!googleConfigured(env)) throw new RequestFailure('AUTH_UNAVAILABLE');
        body = {provider: 'google', callbackURL: returnTo ?? (continueTrial ? '/essai/recuperer' : continueListing ? '/' : '/agence'), errorCallbackURL: authLoginPath(returnTo, {error:'oauth', ...(!returnTo && continueTrial ? {trial:'1'} : {})}), disableRedirect: true};
      } else {
        const schema = ({'/api/auth/sign-up/email': EmailSignUp, '/api/auth/sign-in/email': EmailSignIn,
          '/api/auth/request-password-reset': EmailRequest, '/api/auth/send-verification-email': EmailRequest,
          '/api/auth/reset-password': PasswordReset} as const)[path as '/api/auth/sign-up/email'];
        if (!schema) throw new RequestFailure('NOT_FOUND');
        const parsed = schema.safeParse(await boundedJson(request));
        if (!parsed.success) throw new RequestFailure('VALIDATION_ERROR');
        body = {...parsed.data};
        const needsEmail = path === '/api/auth/sign-up/email' ? !bypassVerification :
          ['/api/auth/request-password-reset', '/api/auth/send-verification-email'].includes(path);
        if (needsEmail && !emailConfigured(env))
          throw new RequestFailure('EMAIL_UNAVAILABLE');
        if (path === '/api/auth/sign-up/email') body.name = String(body.email).split('@')[0];
        if (path === '/api/auth/sign-up/email' || path === '/api/auth/send-verification-email') body.callbackURL = authLoginPath(returnTo, {verified:'1'});
        if (path === '/api/auth/sign-in/email') body.callbackURL = returnTo ?? '/agence';
      }
      const headers = new Headers(request.headers);
      headers.set('content-type', 'application/json'); headers.delete('content-length');
      request = new Request(`${origin}${path}`, {method: 'POST', headers, body: JSON.stringify(body)});
    } else if (path === '/api/auth/verify-email' && request.method === 'GET') {
      const token = inputURL.searchParams.get('token');
      if (!token || token.length > 4096) throw new RequestFailure('AUTH_LINK_INVALID');
      const url = new URL(`${origin}${path}`);
      let verifiedReturn: string | null = null;
      try {
        const callback = new URL(inputURL.searchParams.get('callbackURL') ?? '', origin);
        if (callback.origin === origin && callback.pathname === '/connexion') verifiedReturn = authReturnPath(callback.searchParams.get('next'));
      } catch {/* Discard untrusted callback URLs. */}
      url.searchParams.set('token', token); url.searchParams.set('callbackURL', authLoginPath(verifiedReturn, {verified:'1'}));
      request = new Request(url, {headers: request.headers});
    } else if (!(path === '/api/auth/callback/google' && request.method === 'GET')) throw new RequestFailure('NOT_FOUND');

    const response = await auth.handler(request);
    if (response.status >= 400) {
      if (response.status === 429) throw new RequestFailure('RATE_LIMITED');
      const failure = await response.json().catch(() => ({})) as {code?: string};
      if (path === '/api/auth/sign-in/email')
        throw new RequestFailure(failure.code === 'EMAIL_NOT_VERIFIED' ? 'EMAIL_NOT_VERIFIED' : 'AUTH_CREDENTIALS');
      if (path === '/api/auth/reset-password') throw new RequestFailure('AUTH_LINK_INVALID');
      throw new RequestFailure('AUTH_FAILED');
    }
    const location = response.headers.get('location');
    if (location && response.status >= 300 && response.status < 400) {
      const redirect = new URL(location, origin);
      if (redirect.origin !== origin) throw new RequestFailure('AUTH_FAILED');
      const headers = new Headers(response.headers);
      if (redirect.searchParams.has('error')) headers.set('location', origin + authLoginPath(authReturnPath(redirect.searchParams.get('next')), {error:path === '/api/auth/verify-email' ? 'verification' : 'oauth', ...(redirect.searchParams.get('trial') === '1' ? {trial:'1'} : {})}));
      return new Response(null, {status: response.status, headers});
    }
    // Les cookies passent ; ni jeton de session, ni profil synthétique ne sortent dans le JSON.
    if (request.method === 'POST' && path !== '/api/auth/sign-in/social') {
      const headers = new Headers(response.headers);
      headers.delete('location'); headers.delete('content-length');
      return Response.json({ok: true, ...(path === '/api/auth/sign-up/email' && bypassVerification ? {authenticated: true} : {})}, {headers});
    }
    return new Response(response.body, response);
  });
}
