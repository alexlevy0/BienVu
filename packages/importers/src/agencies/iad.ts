import {ImportFailure} from '@bienvu/contracts';
import {absolute, attr, tag, text, type HtmlNode} from '../html';
import {descriptionFromString} from '../description';
import {missing, numeric, unique, verified} from '../facts';
import {IMPORT_LIMITS, publicUrl} from '../network';
import {array, compareNumber, embeddedJson, euroAmount, listingIdentity, object, salePrice, schemaNodes, schemaTypes} from './data';
import type {ExtractedListing} from '../listing';

// Nuxt sérialise des indices dans un tableau JSON. On lit seulement les
// champs de la fiche identifiée, sans réhydrater ni exécuter son application.
export function extractIad(nodes: HtmlNode[], documents: unknown[], url: string, canonicalUrl: string, id: string): ExtractedListing {
  const data = embeddedJson(nodes, '__NUXT_DATA__');
  if (!Array.isArray(data) || data.length > 8000) throw new ImportFailure('NOT_A_LISTING', 'Table de fiche iad illisible.');
  const read = (index: unknown): unknown => {
    if (typeof index !== 'number' || !Number.isInteger(index) || index < 0 || index >= data.length)
      throw new ImportFailure('CONFLICTING_FACTS', 'Référence de données iad invalide.');
    return data[index];
  };
  const records = data.map(object).filter(v => 'propertyListingRef' in v && 'media' in v && 'mainSurface' in v && 'roomsCount' in v);
  if (records.length !== 1 || String(read(records[0].propertyListingRef)) !== id)
    throw new ImportFailure('CONFLICTING_FACTS', 'La fiche iad désigne un autre bien.');
  const record = records[0], transaction = read(record.transactionType), kind = read(record.propertyType);
  const property = kind === 'apartment' ? 'apartment' : kind === 'house' ? 'house' : null;
  if (transaction !== 'sale' || !property) throw new ImportFailure('CONFLICTING_FACTS', 'Transaction ou type iad incohérent.');
  const references = nodes.filter(n => tag(n) === 'p' && /^Réf\s*:/i.test(text(n))).map(n => text(n).replace(/^Réf\s*:\s*/i, ''));
  if (unique(references, 'Références affichées iad contradictoires.') !== id) throw new ImportFailure('CONFLICTING_FACTS', 'Référence iad affichée incohérente.');
  const title = unique(nodes.filter(n => tag(n) === 'h1').map(text).filter(Boolean), 'Titres iad contradictoires.') ?? '';
  const heading = title.match(/^(Appartement|Maison) à vendre (\d+) pièces? ([\d.,]+) m[²2] (.+)$/i);
  const area = numeric(read(record.mainSurface)), rooms = numeric(read(record.roomsCount));
  const location = object(read(record.location)), locality = read(location.place);
  if (!heading || typeof locality !== 'string' || !locality) throw new ImportFailure('INCOMPLETE_LISTING', 'Présentation iad absente.');
  unique([property, heading[1].toLowerCase() === 'maison' ? 'house' : 'apartment'], 'Type iad affiché contradictoire.');
  compareNumber(area, heading[3], 'Surface iad affichée contradictoire.'); compareNumber(rooms, heading[2], 'Pièces iad affichées contradictoires.');
  const amount = euroAmount(read(object(read(record.prices)).formattedMain)), schema = schemaNodes(documents);
  const homes = schema.filter(n => schemaTypes(n).some(t => ['Apartment', 'House'].includes(t)));
  if (homes.length !== 1) throw new ImportFailure('CONFLICTING_FACTS', 'Bien structuré iad ambigu.');
  const home = homes[0]; listingIdentity(home['@id'] ?? home.url, url);
  unique([property, schemaTypes(home).includes('House') ? 'house' : 'apartment'], 'Type iad structuré contradictoire.');
  compareNumber(area, object(home.floorSize).value, 'Surface iad structurée contradictoire.');
  compareNumber(rooms, home.numberOfRooms, 'Pièces iad structurées contradictoires.');
  const schemaCity = object(home.address).addressLocality;
  if (typeof schemaCity === 'string') unique([locality.toLowerCase(), schemaCity.toLowerCase()], 'Ville iad contradictoire.');
  const amounts = amount === null ? [] : [amount];
  for (const offer of schema.filter(n => schemaTypes(n).includes('Offer'))) {
    listingIdentity(offer.url ?? offer['@id'], url);
    if (object(offer.itemOffered)['@id']) listingIdentity(object(offer.itemOffered)['@id'], url);
    if (offer.priceCurrency !== 'EUR') throw new ImportFailure('CONFLICTING_FACTS', 'Devise iad contradictoire.');
    const value = euroAmount(offer.price); if (value !== null) amounts.push(value);
  }
  const photoUrls = array(read(object(read(record.media)).photos)).map(index => {
    const value = read(index);
    if (typeof value !== 'string') throw new ImportFailure('CONFLICTING_FACTS', 'Photo iad illisible.');
    const photo = publicUrl(absolute(value, url), {stage: 'photo', resourceType: 'image'});
    if (!['images.playiad.com', 'images.iadfrance.fr'].includes(photo.hostname) || !/^\/property\/broadcast\/\d{4}\/\d{2}\/\d{2}\/[^/]+\.(?:jpe?g|png|webp)$/i.test(photo.pathname))
      throw new ImportFailure('CONFLICTING_FACTS', 'Photo étrangère à la galerie iad.');
    return photo.href;
  });
  // Les couvertures affichées doivent appartenir à la galerie de cette fiche.
  for (const node of nodes.filter(n => tag(n) === 'img' && attr(n, 'data-dd-action-name') === 'property_media_image')) {
    const cover = publicUrl(absolute(attr(node, 'src'), url), {stage: 'photo', resourceType: 'image'});
    if (!['images.playiad.com', 'images.iadfrance.fr'].includes(cover.hostname) || !photoUrls.some(v => new URL(v).pathname === cover.pathname))
      throw new ImportFailure('CONFLICTING_FACTS', 'Couverture iad étrangère à la fiche.');
  }
  return {canonicalUrl, sourceListingId: id, adapterVersion: 'iad-nuxt/1.0', transaction: 'sale',
    description: descriptionFromString(read(record.description), 'iad.property.description'),
    facts: {title: verified(title, 'text', 'iad.h1'), locality: verified(locality, 'text', 'iad.property.location.place'),
      propertyType: verified(property, 'category', 'iad.property.propertyType'), price: salePrice(amounts, 'iad.property.prices.formattedMain'),
      area: area ? verified(area, 'm2', 'iad.property.mainSurface') : missing('m2'),
      rooms: rooms && Number.isInteger(rooms) ? verified(rooms, 'rooms', 'iad.property.roomsCount') : missing('rooms')},
    photoUrls: [...new Set(photoUrls)].slice(0, IMPORT_LIMITS.candidates), warnings: []};
}
