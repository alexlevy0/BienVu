import {ImportFailure, sameSourceHost} from '@bienvu/contracts';
import {absolute, children, descendants, hasClass, imageCandidate, tag, text, type HtmlNode} from '../html';
import {descriptionFromString} from '../description';
import {numeric, unique, verified} from '../facts';
import {publicUrl, IMPORT_LIMITS} from '../network';
import {euroAmount, listingIdentity, object, schemaNodes, schemaTypes, salePrice} from './data';
import type {ExtractedListing} from '../listing';

// The offer is mainEntity; the dwelling is its itemOffered. Its first image
// identifies the single listing carousel, including literal lazy image URLs.
export function extractCitya(nodes: HtmlNode[], documents: unknown[], url: string, canonicalUrl: string, id: string): ExtractedListing {
  const listings = schemaNodes(documents).filter(value => schemaTypes(value).includes('RealEstateListing'));
  if (listings.length !== 1) throw new ImportFailure(listings.length ? 'CONFLICTING_FACTS' : 'NOT_A_LISTING', 'Fiche Citya unique absente.');
  const listing = listings[0], offer = object(listing.mainEntity), home = object(offer.itemOffered);
  if (!schemaTypes(offer).includes('Offer') || !schemaTypes(home).includes('Apartment') || !offer.url)
    throw new ImportFailure('INCOMPLETE_LISTING', 'Offre et appartement Citya non identifiés.');
  for (const entity of [listing, offer, home]) for (const key of ['url', '@id'])
    if (typeof entity[key] === 'string') listingIdentity(entity[key], url);
  if (offer.priceCurrency !== 'EUR' || offer.businessFunction && !/(?:^|[#/])Sell$/.test(String(offer.businessFunction)))
    throw new ImportFailure('CONFLICTING_FACTS', 'Devise ou transaction Citya contradictoire.');
  if (/(?:SoldOut|Discontinued|OutOfStock)$/.test(String(offer.availability)))
    throw new ImportFailure('SOURCE_UNAVAILABLE', 'Annonce Citya indisponible.', 'not_found');
  const heads = nodes.filter(node => tag(node) === 'h1');
  if (heads.length !== 1) throw new ImportFailure('CONFLICTING_FACTS', 'Titre Citya ambigu.');
  const heading = text(heads[0]), parts = heading.match(/^Appartement à vendre (\d+) pièces? ([\d.,]+)\s*m[²2]\s+(.+?)\s*\((\d{5})\)$/i);
  if (!parts) throw new ImportFailure('INCOMPLETE_LISTING', 'En-tête Citya non reconnu.');
  const address = object(home.address), locality = String(address.addressLocality ?? '').trim();
  if (!locality || locality.normalize('NFC').toLocaleLowerCase('fr') !== parts[3].normalize('NFC').toLocaleLowerCase('fr')
    || String(address.postalCode ?? '') !== parts[4]) throw new ImportFailure('CONFLICTING_FACTS', 'Localisation Citya contradictoire.');
  const size = object(home.floorSize), area = numeric(size.value), rooms = numeric(home.numberOfRooms);
  if (!['MTK','m2','m²'].includes(String(size.unitCode ?? size.unitText)) || area === null || rooms === null)
    throw new ImportFailure('INCOMPLETE_LISTING', 'Surface ou pièces Citya absentes.');
  unique([area, numeric(parts[2])], 'Surfaces Citya contradictoires.'); unique([rooms, Number(parts[1])], 'Pièces Citya contradictoires.');
  const parent = 'parentNode' in heads[0] ? heads[0].parentNode : null;
  const prices = (parent ? children(parent) : []).filter(node => tag(node) === 'p' && hasClass(node, 'prix'))
    .map(node => text(node).match(/^([\d\s.,]+)\s*€/u)?.[1]).map(value => euroAmount(value)).filter((value): value is number => value !== null);
  if (!prices.length || euroAmount(offer.price) === null) throw new ImportFailure('INCOMPLETE_LISTING', 'Prix Citya non vérifiable.');
  const price = salePrice([...prices, euroAmount(offer.price)!], 'Citya.h1 adjacent p.prix + JSON-LD.mainEntity.price');
  const agency = id.match(/^TAPP(\d+)-\d+$/)?.[1];
  const photo = (value: string) => {
    const image = publicUrl(absolute(value, url), {stage:'photo',resourceType:'image'}), path = image.pathname.replace(/^\/+/, '/');
    if (!sameSourceHost(image.hostname,new URL(url).hostname) || !new RegExp(`^/media/images/agences/biens/${agency}/vente/[a-f0-9-]{36}\\.(?:webp|jpe?g|png)$`, 'i').test(path))
      throw new ImportFailure('CONFLICTING_FACTS', 'Photo Citya étrangère à la galerie.');
    return {href:image.href, identity:image.origin+path};
  };
  if (typeof listing.image !== 'string') throw new ImportFailure('CONFLICTING_FACTS', 'Couverture Citya non identifiée.');
  const cover = photo(listing.image);
  const galleries = nodes.filter(node => hasClass(node,'swiper-caroussel')).map(node => descendants(node)
    .filter(child => hasClass(child,'swiper-slide')).flatMap(slide => descendants(slide).filter(child => tag(child)==='img'))
    .flatMap(image => {const value=imageCandidate(image,url);return value?[value]:[]}));
  // Bind the carousel to the declared cover before examining its other images.
  // Unrelated recommendation carousels are never candidates for this listing.
  const matching = galleries.filter(images => images.some(value => {
    const image = new URL(value, url); return image.origin + image.pathname.replace(/^\/+/, '/') === cover.identity;
  }));
  if (matching.length !== 1) throw new ImportFailure('CONFLICTING_FACTS', 'Galerie Citya unique non identifiée.');
  const photos = matching[0].map(photo);
  return {canonicalUrl,sourceListingId:id,adapterVersion:'citya-dom/1.0',transaction:'sale',
    facts:{title:verified(heading,'text','Citya.h1'),propertyType:verified('apartment','category','Citya.h1 + JSON-LD.itemOffered.@type'),
      locality:verified(locality,'text','Citya.h1 + JSON-LD.itemOffered.address'),price,area:verified(area,'m2','Citya.h1 + JSON-LD.itemOffered.floorSize'),
      rooms:verified(rooms,'rooms','Citya.h1 + JSON-LD.itemOffered.numberOfRooms')},
    description:descriptionFromString(home.description,'Citya.JSON-LD.mainEntity.itemOffered.description'),
    photoUrls:[...new Set(photos.map(image=>image.href))].slice(0,IMPORT_LIMITS.candidates),warnings:[]};
}
