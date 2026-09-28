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
  if (/captcha|access denied|accès refusé|verify you are human|just a moment/i.test(title))
    throw new ImportFailure('SOURCE_BLOCKED', 'Protection d’accès détectée.');
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
