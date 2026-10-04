// Login may return to a studio page, never to an API or an external origin.
const destinations = new Set(['/', '/agence', '/publications', '/editeur', '/abonnement', '/equipe', '/projets', '/historique']);
export function authReturnPath(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 2048 || !value.startsWith('/') || value.startsWith('//') || /[\\\u0000-\u0020]/.test(value)) return null;
  try {
    const origin = 'https://navigation.bienvu.invalid', url = new URL(value, origin);
    return url.origin === origin && destinations.has(url.pathname) ? url.pathname + url.search + url.hash : null;
  } catch {return null;}
}
export function authLoginPath(next: string | null, parameters: Record<string, string> = {}) {
  const query = new URLSearchParams({...parameters, ...(next ? {next} : {})});
  return '/connexion' + (query.size ? '?' + query : '');
}
