import {ImportFailure} from '@bienvu/contracts';
import {absolute, attr, children, descendants, hasClass, tag, text, type HtmlNode} from '../html';
import {descriptionFromNodes} from '../description';
import {clean, missing, numeric, unique, verified} from '../facts';
import {IMPORT_LIMITS, publicUrl} from '../network';
import type {ExtractedListing} from '../listing';

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj => v !== null && typeof v === 'object' && !Array.isArray(v) ? v as Obj : {};

// Format observé le 28/09/2026 dans le DOM public après JavaScript.
// Aucun endpoint deviné, aucune URL haute résolution reconstruite.
export function extractBienici(nodes: HtmlNode[], documents: unknown[], url: string, canonicalUrl: string, id: string): ExtractedListing | undefined {
  const blocks = nodes.filter(n => hasClass(n, 'detailedSheetFirstBlock'));
  if (!blocks.length) return undefined; // Le HTML initial nécessite éventuellement un navigateur.
  if (blocks.length !== 1) throw new ImportFailure('CONFLICTING_FACTS', 'Plusieurs fiches Bien’ici.');
  const scoped = descendants(blocks[0]), heads = scoped.filter(n => tag(n) === 'h1');
  if (heads.length !== 1 || !nodes.some(n => tag(n) === 'link' && attr(n, 'rel') === 'canonical'))
    throw new ImportFailure('INCOMPLETE_LISTING', 'Fiche Bien’ici non identifiée.');
  const heading = children(heads[0]).filter(n => !hasClass(n, 'fullAddress')).map(text).join(' ').trim();
  const match = heading.match(/^(Achat|Location) (appartement|maison) (\d+)\s*pièces?\s+([\d.,]+)\s*m[²2]$/i);
  const fullAddress = text(scoped.find(n => hasClass(n, 'fullAddress')));
  const locality = fullAddress.match(/^\d{5}\s*(.+?)(?:\s+\(.+\))?$/)?.[1];
  if (!match || !locality) throw new ImportFailure('INCOMPLETE_LISTING', 'Titre ou localisation Bien’ici non reconnu.');
  const transaction = match[1].toLowerCase() === 'achat' ? 'sale' : 'rent', propertyType = match[2].toLowerCase() === 'maison' ? 'house' : 'apartment';
  if (!new URL(url).pathname.startsWith(`/annonce/${transaction === 'sale' ? 'vente' : 'location'}/`))
    throw new ImportFailure('CONFLICTING_FACTS', 'Transaction Bien’ici contradictoire.');
  const structured = documents.map(obj), homes = structured.filter(n => n['@type'] === 'Accommodation'), products = structured.filter(n => n['@type'] === 'Product');
  if (homes.length !== 1 || products.length !== 1) throw new ImportFailure('INCOMPLETE_LISTING', 'Données Bien’ici absentes ou multiples.');
  const home = homes[0], product = products[0], size = obj(home.floorSize);
  unique([locality, clean(obj(home.address).addressLocality)], 'Localisations Bien’ici contradictoires.');
  const area = numeric(match[4]), rooms = numeric(match[3]);
  if (!area || !rooms || size.unitCode !== 'MTK' || !numeric(size.value) || !numeric(home.numberOfRooms))
    throw new ImportFailure('INCOMPLETE_LISTING', 'Dimensions Bien’ici non vérifiables.');
  unique([area, numeric(size.value)], 'Surfaces Bien’ici contradictoires.');
  unique([rooms, numeric(home.numberOfRooms)], 'Pièces Bien’ici contradictoires.');
  if (!clean(product.name).startsWith(`${clean(heading)}, ${locality} - `))
    throw new ImportFailure('CONFLICTING_FACTS', 'Le produit structuré désigne un autre bien.');

  const priceText = scoped.filter(n => hasClass(n, 'ad-price__the-price')).map(text);
  const displayed = unique(priceText.map(p => numeric(p.match(/^([\d\s.,]+)\s*€$/)?.[1])).filter((v): v is number => v !== null), 'Prix Bien’ici contradictoires.');
  const spec = obj(obj(product.offers).priceSpecification), amount = numeric(spec.price);
  if (displayed !== undefined && amount !== null) unique([displayed, amount], 'Prix affiché et structuré Bien’ici contradictoires.');
  const period = unique(scoped.filter(n => hasClass(n, 'ad-price__per-month')).map(text), 'Unités de loyer contradictoires.');
  const charges = period === 'par mois charges comprises' ? 'included' as const : period === 'par mois hors charges' ? 'excluded' as const : null;
  const price = displayed !== undefined && amount !== null && spec.priceCurrency === 'EUR' && (transaction === 'sale' || charges)
    ? verified({amountCents: Math.round(amount * 100), currency: 'EUR' as const, period: transaction === 'sale' ? 'total' as const : 'month' as const,
      charges: transaction === 'sale' ? 'not_applicable' as const : charges!}, 'EUR_cent', 'Bienici.Product.offers + .detailedSheetPrice', {spec, displayed, period}) : missing('EUR_cent');
  const gallery = scoped.filter(n => hasClass(n, 'slideImg')).flatMap(descendants).filter(n => tag(n) === 'img' && attr(n, 'u') === 'image')
    .map(n => attr(n, 'src2') || attr(n, 'src')).filter(Boolean).map(v => absolute(v, url));
  const photos = new Map<string, string>();
  for (const value of gallery) {
    const image = publicUrl(value);
    if (image.hostname !== 'file.bienici.com' || !image.pathname.startsWith(`/photo/${id}_`))
      throw new ImportFailure('CONFLICTING_FACTS', 'Image étrangère à la référence Bien’ici.');
    if (!photos.has(image.pathname)) photos.set(image.pathname, image.href);
  }
  // Le JSON-LD peut fournir l'original de la première photo. Il remplace sa
  // vignette uniquement si son chemin existe déjà dans la galerie du bien.
  if (typeof product.image === 'string') {
    const image = publicUrl(product.image);
    if (image.hostname !== 'file.bienici.com' || !photos.has(image.pathname))
      throw new ImportFailure('CONFLICTING_FACTS', 'Photo structurée hors galerie Bien’ici.');
    photos.set(image.pathname, image.href);
  }
  const descriptions = nodes.filter(n => hasClass(n, 'vue-description')).flatMap(descendants).filter(n => hasClass(n, 'see-more-description__content'));
  return {canonicalUrl, sourceListingId: id, adapterVersion: 'bienici-dom/4.0', transaction,
    description: descriptionFromNodes(descriptions, '.vue-description .see-more-description__content'),
    facts: {title: verified(`${heading}, ${locality}`, 'text', '.detailedSheetFirstBlock h1'),
      propertyType: verified(propertyType, 'category', '.detailedSheetFirstBlock h1', match[2]), locality: verified(locality, 'text', '.fullAddress + Accommodation.address'),
      area: verified(area, 'm2', 'h1 + Accommodation.floorSize'), rooms: verified(rooms, 'rooms', 'h1 + Accommodation.numberOfRooms'), price},
    photoUrls: [...photos.values()].slice(0, IMPORT_LIMITS.candidates), warnings: price.status === 'missing' ? ['Prix omis : montant, période ou charges non vérifiables.'] : []};
}
