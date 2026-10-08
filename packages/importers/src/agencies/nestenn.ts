import {ImportFailure} from '@bienvu/contracts';
import {absolute, attr, children, descendants, hasClass, rawText, tag, text, type HtmlNode} from '../html';
import {descriptionFromNodes, descriptionFromString} from '../description';
import {clean, missing, unique, verified} from '../facts';
import {IMPORT_LIMITS, publicUrl} from '../network';
import {euroAmount, listingIdentity, object, salePrice, schemaNodes, schemaTypes} from './data';
import type {ExtractedListing} from '../listing';

// Public Nestenn DOM observed on 08/10/2026. Its JSON-LD contains two objects
// separated by a comma without an enclosing array. Parse JSON only, no script.
function records(nodes: HtmlNode[]) {
  const documents = nodes.filter(n => tag(n) === 'script' && attr(n, 'type') === 'application/ld+json').flatMap(n => {
    const content = rawText(n);
    try {return [JSON.parse(content) as unknown];} catch {
      try {return [JSON.parse(`[${content}]`) as unknown];} catch {
        throw new ImportFailure('NOT_A_LISTING', 'Données Nestenn illisibles.', 'structure_changed');
      }
    }
  });
  return schemaNodes(documents);
}
// Nestenn serializes quantities with four decimals (65.0000, 3.0000).
// Keep this format local; do not change generic price parsing.
function quantity(value: unknown): number | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const raw = String(value).trim();
  if (!/^\d+(?:[.,]\d{1,4})?$/.test(raw)) return null;
  const number = Number(raw.replace(',', '.'));
  return Number.isFinite(number) && number > 0 ? number : null;
}

