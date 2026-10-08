import {ImportFailure} from '@bienvu/contracts';
import {absolute, attr, descendants, hasClass, tag, text, type HtmlNode} from '../html';
import {descriptionFromNodes, descriptionFromString} from '../description';
import {clean, missing, numeric, unique, verified} from '../facts';
import {IMPORT_LIMITS, publicUrl} from '../network';
import {array, euroAmount, listingIdentity, object, salePrice, schemaNodes, schemaTypes} from './data';
import type {ExtractedListing} from '../listing';

// HUMAN displays a rounded surface (56,6 m²) while publishing 56,63 in the
// same dwelling's floorSize. Compare at the displayed precision only; never
// round a room count, a price, or another agency's facts.
function areaValue(structured: number | null, displayed: string[]) {
  const values = displayed.map(value => ({raw: value, number: numeric(value)}));
  if (structured !== null) {
    for (const value of values) {
      if (value.number === null) continue;
      const precision = value.raw.replaceAll(' ', '').split(/[.,]/)[1]?.length ?? 0;
      if (Number(structured.toFixed(precision)) !== value.number)
        throw new ImportFailure('CONFLICTING_FACTS', 'Surface habitable HUMAN contradictoire.');
    }
    return structured;
  }
  return unique(values.flatMap(value => value.number === null ? [] : [value.number]), 'Surfaces HUMAN contradictoires.');
}

