import {parseFragment} from 'parse5';
import {DESCRIPTION_MAX_CHARACTERS, ListingDescription} from '@bienvu/contracts';
import {attr, children, descendants, tag, type HtmlNode} from './html';

const ignored = new Set(['script', 'style', 'template', 'noscript', 'iframe', 'object', 'embed', 'svg', 'math',
  'form', 'button', 'input', 'select', 'textarea', 'nav', 'aside', 'header', 'footer']);
const blocks = new Set(['p', 'div', 'section', 'article', 'blockquote', 'ul', 'ol', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'tr']);

// Aucune exécution HTML ni récupération de ressource. Les liens deviennent du
// texte ; paragraphes et sauts de ligne restent lisibles dans la description.
function plainText(root: HtmlNode) {
  descendants(root); // mêmes plafonds de profondeur/nombre de nœuds que la page.
  const parts: string[] = [];
  function visit(node: HtmlNode) {
    const name = tag(node);
    if (ignored.has(name) || attr(node, 'aria-hidden') === 'true'
      || 'attrs' in node && node.attrs.some(a => a.name === 'hidden')) return;
    if (node.nodeName === '#text' && 'value' in node) {
      parts.push(node.value.replace(/\r\n?/g, '\n').replace(/[^\S\n]+/g, ' ')); return;
    }
    if (name === 'br') {parts.push('\n'); return;}
    if (blocks.has(name)) parts.push('\n\n');
    for (const child of children(node)) visit(child);
    if (blocks.has(name)) parts.push('\n\n');
  }
  visit(root);
  return parts.join('').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
    .replace(/[^\S\n]+/g, ' ').replace(/ *\n */g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}
function description(text: string, sourcePath: string, inputTruncated = false): ListingDescription | null {
  if (!text) return null;
  const truncated = inputTruncated || text.length > DESCRIPTION_MAX_CHARACTERS;
  const value = text.slice(0, DESCRIPTION_MAX_CHARACTERS).replace(/[\uD800-\uDBFF]$/, '').trimEnd();
  return ListingDescription.parse({text: value, sourcePath, truncated});
}
export function descriptionFromString(value: unknown, sourcePath: string): ListingDescription | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  const maximumInput = 128_000;
  return description(plainText(parseFragment(value.slice(0, maximumInput))), sourcePath, value.length > maximumInput);
}
export function descriptionFromNodes(nodes: HtmlNode[], sourcePath: string): ListingDescription | null {
  // Des copies mobile/desktop identiques sont permises ; des textes différents
  // ne sont jamais concaténés au risque d'importer un autre bien.
  const values = [...new Set(nodes.map(plainText).filter(Boolean))];
  return values.length === 1 ? description(values[0], sourcePath) : null;
}
