import {ImportFailure, sameSourceHost} from '@bienvu/contracts';
import {absolute, attr, descendants, hasClass, tag, text, type HtmlNode} from '../html';
import {descriptionFromNodes} from '../description';
import {missing, numeric, unique, verified} from '../facts';
import {IMPORT_LIMITS, publicUrl} from '../network';
import {array, compareNumber, euroAmount, listingIdentity, object, salePrice, schemaNodes, schemaTypes} from './data';
import type {ExtractedListing} from '../listing';

// Estatik : en-tête et champs du bien courant, jamais les cartes voisines.
export function extractCesarBrutus(nodes: HtmlNode[], documents: unknown[], url: string, canonicalUrl: string, id: string): ExtractedListing {
  const roots = nodes.filter(n => hasClass(n, 'js-es-single'));
  if (roots.length !== 1) throw new ImportFailure('NOT_A_LISTING', 'Fiche César & Brutus non identifiée.', 'structure_changed');
  const scoped = descendants(roots[0]), headers = scoped.filter(n => hasClass(n, 'es-single__header'));
  if (headers.length !== 1) throw new ImportFailure('CONFLICTING_FACTS', 'En-tête de fiche ambigu.');
  const header = descendants(headers[0]);
  const reference = unique(header.filter(n => hasClass(n, 'reference-annonce')).map(text), 'Références contradictoires.');
  if (reference?.replace(/^Référence\s*:\s*/i, '').toLowerCase() !== id.toLowerCase())
    throw new ImportFailure('CONFLICTING_FACTS', 'La référence César & Brutus désigne un autre bien.');
  const fieldNodes = (name: string) => scoped.filter(n => hasClass(n, `es-property-field--${name}`)).flatMap(descendants)
    .filter(n => hasClass(n, 'es-property-field__value'));
  const field = (name: string) => unique(fieldNodes(name).map(text), `Champ César & Brutus contradictoire : ${name}.`) ?? '';
  if (field('rubrique').toLowerCase() !== 'vente') throw new ImportFailure('CONFLICTING_FACTS', 'Transaction César & Brutus incohérente.');
  const state = field('es_status');
  if (state && !/^sur le march[eé]$/i.test(state)) throw new ImportFailure('SOURCE_UNAVAILABLE', 'Ce bien n’est plus sur le marché.');
  const property = field('es_type').toLowerCase() === 'maison' ? 'house' : field('es_type').toLowerCase() === 'appartement' ? 'apartment' : null;
  const title = unique(header.filter(n => tag(n) === 'h1' && hasClass(n, 'property-title')).map(text), 'Titres contradictoires.') ?? '';
  const locality = field('city'), area = numeric(field('area').replace(/\s*m[²2]$/, '')), rooms = numeric(field('pieces'));
  if (!title || !property || !locality) throw new ImportFailure('INCOMPLETE_LISTING', 'Faits essentiels César & Brutus absents.');
  compareNumber(area, title.match(/([\d.,]+)\s*m[²2]/)?.[1], 'Surface affichée contradictoire.');
  compareNumber(rooms, title.match(/(\d+)\s+pièces?/i)?.[1], 'Nombre de pièces affiché contradictoire.');
  const homes = schemaNodes(documents).filter(n => schemaTypes(n).some(t => ['House', 'Apartment'].includes(t)));
  if (homes.length !== 1) throw new ImportFailure('CONFLICTING_FACTS', 'Bien structuré César & Brutus ambigu.');
  const home = homes[0]; listingIdentity(home.url, url);
  unique([property, schemaTypes(home).includes('House') ? 'house' : 'apartment'], 'Type de bien contradictoire.');
  const address = typeof home.address === 'string' ? home.address.replace(/^\d{5}\s+/, '') : String(object(home.address).addressLocality ?? '');
  if (address) unique([locality.toLowerCase(), address.toLowerCase()], 'Ville César & Brutus contradictoire.');
  compareNumber(area, object(home.floorSize).value, 'Surface structurée contradictoire.');
  compareNumber(rooms, home.numberOfRooms, 'Nombre de pièces structuré contradictoire.');
  const amounts = header.filter(n => hasClass(n, 'es-price')).map(n => euroAmount(text(n), true)).filter((v): v is number => v !== null);
  for (const offer of array(home.offers).length ? array(home.offers) : home.offers ? [home.offers] : []) {
    const o = object(offer), amount = euroAmount(o.price);
    if (o.priceCurrency !== 'EUR') throw new ImportFailure('CONFLICTING_FACTS', 'Devise de vente contradictoire.');
    if (amount !== null) amounts.push(amount);
  }
  const photoUrls = array(home.image).map(v => {
    if (typeof v !== 'string') throw new ImportFailure('CONFLICTING_FACTS', 'Galerie César & Brutus illisible.');
    const photo = publicUrl(absolute(v, url), {stage: 'photo', resourceType: 'image'});
    if (!sameSourceHost(photo.hostname, new URL(url).hostname) || !/^\/wp-content\/uploads\/\d{4}\/\d{2}\/[^/]+\.(?:jpe?g|png|webp)$/i.test(photo.pathname))
      throw new ImportFailure('CONFLICTING_FACTS', 'Photo étrangère à la galerie César & Brutus.');
    return photo.href;
  });
  return {canonicalUrl, sourceListingId: id, adapterVersion: 'cesar-brutus-estatik/1.0', transaction: 'sale',
    description: descriptionFromNodes(fieldNodes('post_content'), 'CesarBrutus.es-property-field--post_content'),
    facts: {title: verified(title, 'text', 'CesarBrutus.header.h1'), propertyType: verified(property, 'category', 'CesarBrutus.es_type'),
      locality: verified(locality, 'text', 'CesarBrutus.city'), price: salePrice(amounts, 'CesarBrutus.header.es-price'),
      area: area ? verified(area, 'm2', 'CesarBrutus.area') : missing('m2'),
      rooms: rooms && Number.isInteger(rooms) ? verified(rooms, 'rooms', 'CesarBrutus.pieces') : missing('rooms')},
    photoUrls: [...new Set(photoUrls)].slice(0, IMPORT_LIMITS.candidates), warnings: []};
}