export function extractHuman(nodes: HtmlNode[], documents: unknown[], url: string, canonicalUrl: string, id: string): ExtractedListing {
  const roots = nodes.filter(node => attr(node, 'id') === 'detail_bien');
  if (roots.length !== 1) throw new ImportFailure(roots.length ? 'CONFLICTING_FACTS' : 'NOT_A_LISTING', 'Fiche HUMAN unique absente.', 'structure_changed');
  const root = roots[0], scoped = descendants(root);
  if (!hasClass(root, 'detail-annonce-vente')) throw new ImportFailure('CONFLICTING_FACTS', 'Transaction HUMAN différente de la route de vente.');
  const section = (name: string) => {
    const found = scoped.filter(node => attr(node, 'id') === name);
    if (found.length !== 1) throw new ImportFailure(found.length ? 'CONFLICTING_FACTS' : 'NOT_A_LISTING', `Section HUMAN non identifiée : ${name}.`, 'structure_changed');
    return found[0];
  };
  const records = schemaNodes(documents), listings = records.filter(value => schemaTypes(value).includes('RealEstateListing'));
  if (listings.length !== 1) throw new ImportFailure(listings.length ? 'CONFLICTING_FACTS' : 'NOT_A_LISTING', 'Bien structuré HUMAN unique absent.', 'structure_changed');
  const listing = listings[0]; listingIdentity(listing['@id'], url);
  if (listing.url) listingIdentity(listing.url, url);
  const displayedReferences = scoped.filter(node => hasClass(node, 'detail_bien__description-header')).map(text)
    .map(value => value.match(/^Réf\s*:\s*(\d+-\d+)$/i)?.[1]).filter((value): value is string => Boolean(value));
  const structuredReference = clean(listing.alternateName).match(/^Réf\.\s*(\d+-\d+)$/i)?.[1];
  if (!displayedReferences.length || !structuredReference || unique([...displayedReferences, structuredReference, id], 'Références HUMAN contradictoires.') !== id)
    throw new ImportFailure('CONFLICTING_FACTS', 'Référence HUMAN absente ou différente du lien.');
  const offers = listing.offers == null ? [] : Array.isArray(listing.offers) ? listing.offers.map(object) : [object(listing.offers)];
  if (offers.length !== 1) throw new ImportFailure('CONFLICTING_FACTS', 'Offre HUMAN unique non identifiée.');
  const offer = offers[0], home = object(offer.itemOffered);
  if (offer['@id']) listingIdentity(offer['@id'], url);
  if (offer.url) listingIdentity(offer.url, url);
  if (home['@id']) listingIdentity(home['@id'], url);
  if (home.url) listingIdentity(home.url, url);
  if (offer.priceCurrency && offer.priceCurrency !== 'EUR' || offer.businessFunction && !/(?:^|[#/])Sell$/.test(clean(offer.businessFunction)))
    throw new ImportFailure('CONFLICTING_FACTS', 'Devise ou transaction structurée HUMAN contradictoire.');
  if (/\/(?:SoldOut|Discontinued|OutOfStock)$/.test(clean(offer.availability)))
    throw new ImportFailure('SOURCE_UNAVAILABLE', 'Annonce HUMAN non disponible.', 'not_found');
  const headings = scoped.filter(node => tag(node) === 'h1' && hasClass(node, 'detail_bien__prix--h1'));
  if (headings.length !== 1) throw new ImportFailure('CONFLICTING_FACTS', 'En-tête HUMAN ambigu.');
  const header = descendants(headings[0]);
  const value = (name: string) => unique(header.filter(node => hasClass(node, name)).map(text), `Champ HUMAN ambigu : ${name}.`);
  const kind = value('title')?.match(/^(Appartement|Maison) à vendre$/i)?.[1].toLowerCase();
  const routeKind = new URL(url).pathname.match(/^\/annonce-achat-(appartement|maison)-/)?.[1];
  if (!kind || kind !== routeKind) throw new ImportFailure('CONFLICTING_FACTS', 'Type ou transaction HUMAN contradictoire.');
  const property = kind === 'appartement' ? 'apartment' as const : 'house' as const;
  const structuredKind = unique(schemaTypes(home).filter(type => ['Apartment', 'House', 'SingleFamilyResidence'].includes(type))
    .map(type => type === 'Apartment' ? 'apartment' : 'house'), 'Types structurés HUMAN contradictoires.');
  if (!structuredKind) throw new ImportFailure('INCOMPLETE_LISTING', 'Type du bien HUMAN absent.');
  unique([property, structuredKind], 'Type du bien HUMAN contradictoire.');
  const locality = value('ville'), address = object(home.address), localityKey = (value: string) => value.normalize('NFC').toLocaleLowerCase('fr');
  if (!locality || !clean(address.addressLocality)) throw new ImportFailure('INCOMPLETE_LISTING', 'Localisation HUMAN absente.');
  unique([localityKey(locality), localityKey(clean(address.addressLocality))], 'Localisation HUMAN contradictoire.');
  const criteria = descendants(section('caracteristique-bien')).filter(node => tag(node) === 'li').map(text);
  const headerFacts = value('etat-bien')?.match(/^(\d+)\s*p\s+([\d.,]+)\s*m[²2](?:\s|$)/i);
  const roomValues = [home.numberOfRooms, headerFacts?.[1], ...criteria.map(value => value.match(/^Pièce\(s\)\s*:\s*(\d+)$/i)?.[1])]
    .map(numeric).filter((value): value is number => value !== null);
  const rooms = unique(roomValues, 'Pièces HUMAN contradictoires.');
  const displayedAreas = [headerFacts?.[2], ...criteria.map(value => value.match(/^Surface habitable\s*:\s*([\d.,]+)\s*m[²2]$/i)?.[1])]
    .filter((value): value is string => Boolean(value));
  const size = object(home.floorSize);
  const area = areaValue(['MTK', 'm2', 'm²'].includes(clean(size.unitCode ?? size.unitText)) ? numeric(size.value) : null, displayedAreas);
  const prices = header.filter(node => hasClass(node, 'prix')).map(text)
    .filter(value => /^\d[\d\s.,]*\s*€$/.test(value)).map(value => euroAmount(value)).filter((value): value is number => value !== null);
  // The net seller amount, fee percentage, credit simulation and town income
  // remain separate. Only the explicitly labelled inclusive price is compared.
  const detailedPrices = scoped.filter(node => attr(node, 'id') === 'detailprix').flatMap(node => descendants(node))
    .filter(node => tag(node) === 'span').map(text)
    .map(value => value.match(/^Prix honoraires inclus\s*:\s*([\d\s.,]+)\s*€\s*-?$/i)?.[1])
    .map(value => euroAmount(value)).filter((value): value is number => value !== null);
  const structuredPrice = offer.priceCurrency === 'EUR' ? euroAmount(offer.price) : null;
  const price = salePrice([...prices, ...detailedPrices, ...(structuredPrice === null ? [] : [structuredPrice])], 'HUMAN.h1 .prix + #detailprix prix inclus + JSON-LD.offers.price');
  const imageUrl = (value: string) => {
    const image = publicUrl(absolute(value, url), {stage: 'photo', resourceType: 'image'});
    const match = image.pathname.match(/^\/vente\/(\d+-\d+)_\d+\.jpe?g$/i);
    if (image.hostname !== 'humanimmobilier-images.s3.fr-par.scw.cloud' || !match || match[1] !== id)
      throw new ImportFailure('CONFLICTING_FACTS', 'Photo étrangère à la référence HUMAN.');
    return image;
  };
  const gallery = descendants(section('gallery')).filter(node => attr(node, 'id') === 'slider');
  if (gallery.length !== 1) throw new ImportFailure('INSUFFICIENT_PHOTOS', 'Galerie HUMAN unique non identifiée.');
  const photoUrls = [...new Set(descendants(gallery[0]).filter(node => tag(node) === 'img' && hasClass(node, 'img-fluid'))
    .map(node => imageUrl(attr(node, 'src')).href))];
  for (const candidate of array(listing.image)) {
    if (typeof candidate !== 'string') throw new ImportFailure('CONFLICTING_FACTS', 'Image structurée HUMAN invalide.');
    const image = imageUrl(candidate);
    if (!photoUrls.some(value => new URL(value).origin + new URL(value).pathname === image.origin + image.pathname))
      throw new ImportFailure('CONFLICTING_FACTS', 'Galerie structurée et galerie HUMAN différentes.');
  }
  return {canonicalUrl, sourceListingId: id, adapterVersion: 'human-dom/1.0', transaction: 'sale',
    description: descriptionFromNodes(scoped.filter(node => attr(node, 'id') === 'visitez'), 'HUMAN.#visitez')
      ?? descriptionFromString(listing.description, 'HUMAN.JSON-LD.RealEstateListing.description'),
    facts: {title: verified(`${kind === 'appartement' ? 'Appartement' : 'Maison'} à vendre à ${locality}`, 'text', 'HUMAN.h1 .title + .ville'),
      propertyType: verified(property, 'category', 'HUMAN.h1 .title + JSON-LD.offers.itemOffered.@type'),
      locality: verified(locality, 'text', 'HUMAN.h1 .ville + JSON-LD.offers.itemOffered.address'), price,
      area: area ? verified(area, 'm2', 'HUMAN.Surface habitable + JSON-LD.offers.itemOffered.floorSize') : missing('m2'),
      rooms: rooms && Number.isInteger(rooms) ? verified(rooms, 'rooms', 'HUMAN.Pièce(s) + JSON-LD.offers.itemOffered.numberOfRooms') : missing('rooms')},
    photoUrls: photoUrls.slice(0, IMPORT_LIMITS.candidates), warnings: price.status === 'missing' ? ['Prix omis : montant de vente non vérifiable.'] : []};
}
