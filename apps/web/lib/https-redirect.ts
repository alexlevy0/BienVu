type PublicOrigin = {PROBE_MODE: string; BETTER_AUTH_URL: string};

export function httpsRedirect(request: Request, env: PublicOrigin): Response | null {
  const input = new URL(request.url);
  if (env.PROBE_MODE !== 'remote' || input.protocol !== 'http:') return null;
  let destination: URL;
  try { destination = new URL(env.BETTER_AUTH_URL); }
  catch { return new Response('Origine HTTPS indisponible', {status: 503}); }
  if (destination.protocol !== 'https:' || destination.origin !== env.BETTER_AUTH_URL)
    return new Response('Origine HTTPS indisponible', {status: 503});
  // L'hôte vient de la configuration serveur, jamais d'un en-tête fourni par le client.
  destination.pathname = input.pathname;
  destination.search = input.search;
  return Response.redirect(destination.href, 308);
}