export function extractNestenn(nodes: HtmlNode[], url: string, canonicalUrl: string, id: string): ExtractedListing {
  const section = (name: string) => {
    const found = nodes.filter(n => attr(n, 'id') === name);
    if (found.length !== 1) throw new ImportFailure(found.length ? 'CONFLICTING_FACTS' : 'NOT_A_LISTING',
      `Section Nestenn non identifiée : ${name}.`, 'structure_changed');
    return found[0];
  };
  const descriptionRoot = section('description'), scoped = descendants(descriptionRoot);
  const homes = records(nodes).filter(n => schemaTypes(n).some(t => ['Apartment', 'House', 'SingleFamilyResidence'].includes(t)));
  if (homes.length !== 1) throw new ImportFailure(homes.length ? 'CONFLICTING_FACTS' : 'NOT_A_LISTING', 'Bien Nestenn unique non identifié.');
  const home = homes[0]; listingIdentity(home.url, url);
  const ids = nodes.filter(n => tag(n) === 'input' && attr(n, 'name') === 'productsId').map(n => attr(n, 'value'));
  if (!ids.length || unique(ids, 'Références Nestenn contradictoires.') !== id)
    throw new ImportFailure('CONFLICTING_FACTS', 'La référence Nestenn désigne un autre bien.');
  const heads = scoped.filter(n => tag(n) === 'h1');
  if (heads.length !== 1) throw new ImportFailure('CONFLICTING_FACTS', 'En-tête Nestenn ambigu.');
  const title = text(heads[0]);
  unique([title, clean(home.name)], 'Titres Nestenn contradictoires.');
  const direct = children(descriptionRoot).filter(n => tag(n));
  const transactionLabel = unique(direct.filter(n => hasClass(n, 'titre2') && tag(n) !== 'h1').map(text), 'Transaction Nestenn ambiguë.');
  const kind = transactionLabel?.match(/^(Appartement|Maison) à vendre$/i)?.[1].toLowerCase();
  if (!kind) throw new ImportFailure('INCOMPLETE_LISTING', 'Vente Nestenn non confirmée.');
  const property = kind === 'appartement' ? 'apartment' as const : 'house' as const;
  const structuredProperty = unique(schemaTypes(home).filter(t => ['Apartment', 'House', 'SingleFamilyResidence'].includes(t))
    .map(t => t === 'Apartment' ? 'apartment' : 'house'), 'Types Nestenn contradictoires.');
  unique([property, structuredProperty], 'Type Nestenn contradictoire.');
  const titleKind = title.match(/^(Appartement|Maison)\b/i)?.[1].toLowerCase();
  if (!titleKind || titleKind !== kind) throw new ImportFailure('CONFLICTING_FACTS', 'Type du titre Nestenn contradictoire.');
  const displayedAddress = unique(direct.filter(n => hasClass(n, 'titre3')).map(text), 'Localisation Nestenn ambiguë.')?.match(/^(\d{5})\s+(.+)$/);
  const address = object(home.address), locality = displayedAddress?.[2];
  if (!locality || !clean(address.addressLocality)) throw new ImportFailure('INCOMPLETE_LISTING', 'Localisation Nestenn absente.');
  const localityKey = (value: string) => value.normalize('NFC').toLocaleUpperCase('fr');
  unique([localityKey(locality), localityKey(clean(address.addressLocality))], 'Localisation Nestenn contradictoire.');
  if (clean(address.postalCode)) unique([displayedAddress![1], clean(address.postalCode)], 'Code postal Nestenn contradictoire.');
  const criteria = descendants(section('caracteristiques')).filter(n => hasClass(n, 'critere')).map(text);
  const roomValues = [...criteria, ...scoped.filter(n => ['div', 'span', 'p'].includes(tag(n))).map(text)]
    .map(value => value.match(/^(\d+)\s+pièces?$/i)?.[1]);
  const areaValues = [...criteria, ...scoped.filter(n => ['div', 'span', 'p'].includes(tag(n))).map(text)]
    .map(value => value.match(/^([\d.,]+)\s*m[²2]\s+habitables$/i)?.[1]);
  const positive = (values: unknown[]) => values.map(quantity).filter((v): v is number => v !== null);
  const size = object(home.floorSize);
  const rooms = unique(positive([...roomValues, title.match(/(\d+)\s+pièces?/i)?.[1], home.numberOfRooms]), 'Pièces Nestenn contradictoires.');
  const area = unique(positive([...areaValues, title.match(/([\d.,]+)\s*m[²2]/i)?.[1],
    ...(['MTK', 'm2', 'm²'].includes(clean(size.unitCode ?? size.unitText)) ? [size.value] : [])]), 'Surface Nestenn contradictoire.');
  const displayedPrices = scoped.filter(n => hasClass(n, 'titre1')).map(text);
  const amounts = displayedPrices.map(value => /^\d[\d\s.,]*\s*€$/.test(value) ? euroAmount(value) : null)
    .filter((v): v is number => v !== null);
  const offers = home.offers == null ? [] : Array.isArray(home.offers) ? home.offers : [home.offers];
  for (const value of offers) {
    const offer = object(value);
    if (offer.url) listingIdentity(offer.url, url);
    if (offer.priceCurrency && offer.priceCurrency !== 'EUR' || offer.businessFunction && !/(?:^|[#/])Sell$/.test(clean(offer.businessFunction)))
      throw new ImportFailure('CONFLICTING_FACTS', 'Prix ou transaction structurée Nestenn contradictoire.');
    const amount = offer.priceCurrency === 'EUR' ? euroAmount(offer.price) : null;
    if (amount !== null) amounts.push(amount);
  }
  const photoUrls = [...new Set(descendants(section('links')).filter(n => tag(n) === 'a' && attr(n, 'href')).map(n => {
    const image = publicUrl(absolute(attr(n, 'href'), url), {stage: 'photo', resourceType: 'image'});
    const file = image.pathname.match(/\/catalog\/images\/pr_[pb]\/((?:\d\/)+)(\d+)[a-z]\.jpe?g$/i);
    if (image.hostname !== 'media-nestenn.immo-facile.com' || !file || file[2] !== id || file[1].replaceAll('/', '') !== id)
      throw new ImportFailure('CONFLICTING_FACTS', 'Photo étrangère à la référence Nestenn.');
    return image.href;
  }))].slice(0, IMPORT_LIMITS.candidates);
  const price = salePrice(amounts, 'Nestenn.#description .titre1 + JSON-LD.offers');
  return {canonicalUrl, sourceListingId: id, adapterVersion: 'nestenn-dom/1.0', transaction: 'sale',
    description: descriptionFromNodes(scoped.filter(n => tag(n) === 'p' && hasClass(n, 'description')), 'Nestenn.#description p.description')
      ?? descriptionFromString(home.description, 'Nestenn.JSON-LD.property.description'),
    facts: {title: verified(title, 'text', 'Nestenn.#description h1'), propertyType: verified(property, 'category', 'Nestenn.#description .titre2 + JSON-LD.@type'),
      locality: verified(locality, 'text', 'Nestenn.#description .titre3 + JSON-LD.address'), price,
      area: area ? verified(area, 'm2', 'Nestenn.#caracteristiques .critere + JSON-LD.floorSize') : missing('m2'),
      rooms: rooms && Number.isInteger(rooms) ? verified(rooms, 'rooms', 'Nestenn.#caracteristiques .critere + JSON-LD.numberOfRooms') : missing('rooms')},
    photoUrls, warnings: price.status === 'missing' ? ['Prix omis : montant de vente non vérifiable.'] : []};
}
