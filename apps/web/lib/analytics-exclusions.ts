// Recognition is intentionally conservative: a normal browser is not proof of
// a human visit. Audits with an ordinary UA can opt out with the URL/header.
export function automatedAnalyticsAgent(agent: string) {
  return /bot|crawler|spider|headless|curl|wget|python|undici|node|facebookexternalhit|lighthouse|pagespeed|webpagetest|gtmetrix|pingdom|speedcurve/i.test(
    agent,
  );
}
export function excludedAnalyticsRequest(request: Request) {
  return (
    automatedAnalyticsAgent(request.headers.get('user-agent') ?? '') ||
    request.headers.get('x-bienvu-audit') === '1' ||
    new URL(request.url).searchParams.get('bienvu_audit') === '1'
  );
}
