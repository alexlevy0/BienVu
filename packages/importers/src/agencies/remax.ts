import {ImportFailure} from '@bienvu/contracts';
import {absolute, attr, descendants, hasClass, tag, text, type HtmlNode} from '../html';
import {descriptionFromNodes} from '../description';
import {missing, numeric, unique, verified} from '../facts';
import {IMPORT_LIMITS, publicUrl} from '../network';
import {array, compareNumber, embeddedJson, euroAmount, object, salePrice, schemaNodes, schemaTypes} from './data';
import type {ExtractedListing} from '../listing';

// Le JSON Next contient la fiche encodée en base64 (UTF-8), sans appel API
// supplémentaire ni chargement du widget de visite virtuelle.
export function extractRemax(nodes: HtmlNode[], documents: unknown[], url: string, canonicalUrl: string, id: string): ExtractedListing {
  const encoded = object(object(object(embeddedJson(nodes, '__NEXT_DATA__')).props).pageProps).listingEncoded;
  if (typeof encoded !== 'string' || encoded.length > 256_000 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded))
    throw new ImportFailure('NOT_A_LISTING', 'Fiche RE/MAX encodée illisible.', 'structure_changed');
  let record: Record<string, unknown>;
  try {record = object(JSON.parse(new TextDecoder('utf-8', {fatal: true}).decode(Uint8Array.from(atob(encoded), c => c.charCodeAt(0)))));}
  catch {throw new ImportFailure('NOT_A_LISTING', 'Fiche RE/MAX illisible.', 'structure_changed');}
  if (record.listingTitle !== id || record.descriptionTags !== new URL(url).pathname.split('/')[3])
    throw new ImportFailure('CONFLICTING_FACTS', 'La fiche RE/MAX désigne un autre bien.');
  if (record.isActive !== true || record.isPublished !== true || record.isOnline !== true || record.isSold !== false)
    throw new ImportFailure('SOURCE_UNAVAILABLE', 'Ce bien RE/MAX n’est plus disponible.');
  const products = schemaNodes(documents).filter(n => schemaTypes(n).includes('Product'));
  if (products.length !== 1 || products[0].name !== id) throw new ImportFailure('CONFLICTING_FACTS', 'Référence structurée RE/MAX incohérente.');
  const offer = object(products[0].offers), home = object(offer.itemOffered);
  const property = schemaTypes(home).includes('House') ? 'house' : schemaTypes(home).includes('Apartment') ? 'apartment' : null;
  if (!property || home.name !== id || offer.priceCurrency !== 'EUR') throw new ImportFailure('CONFLICTING_FACTS', 'Bien structuré RE/MAX incohérent.');
  unique([property, new URL(url).pathname.split('/')[3].startsWith('vente-maison-') ? 'house' : 'apartment'], 'Type RE/MAX contradictoire.');
  const referenceNodes = nodes.filter(n => tag(n) === 'div' && text(n) === `id. ${id}`);
  if (referenceNodes.length !== 1) throw new ImportFailure('CONFLICTING_FACTS', 'Référence affichée RE/MAX ambiguë.');
  const header = 'parentNode' in referenceNodes[0] ? referenceNodes[0].parentNode : null;
  const headerNodes = header ? descendants(header) : [];
  if (!headerNodes.some(n => text(n) === 'Vente')) throw new ImportFailure('CONFLICTING_FACTS', 'Transaction RE/MAX affichée incohérente.');
  const amounts = [euroAmount(record.listingPrice), euroAmount(offer.price), ...headerNodes.filter(n => tag(n) === 'h2').map(n => euroAmount(text(n)))].filter((v): v is number => v !== null);
  const area = numeric(record.livingArea), rooms = numeric(record.totalRooms), locality = record.regionName3;
  compareNumber(area, object(home.floorSize).value, 'Surface RE/MAX contradictoire.');
  compareNumber(rooms, home.numberOfRooms, 'Pièces RE/MAX contradictoires.');
  const titles = nodes.filter(n => tag(n) === 'p' && /^(?:Maison|Appartement)\b.* à vendre - (?!\d)/.test(text(n))).map(text);
  const title = unique(titles, 'Titres RE/MAX contradictoires.') ?? '';
  if (!title || typeof locality !== 'string' || !locality || !title.endsWith(`- ${locality}`))
    throw new ImportFailure('INCOMPLETE_LISTING', 'Présentation RE/MAX absente.');
  const primary = publicUrl(String(home.image ?? products[0].image), {stage: 'photo', resourceType: 'image'});
  const prefix = primary.pathname.match(/^\/ds-l\/(listings\/\d+\/\d+\/)[^/]+\.(?:jpe?g|png|webp)$/i)?.[1];
  if (primary.hostname !== 'i.maxwork.fr' || !prefix || prefix.split('/')[2] !== String(record.id))
    throw new ImportFailure('CONFLICTING_FACTS', 'Galerie RE/MAX étrangère à la fiche.');
  const photoUrls = array(record.listingPictures).map(value => {
    if (typeof value !== 'string') throw new ImportFailure('CONFLICTING_FACTS', 'Photo RE/MAX illisible.');
    // La galerie publique utilise W1300_H800_Fit_Watermark = "l-view".
    // "ds-l" dans le JSON-LD est sa vignette 400 px, insuffisante pour la vidéo.
    // Preset observé dans les bundles _app/7133 le 06/10/2026 ; mêmes fichiers,
    // même CDN et filigrane conservé, aucun accès à un original privé.
    const photo = publicUrl(absolute(value, `${primary.origin}/l-view/`), {stage: 'photo', resourceType: 'image'});
    if (photo.hostname !== primary.hostname || !photo.pathname.startsWith(`/l-view/${prefix}`) || !/^[-a-zA-Z0-9]+\.(?:jpe?g|png|webp)$/i.test(photo.pathname.slice(`/l-view/${prefix}`.length)))
      throw new ImportFailure('CONFLICTING_FACTS', 'Photo étrangère à la galerie RE/MAX.');
    return photo.href;
  });
  const cover = `${primary.origin}${primary.pathname.replace(/^\/ds-l\//, '/l-view/')}`;
  if (photoUrls.length && !photoUrls.includes(cover)) throw new ImportFailure('CONFLICTING_FACTS', 'Couverture RE/MAX absente de la galerie.');
  const descriptionNodes = nodes.filter(n => attr(n, 'id') === 'description').flatMap(descendants).filter(n => hasClass(n, 'custom-description'));
  return {canonicalUrl, sourceListingId: id, adapterVersion: 'remax-next/1.0', transaction: 'sale',
    description: descriptionFromNodes(descriptionNodes, 'Remax.#description.custom-description'),
    facts: {title: verified(title, 'text', 'Remax.header.title'), locality: verified(locality, 'text', 'Remax.listing.regionName3'),
      propertyType: verified(property, 'category', 'Remax.Product.offers.itemOffered.@type'), price: salePrice(amounts, 'Remax.listing.listingPrice'),
      area: area ? verified(area, 'm2', 'Remax.listing.livingArea') : missing('m2'),
      rooms: rooms && Number.isInteger(rooms) ? verified(rooms, 'rooms', 'Remax.listing.totalRooms') : missing('rooms')},
    photoUrls: [...new Set(photoUrls)].slice(0, IMPORT_LIMITS.candidates), warnings: []};
}
