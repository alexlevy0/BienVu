import { ImportFailure } from '@bienvu/contracts';
import type { ExtractedListing } from '../listing';
import { attr, rawText, tag, text, type HtmlNode } from '../html';
import { descriptionFromString } from '../description';
import { clean, missing, numeric, unique, verified } from '../facts';
import { IMPORT_LIMITS, scopedUrl, sourcePolicy } from '../network';
import { assertListingDestination } from '../registry';
import { array, object, schemaNodes, schemaTypes } from '../agencies/data';

// Only the public page's listing data is read. No calendar/pricing API, cookies,
// scripts, host portraits or similar-listings galleries are fetched.
function listingIdentifier(value: unknown, id: string) {
  if (typeof value !== 'string') throw new ImportFailure('INCOMPLETE_LISTING', 'Référence Airbnb absente.');
  let decoded = value;
  try {
    if (!/^\d+$/.test(value)) decoded = atob(value);
  } catch {
    /* Refuse below. */
  }
  if (decoded !== id && !new RegExp(`^(?:DemandStayListing|StayListing|Listing):${id}$`).test(decoded))
    throw new ImportFailure('CONFLICTING_FACTS', 'La référence Airbnb désigne un autre logement.');
}
function listingLink(value: unknown, url: string) {
  if (typeof value !== 'string') return;
  try {
    assertListingDestination(url, new URL(value, url).href);
  } catch {
    throw new ImportFailure('CONFLICTING_FACTS', 'Les données Airbnb désignent un autre logement.');
  }
}
function propertyType(value: unknown): 'apartment' | 'house' | 'other' | null {
  const label = clean(value).toLowerCase();
  if (/^(?:apartment|appartement|condominium|loft|rental_unit|serviced_apartment)$/.test(label)) return 'apartment';
  if (/^(?:house|maison|villa|cottage|bungalow|townhouse|singlefamilyresidence)$/.test(label)) return 'house';
  return null;
}
function photo(value: unknown, url: string, id: string) {
  if (typeof value !== 'string') throw new ImportFailure('UNSAFE_URL', 'Photo Airbnb invalide.');
  const image = scopedUrl(value, sourcePolicy(url).imageHosts, { stage: 'photo', resourceType: 'image' });
  if (
    image.hostname !== 'a0.muscache.com' ||
    !/^\/im\/pictures\/[a-zA-Z0-9_./-]+\.(?:jpe?g|png|webp)$/i.test(image.pathname) ||
    /\/(?:users?|profiles?|avatars?)(?:\/|[_.-])/i.test(image.pathname)
  )
    throw new ImportFailure('UNSAFE_URL', 'Photo extérieure à la galerie Airbnb.');
  const reference = /\/Hosting-(\d+)\//.exec(image.pathname)?.[1];
  if (reference && reference !== id)
    throw new ImportFailure('CONFLICTING_FACTS', 'Photo liée à un autre logement Airbnb.');
  // Ask the existing image CDN for a bounded raster; do not download massive
  // originals or depend on automatic AVIF/WebP negotiation.
  image.search = '?im_w=1440';
  return image.href;
}
export function extractAirbnb(
  nodes: HtmlNode[],
  documents: unknown[],
  url: string,
  canonicalUrl: string,
  id: string,
): ExtractedListing {
  const rentals = schemaNodes(documents).filter((n) => schemaTypes(n).includes('VacationRental'));
  if (rentals.length !== 1)
    throw new ImportFailure(
      rentals.length ? 'CONFLICTING_FACTS' : 'NOT_A_LISTING',
      'Logement Airbnb unique non identifié.',
      'structure_changed',
    );
  const rental = rentals[0];
  listingIdentifier(rental.identifier, id);
  listingLink(rental.url, url);
  for (const meta of nodes.filter((n) => tag(n) === 'meta' && attr(n, 'property') === 'og:url'))
    listingLink(attr(meta, 'content'), url);
  const title = unique(
    [clean(rental.name), ...nodes.filter((n) => tag(n) === 'h1').map(text)].filter(Boolean),
    'Titres Airbnb contradictoires.',
  );
  const locality = clean(object(rental.address).addressLocality);
  const accommodation = object(rental.containsPlace);
  const kinds = schemaTypes(accommodation)
    .map(propertyType)
    .filter((v) => v !== null);
  const tourPhotos: unknown[] = [];
  const states = nodes.filter(
    (n) =>
      tag(n) === 'script' && attr(n, 'type') === 'application/json' && /^data-deferred-state-\d+$/.test(attr(n, 'id')),
  );
  if (states.length > 8) throw new ImportFailure('NOT_A_LISTING', 'Trop de blocs de données Airbnb.');
  for (const state of states) {
    const content = rawText(state);
    if (content.length > 512_000) throw new ImportFailure('NOT_A_LISTING', 'Données Airbnb trop volumineuses.');
    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch {
      continue;
    }
    for (const entry of array(object(parsed).niobeClientData)) {
      const data = object(object(array(entry)[1]).data);
      const sections = object(object(object(data.presentation).stayProductDetailPage).sections);
      if (!Object.keys(sections).length) continue;
      const metadata = object(sections.metadata),
        identity = object(object(metadata.loggingContext).eventDataLogging).listingId;
      if (typeof identity !== 'string' || identity !== id)
        throw new ImportFailure('CONFLICTING_FACTS', 'Galerie Airbnb liée à un autre logement.');
      const sharing = object(metadata.sharingConfig);
      listingLink(sharing.shareUrl, url);
      const listing = object(data.node);
      if (listing.id !== undefined) {
        listingIdentifier(listing.id, id);
        const kind = propertyType(listing.propertyType);
        if (kind) kinds.push(kind);
      }
      // This field describes the accommodation, unlike bedroom/guest counts.
      const kind = propertyType(clean(sharing.propertyType).split(/[:：]/).at(-1));
      if (kind) kinds.push(kind);
      const tours = array(sections.sections)
        .map(object)
        .filter((s) => s.sectionId === 'PHOTO_TOUR_SCROLLABLE_MODAL');
      if (tours.length > 1) throw new ImportFailure('CONFLICTING_FACTS', 'Plusieurs galeries Airbnb.');
      const media = array(object(tours[0]?.section).mediaItems);
      if (media.length > 500) throw new ImportFailure('NOT_A_LISTING', 'Galerie Airbnb trop volumineuse.');
      tourPhotos.push(
        ...media
          .map(object)
          .filter((m) => m.__typename === 'Image')
          .map((m) => m.baseUrl),
      );
    }
  }
  // The OG title's first segment explicitly names the type (not the listing's
  // marketing title). It is also available when hydration data is absent.
  for (const meta of nodes.filter((n) => tag(n) === 'meta' && attr(n, 'property') === 'og:title')) {
    const kind = propertyType(attr(meta, 'content').split('·')[0]);
    if (kind) kinds.push(kind);
  }
  const kind = unique(kinds, 'Types de logement Airbnb contradictoires.') ?? 'other';
  const schemaPhotos = array(rental.image).map((value) =>
    typeof value === 'string' ? value : (object(value).url ?? object(value).contentUrl),
  );
  const photoUrls = [...new Set([...tourPhotos, ...schemaPhotos].map((value) => photo(value, url, id)))].slice(
    0,
    IMPORT_LIMITS.candidates,
  );
  const sizes = [object(accommodation.floorSize), object(rental.floorSize)].filter((s) =>
    ['MTK', 'm²', 'm2'].includes(String(s.unitCode ?? s.unitText)),
  );
  const area = unique(
    sizes.map((s) => numeric(s.value)).filter((v) => v !== null),
    'Surfaces Airbnb contradictoires.',
  );
  return {
    canonicalUrl,
    sourceListingId: id,
    adapterVersion: 'airbnb-public/1.0',
    transaction: 'rent',
    description: descriptionFromString(rental.description, 'JSON-LD.VacationRental.description'),
    facts: {
      title: title && title.length >= 3 ? verified(title, 'text', 'JSON-LD.VacationRental.name') : missing('text'),
      propertyType: verified(kind, 'category', kinds.length ? 'Airbnb.propertyType' : 'JSON-LD.VacationRental.@type'),
      locality: locality
        ? verified(locality, 'text', 'JSON-LD.VacationRental.address.addressLocality')
        : missing('text'),
      price: missing('EUR_cent'),
      area: area === undefined ? missing('m2') : verified(area, 'm2', 'JSON-LD.VacationRental.floorSize'),
      rooms: missing('rooms'),
    },
    photoUrls,
    warnings: [
      'Location de courte durée : les tarifs par séjour ou par nuit ne sont pas importés comme un loyer mensuel.',
      ...(area === undefined ? ['Surface non publiée sur Airbnb ; elle est omise de la vidéo.'] : []),
    ],
  };
}
