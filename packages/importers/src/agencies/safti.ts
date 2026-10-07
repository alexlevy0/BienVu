import {ImportFailure, sameSourceHost} from '@bienvu/contracts';
import {absolute, attr, children, descendants, hasClass, rawText, tag, text, type HtmlNode} from '../html';
import {descriptionFromNodes, descriptionFromString} from '../description';
import {clean, missing, numeric, unique, verified} from '../facts';
import {IMPORT_LIMITS, publicUrl} from '../network';
import type {ExtractedListing} from '../listing';

type Obj = Record<string, unknown>;
const obj = (value: unknown): Obj => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Obj : {};
const values = (value: unknown): unknown[] => value == null ? [] : Array.isArray(value) ? value : [value];

// Payloads Next publics observés le 07/10/2026. Lire seulement leur JSON :
// aucun script exécuté, aucune référence distante résolue. Les lignes texte
// Flight ont une longueur UTF-8 et peuvent contenir des retours à la ligne.
function embeddedListing(nodes: HtmlNode[]): Obj | undefined {
  const frames = nodes.filter(n => tag(n) === 'script').flatMap(n => {
    const match = rawText(n).match(/^\s*self\.__next_f\.push\(([\s\S]+)\)\s*;?\s*$/);
    if (!match) return [];
    try {const frame: unknown = JSON.parse(match[1]); return Array.isArray(frame) && frame[0] === 1 && typeof frame[1] === 'string' ? [frame[1]] : [];}
    catch {return [];}
  });
  const bytes = new TextEncoder().encode(frames.join('')), decoder = new TextDecoder(), models: unknown[] = [];
  let offset = 0;
  while (offset < bytes.length) {
    const colon = bytes.indexOf(58, offset);
    // Les hints de préchargement (:HL) n'ont pas d'identifiant de modèle.
    if (colon < 0 || !/^[\da-f]*$/i.test(decoder.decode(bytes.subarray(offset, colon)))) break;
    if (bytes[colon + 1] === 84) {
      const comma = bytes.indexOf(44, colon + 2), lengthText = decoder.decode(bytes.subarray(colon + 2, comma));
      if (comma < 0 || !/^[\da-f]{1,8}$/i.test(lengthText)) break;
      offset = comma + 1 + Number.parseInt(lengthText, 16); continue;
    }
    const newline = bytes.indexOf(10, colon + 1), end = newline < 0 ? bytes.length : newline;
    const row = decoder.decode(bytes.subarray(colon + 1, end)); offset = end + 1;
    if (!/^[\[{]/.test(row)) continue;
    try {models.push(JSON.parse(row) as unknown);} catch { /* Un modèle incomplet ne devient pas une annonce. */ }
  }
  const records: Obj[] = [], queue = models.map(value => ({value, depth: 0}));
  let visited = 0;
  while (queue.length) {
    const {value, depth} = queue.pop()!;
    if (++visited > 30_000 || depth > 100) throw new ImportFailure('NOT_A_LISTING', 'Données SAFTI trop complexes.');
    if (!value || typeof value !== 'object') continue;
    const record = obj(obj(value).annonce);
    if (Object.keys(record).length) records.push(record);
    for (const child of Object.values(value)) if (child && typeof child === 'object') queue.push({value: child, depth: depth + 1});
  }
  if (records.length > 1) throw new ImportFailure('CONFLICTING_FACTS', 'Plusieurs annonces SAFTI embarquées.');
  return records[0];
}

export function extractSafti(nodes: HtmlNode[], documents: unknown[], url: string, canonicalUrl: string, id: string): ExtractedListing {
  const roots = documents.flatMap(v => values(obj(v)['@graph'] ?? v)).map(obj);
  const products = roots.filter(v => values(v['@type']).includes('Product'));
  if (products.length !== 1) throw new ImportFailure(products.length ? 'CONFLICTING_FACTS' : 'NOT_A_LISTING', 'Annonce SAFTI unique non identifiée.');
  const product = products[0], record = embeddedListing(nodes);
  if (String(product.sku) !== id || record && String(record.propertyReference) !== id)
    throw new ImportFailure('CONFLICTING_FACTS', 'La référence SAFTI désigne un autre bien.');
  const offers = values(product.offers).map(obj);
  for (const value of [product.url, ...offers.map(v => v.url)]) {
    if (typeof value !== 'string') throw new ImportFailure('INCOMPLETE_LISTING', 'Identité SAFTI incomplète.');
    const target = publicUrl(absolute(value, url)), source = new URL(url);
    if (!sameSourceHost(target.hostname, source.hostname) || target.pathname !== source.pathname)
      throw new ImportFailure('CONFLICTING_FACTS', 'Les données SAFTI désignent une autre annonce.');
  }
  if (record?.sold === true || record?.retraitDiffusion === true
    || offers.some(v => /(?:^|\/)(?:SoldOut|OutOfStock|Discontinued)$/.test(clean(v.availability))))
    throw new ImportFailure('SOURCE_UNAVAILABLE', 'Annonce SAFTI retirée ou vendue.');
  if (record && record.adType !== 'vente') throw new ImportFailure('CONFLICTING_FACTS', 'Vente SAFTI non confirmée.');
  const field = (name: string) => {
    const found = nodes.filter(n => attr(n, 'data-testid') === name);
    if (found.length > 1) throw new ImportFailure('CONFLICTING_FACTS', `Champ SAFTI ambigu : ${name}.`);
    return found[0];
  };
  const heading = field('heading-annonce'), title = text(heading);
  const match = title.match(/^(Maison|Appartement) à vendre à (.+?) de ([\d.,]+)\s*m[²2]$/i);
  if (!heading || tag(heading) !== 'h1' || !match || text(field('text-reference')) !== `Réf ${id}`)
    throw new ImportFailure('INCOMPLETE_LISTING', 'En-tête SAFTI non vérifiable.');
  const kind = match[1].toLowerCase(), area = numeric(text(field('value-surface-habitable')).match(/^([\d.,]+)\s*m[²2]$/)?.[1]);
  if (new URL(url).pathname.split('/')[3] !== kind || clean(record?.propertyType ?? kind).toLowerCase() !== kind
    || text(field('value-type-bien')).toLowerCase() !== kind)
    throw new ImportFailure('CONFLICTING_FACTS', 'Type de bien SAFTI contradictoire.');
  const locality = text(field('link-localisation')).replace(/\s*-\s*\d{5}$/, '').trim();
  const localityKey = (v: string) => v.toLocaleUpperCase('fr').normalize('NFC');
  unique([match[2], locality, ...(record ? [clean(record.city)] : [])].map(localityKey), 'Localisation SAFTI contradictoire.');
  unique([numeric(match[3]), area, ...(record ? [numeric(record.propertySurface)] : [])].filter(v => v !== null), 'Surface habitable SAFTI contradictoire.');
  const roomText = text(field('value-piece')), rooms = /^\d+$/.test(roomText) ? Number(roomText) : null;
  unique([rooms, ...(record ? [numeric(record.roomNumber)] : [])].filter(v => v !== null), 'Nombre de pièces SAFTI contradictoire.');
  const displayed = numeric(text(field('text-prix')).match(/^([\d\s.,]+)\s*€$/)?.[1]);
  const amounts = offers.map(v => numeric(v.price));
  unique([displayed, ...amounts, ...(record ? [numeric(record.price)] : [])].filter(v => v !== null), 'Prix SAFTI contradictoire.');
  const amount = displayed !== null && amounts.length && amounts.every(v => v === displayed) && offers.every(v => v.priceCurrency === 'EUR') ? displayed : null;
  const photoUrl = (value: string) => {
    const image = publicUrl(absolute(value, url), {stage: 'photo', resourceType: 'image'});
    const reference = image.pathname.match(/^\/bien-photo\/\d+\/\d+\/(\d+)\/[^/]+\/[^/]+\.(?:jpe?g|png|webp)$/i)?.[1];
    if (image.hostname !== 'cdn.safti.fr' || reference !== id)
      throw new ImportFailure('CONFLICTING_FACTS', 'Photo étrangère à la référence SAFTI.');
    return image.href;
  };
  const galleries = nodes.filter(n => attr(n, 'data-testid') === 'section-mosaic-photo');
  if (galleries.length !== 1) throw new ImportFailure('NOT_A_LISTING', 'Galerie SAFTI unique absente.');
  const visiblePhotos = descendants(galleries[0]).filter(n => tag(n) === 'img').map(n => photoUrl(attr(n, 'src')));
  const embeddedPhotos = record && Array.isArray(record.photos) ? record.photos.map(v => {
    const value = obj(v).urlPhotoLarge;
    if (typeof value !== 'string') throw new ImportFailure('INCOMPLETE_LISTING', 'Photo SAFTI incomplète.');
    return photoUrl(value);
  }) : [];
  const productPhotos = values(product.image).map(v => photoUrl(typeof v === 'string' ? v : clean(obj(v).url ?? obj(v).contentUrl)));
  if (embeddedPhotos.length && [...visiblePhotos, ...productPhotos].some(v => !embeddedPhotos.includes(v)))
    throw new ImportFailure('CONFLICTING_FACTS', 'Galerie SAFTI contradictoire.');
  const photoUrls = [...new Set(embeddedPhotos.length ? embeddedPhotos : [...visiblePhotos, ...productPhotos])].slice(0, IMPORT_LIMITS.candidates);
  const descriptionNode = field('corps-description');
  // La description possède aussi une copie dédiée à l'impression. Ne pas
  // concaténer cette copie au texte affiché à l'écran.
  const visibleDescription = descriptionNode && children(descriptionNode).find(n => hasClass(n, 'tw:print:hidden'));
  return {canonicalUrl, sourceListingId: id, adapterVersion: 'safti-next/1.0', transaction: 'sale',
    description: descriptionFromNodes([visibleDescription ?? descriptionNode].filter((n): n is HtmlNode => Boolean(n)), 'SAFTI.[data-testid=corps-description]')
      ?? descriptionFromString(product.description, 'SAFTI.JSON-LD.Product.description'),
    facts: {title: verified(title, 'text', 'SAFTI.h1'), locality: verified(locality, 'text', 'SAFTI.[data-testid=link-localisation]'),
      propertyType: verified(kind === 'maison' ? 'house' : 'apartment', 'category', 'SAFTI.[data-testid=value-type-bien]'),
      area: area !== null && area > 0 ? verified(area, 'm2', 'SAFTI.[data-testid=value-surface-habitable]') : missing('m2'),
      rooms: rooms !== null && rooms > 0 ? verified(rooms, 'rooms', 'SAFTI.[data-testid=value-piece]') : missing('rooms'),
      price: amount === null ? missing('EUR_cent') : verified({amountCents: Math.round(amount * 100), currency: 'EUR', period: 'total', charges: 'not_applicable'}, 'EUR_cent', 'SAFTI.text-prix + JSON-LD.offers')},
    photoUrls, warnings: amount === null ? ['Prix omis : montant non vérifiable.'] : []};
}
