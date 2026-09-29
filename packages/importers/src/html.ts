import {parse, type DefaultTreeAdapterMap} from 'parse5';
import {ImportFailure} from '@bienvu/contracts';
import {IMPORT_LIMITS} from './network';
export type HtmlNode = DefaultTreeAdapterMap['node'];
export const attr = (node: HtmlNode, name: string) => 'attrs' in node ? node.attrs.find(a => a.name === name)?.value ?? '' : '';
export const tag = (node: HtmlNode) => 'tagName' in node ? node.tagName : '';
export const children = (node: HtmlNode) => 'childNodes' in node ? node.childNodes : [];
export function descendants(root: HtmlNode): HtmlNode[] {
  const result: HtmlNode[] = [], queue: Array<[HtmlNode, number]> = [[root, 0]];
  while (queue.length) {
    const [node, depth] = queue.pop()!;
    if (result.length >= 30_000 || depth > 100) throw new ImportFailure('NOT_A_LISTING', 'Document trop complexe.');
    result.push(node);
    for (const child of [...children(node)].reverse()) queue.push([child, depth + 1]);
  }
  return result;
}
export const rawText = (node: HtmlNode): string => descendants(node).filter(n => n.nodeName === '#text').map(n => 'value' in n ? n.value : '').join('');
export const text = (node: HtmlNode | undefined): string => node ? rawText(node).replace(/\s+/g, ' ').trim() : '';
export const hasClass = (node: HtmlNode, cls: string) => attr(node, 'class').split(/\s+/).includes(cls);
export function htmlDocument(html: string) {
  if (new TextEncoder().encode(html).length > IMPORT_LIMITS.htmlBytes) throw new ImportFailure('NOT_A_LISTING', 'HTML trop volumineux.');
  const root = parse(html), nodes = descendants(root);
  const title = text(nodes.find(n => tag(n) === 'title'));
  const headings = nodes.filter(n => tag(n) === 'h1').map(text).join(' ').slice(0, 1000);
  const mainTitle = `${title} ${headings}`;
  const challengeFrame = nodes.some(n => tag(n) === 'iframe' && /^https:\/\/(?:geo|ct)\.captcha-delivery\.com\/(?:captcha|challenge)\//.test(attr(n, 'src')));
  const shortBody = nodes.filter(n => ['p', 'h1'].includes(tag(n))).map(text).join(' ');
  if (/captcha|access denied|accès refusé|verify you are human|just a moment|vérifiez que vous êtes humain/i.test(mainTitle)
    || challengeFrame || shortBody.length < 600 && /please enable js and disable any ad blocker|vérification de sécurité requise/i.test(shortBody))
    throw new ImportFailure('SOURCE_BLOCKED', 'Protection d’accès détectée.', 'challenge');
  if (/too many requests|trop de requêtes|limite de requêtes atteinte/i.test(mainTitle))
    throw new ImportFailure('SOURCE_BLOCKED', 'La source limite les requêtes.', 'rate_limited');
  if (/^(?:connexion|se connecter|sign in|log in|authentification)(?:\s*[|—–-]|\s*$)/i.test(title)
    || /connectez-vous pour (?:consulter|accéder|voir) (?:à )?(?:cette\s+|l[’'])annonce/i.test(headings))
    throw new ImportFailure('SOURCE_BLOCKED', 'La source demande une connexion.', 'login_required');
  if (/(?:cette |l[’'])annonce (?:n[’']est plus disponible|a été (?:supprimée|retirée)|est expirée)|annonce (?:introuvable|supprimée|retirée)|page (?:introuvable|non trouvée)|404 not found/i.test(mainTitle))
    throw new ImportFailure('SOURCE_UNAVAILABLE', 'Cette annonce n’est plus accessible.', 'not_found');
  return {root, nodes, title};
}
export function absolute(value: string, base: string) {
  try {return new URL(value, base).href;} catch {throw new ImportFailure('UNSAFE_URL', 'URL de média invalide.');}
}
export function imageCandidate(node: HtmlNode, base: string) {
  const label = `${attr(node, 'alt')} ${attr(node, 'class')} ${attr(node, 'src')}`;
  if (/\b(?:logo|avatar|floor.?plan|plan de|plan du|dpe|ges|publicité)\b/i.test(label)) return null;
  const srcset = attr(node, 'data-srcset') || attr(node, 'srcset');
  const variants = srcset.split(',').map(v => v.trim().match(/^(\S+)\s+(\d+(?:\.\d+)?)(w|x)$/)).filter(v => v !== null);
  const kinds = new Set(variants.map(v => v[3]));
  const best = kinds.size === 1 ? variants.sort((a, b) => Number(b[2]) - Number(a[2]))[0]?.[1] : undefined;
  const url = best || attr(node, 'data-src') || attr(node, 'data-lazy-src') || attr(node, 'src');
  return url ? absolute(url, base) : null;
}
