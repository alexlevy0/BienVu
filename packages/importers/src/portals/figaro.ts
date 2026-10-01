import {ImportFailure} from '@bienvu/contracts';
import {absolute, attr, children, descendants, tag, text, type HtmlNode} from '../html';
import {descriptionFromNodes, descriptionFromString} from '../description';
import {missing, numeric, unique, verified} from '../facts';
import {publicUrl} from '../network';
import type {ExtractedListing} from '../listing';

// Format du titre public observé le 01/10/2026. Les autres blocs du portail
// (taxe foncière, mensualités de crédit et annonces voisines) ne sont pas lus.
function summary(value: string) {
  const match = value.match(/^(Vente|Location) (maison|appartement) (?:(\d+) pièces? )?(?:([\d.,]+) m[²2] )?à (.+?) \((\d{2,5}|2[AB])\)$/i);
  if (!match) return null;
  return {transaction: match[1].toLowerCase() === 'vente' ? 'sale' as const : 'rent' as const,
    propertyType: match[2].toLowerCase() === 'maison' ? 'house' as const : 'apartment' as const,
    rooms: numeric(match[3]), area: numeric(match[4]), locality: match[5], department: match[6]};
}
function descriptionSection(nodes: HtmlNode[]) {
  const heads = nodes.filter(n => tag(n) === 'h2' && text(n) === 'Description');
  return heads.flatMap(head => {
    const parent = 'parentNode' in head ? head.parentNode : null;
    if (!parent) return [];
    const siblings = children(parent).filter(n => tag(n));
    const following = siblings.slice(siblings.findIndex(n => n === head) + 1);
    const next = following[0];
    // Un bloc de description, jamais le reste du document ou les recommandations.
    return next && ['p', 'div'].includes(tag(next)) && !descendants(next).some(n => ['h1', 'h2', 'h3', 'aside', 'nav'].includes(tag(n))) ? [next] : [];
  });
}
export function extractFigaro(nodes: HtmlNode[], documents: unknown[], url: string, canonicalUrl: string, id: string): ExtractedListing | undefined {
  const heads = nodes.filter(n => tag(n) === 'h1');
  if (!heads.some(n => summary(text(n)))) return undefined;
  if (heads.length !== 1) throw new ImportFailure('CONFLICTING_FACTS', 'Titre Figaro ambigu.');
  if (!nodes.some(n => tag(n) === 'link' && attr(n, 'rel').split(/\s+/).includes('canonical')))
    throw new ImportFailure('INCOMPLETE_LISTING', 'Référence canonique Figaro absente.');
  const title = text(heads[0]), facts = summary(title)!;
  const ogUrls = nodes.filter(n => tag(n) === 'meta' && attr(n, 'property') === 'og:url').map(n => absolute(attr(n, 'content'), url));
  for (const value of ogUrls) if (publicUrl(value).origin !== new URL(canonicalUrl).origin || publicUrl(value).pathname !== new URL(canonicalUrl).pathname)
    throw new ImportFailure('CONFLICTING_FACTS', 'Les métadonnées Figaro désignent une autre annonce.');
  type Obj = Record<string, unknown>;
  const obj = (value: unknown): Obj => value && typeof value === 'object' && !Array.isArray(value) ? value as Obj : {};
  const list = (value: unknown): unknown[] => value == null ? [] : Array.isArray(value) ? value : [value];
  const entities = documents.flatMap(d => Array.isArray(d) ? d : list(obj(d)['@graph'] ?? d)).map(obj);
  const products = entities.filter(d => list(d['@type']).includes('Product') && d.name === title);
  if (products.length > 1) throw new ImportFailure('CONFLICTING_FACTS', 'Plusieurs produits Figaro désignent la fiche.');
  const product = products[0];
  const productUrl = typeof product?.url === 'string' ? absolute(product.url, url) : null;
  if (productUrl && (publicUrl(productUrl).origin !== new URL(canonicalUrl).origin || publicUrl(productUrl).pathname !== new URL(canonicalUrl).pathname))
    throw new ImportFailure('CONFLICTING_FACTS', 'Le produit Figaro désigne une autre annonce.');
  // Un Product générique sans URL de fiche ne permet pas d'identifier ses médias.
  const boundProduct = productUrl ? product : undefined;
  const prices: number[] = [], priceEvidence: string[] = [];
  const titles = nodes.filter(n => tag(n) === 'title' || tag(n) === 'meta' && attr(n, 'property') === 'og:title')
    .map(n => tag(n) === 'title' ? text(n) : attr(n, 'content'));
  for (const value of titles) {
    const match = value.match(/^(.+?),\s*([\d\s.,]+)\s*€\s*:\s*Figaro Immobilier$/i);
    if (!match) continue;
    const metadata = summary(match[1]);
    if (!metadata) continue;
    // Le code postal peut être développé dans le title, sans changer la ville.
    for (const key of ['transaction', 'propertyType', 'locality', 'rooms', 'area'] as const)
      if (JSON.stringify(metadata[key]) !== JSON.stringify(facts[key]))
        throw new ImportFailure('CONFLICTING_FACTS', `Titre et métadonnées Figaro contradictoires : ${key}.`);
    const department = (code: string) => code.length === 5 ? code.slice(0, code.startsWith('97') ? 3 : 2) : code;
    if (department(metadata.department) !== department(facts.department))
      throw new ImportFailure('CONFLICTING_FACTS', 'Départements Figaro contradictoires.');
    const amount = numeric(match[2]);
    if (amount !== null) {prices.push(amount); priceEvidence.push(value);}
  }
  for (const offer of list(boundProduct?.offers).map(obj)) {
    if (typeof offer.businessFunction === 'string' && /(?:^|[#/])(Sell|LeaseOut)$/.test(offer.businessFunction)
      && facts.transaction !== (offer.businessFunction.endsWith('Sell') ? 'sale' : 'rent'))
      throw new ImportFailure('CONFLICTING_FACTS', 'Transaction du produit Figaro contradictoire.');
    const amount = numeric(offer.price);
    if (amount !== null && offer.priceCurrency === 'EUR') {prices.push(amount); priceEvidence.push(JSON.stringify(offer));}
  }
  const parent = 'parentNode' in heads[0] ? heads[0].parentNode : null;
  const siblings = parent ? children(parent).filter(n => tag(n)) : [];
  const titleIndex = siblings.findIndex(n => n === heads[0]);
  const afterTitle = siblings.slice(titleIndex + 1, titleIndex + 4);
  const rents: Array<'included' | 'excluded'> = [];
  for (const node of afterTitle) {
    if (!['p', 'span', 'div'].includes(tag(node)) || descendants(node).some(n => ['h1', 'h2', 'article', 'aside', 'a'].includes(tag(n)))) break;
    const value = text(node), match = value.match(/^([\d\s.,]+)\s*€(?:\s*\([\d\s.,]+\s*€\s*\/\s*m[²2]\))?(?:\s*\/?\s*(?:par\s+)?mois(?:\s+(charges comprises|charges incluses|hors charges))?)?$/i);
    if (!match) continue;
    const amount = numeric(match[1]); if (amount !== null) {prices.push(amount); priceEvidence.push(value);}
    if (match[2]) rents.push(/^hors/i.test(match[2]) ? 'excluded' : 'included');
  }
  const amount = unique(prices, 'Prix Figaro contradictoires.'), charges = unique(rents, 'Charges Figaro contradictoires.');
  const price = amount !== undefined && (facts.transaction === 'sale' || charges)
    ? verified({amountCents: Math.round(amount * 100), currency: 'EUR' as const,
      period: facts.transaction === 'sale' ? 'total' as const : 'month' as const,
      charges: facts.transaction === 'sale' ? 'not_applicable' as const : charges!}, 'EUR_cent',
      'Figaro.title/og:title + h1 adjacent price', priceEvidence.join(' | ')) : missing('EUR_cent');
  const description = descriptionFromString(boundProduct?.description, 'Figaro.JSON-LD.Product.description')
    ?? descriptionFromNodes(descriptionSection(nodes), 'Figaro.h2[Description] + description');
  if (description && /(?:…|\.\.\.)$/.test(description.text)) description.truncated = true;
  // Une image Open Graph est liée à la fiche par og:url. Elle ne suffit jamais
  // à déclarer une galerie complète ; les photos JSON-LD sont fusionnées ailleurs.
  const photoUrls = [...list(boundProduct?.image).map(v => typeof v === 'string' ? v : obj(v).contentUrl ?? obj(v).url)
    .filter((v): v is string => typeof v === 'string' && Boolean(v)).map(v => absolute(v, url)),
    ...(ogUrls.length ? nodes.filter(n => tag(n) === 'meta' && attr(n, 'property') === 'og:image')
      .map(n => absolute(attr(n, 'content'), url)) : [])];
  return {canonicalUrl, sourceListingId: id, adapterVersion: 'figaro-dom/4.1', transaction: facts.transaction, description,
    facts: {title: verified(title, 'text', 'Figaro.h1'), locality: verified(facts.locality, 'text', 'Figaro.h1.locality'),
      propertyType: verified(facts.propertyType, 'category', 'Figaro.h1.propertyType'),
      rooms: facts.rooms && Number.isInteger(facts.rooms) ? verified(facts.rooms, 'rooms', 'Figaro.h1.rooms') : missing('rooms'),
      area: facts.area ? verified(facts.area, 'm2', 'Figaro.h1.area') : missing('m2'), price},
    photoUrls: [...new Set(photoUrls)], warnings: [...(price.status === 'missing' ? ['Prix omis : montant, période ou charges non vérifiables.'] : []),
      ...(description?.truncated ? ['La description publiée est abrégée : complétez-la avant de créer la vidéo.'] : [])]};
}
