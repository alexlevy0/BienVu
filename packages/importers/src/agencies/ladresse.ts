import {ImportFailure} from '@bienvu/contracts';
import {absolute, attr, descendants, hasClass, tag, text, type HtmlNode} from '../html';
import {descriptionFromNodes} from '../description';
import {missing, numeric, unique, verified} from '../facts';
import {IMPORT_LIMITS, publicUrl} from '../network';
import type {ExtractedListing} from '../listing';

// DOM public observé le 05/10/2026. Seules les données et la galerie de la
// référence courante sont lues ; aucun script de suivi n'est exécuté.
export function extractLadresse(nodes: HtmlNode[], url: string, canonicalUrl: string, id: string): ExtractedListing | undefined {
  const references = nodes.filter(n => hasClass(n, 'annonce-reference'));
  if (!references.length) return undefined;
  const heads = nodes.filter(n => tag(n) === 'h1');
  if (references.length !== 1 || heads.length !== 1)
    throw new ImportFailure('CONFLICTING_FACTS', 'Plusieurs fiches l’Adresse.');
  const reference = text(references[0]).match(/^Réf\. de l'annonce\s*:\s*(\d+)\s*\//i)?.[1];
  if (reference !== id) throw new ImportFailure('CONFLICTING_FACTS', 'La référence l’Adresse désigne un autre bien.');
  const title = text(heads[0]), match = title.match(/^Vente\s+(maison|appartement)\s+(\d+)\s+pièces?,\s*([\d.,]+)\s*m[²2],\s*(.+)$/i);
  if (!match) throw new ImportFailure('INCOMPLETE_LISTING', 'Titre l’Adresse non reconnu.');
  if (new URL(url).pathname.split('/')[3] !== match[1].toLowerCase())
    throw new ImportFailure('CONFLICTING_FACTS', 'Type de bien l’Adresse contradictoire.');
  const header = 'parentNode' in heads[0] ? heads[0].parentNode : null;
  const headerNodes = header ? descendants(header) : [];
  if (!headerNodes.includes(references[0])) throw new ImportFailure('CONFLICTING_FACTS', 'Référence étrangère au titre l’Adresse.');
  const prices = headerNodes.filter(n => hasClass(n, 'annonce-prix')).map(text);
  const amount = unique(prices.map(p => numeric(p.match(/^([\d\s.,]+)\s*€$/)?.[1])).filter((v): v is number => v !== null), 'Prix l’Adresse contradictoires.');
  const price = amount === undefined ? missing('EUR_cent') : verified({amountCents: Math.round(amount * 100), currency: 'EUR' as const,
    period: 'total' as const, charges: 'not_applicable' as const}, 'EUR_cent', 'lAdresse.h1.parent.annonce-prix', prices.join(' | '));
  const galleries = nodes.filter(n => attr(n, 'id') === 'annonce-photos');
  if (galleries.length > 1) throw new ImportFailure('CONFLICTING_FACTS', 'Plusieurs galeries l’Adresse.');
  const photos = new Map<string, string>();
  for (const node of galleries.flatMap(descendants).filter(n => tag(n) === 'img')) {
    const value = attr(node, 'src'); if (!value) continue;
    const image = publicUrl(absolute(value, url), {stage: 'photo', resourceType: 'image'});
    const file = image.pathname.match(/\/catalog\/images\/pr_[pb]\/((?:\d\/)+)(\d+)[a-z]\.jpe?g$/i);
    if (image.hostname !== 'admin.exceladresse.com' || !file || file[2] !== id || file[1].replaceAll('/', '') !== id)
      throw new ImportFailure('CONFLICTING_FACTS', 'Photo étrangère à la référence l’Adresse.');
    if (!photos.has(image.pathname)) photos.set(image.pathname, image.href);
  }
  const description = descriptionFromNodes(nodes.filter(n => attr(n, 'id') === 'annonce-description'), 'lAdresse.#annonce-description');
  const area = numeric(match[3]), rooms = numeric(match[2]);
  return {canonicalUrl, sourceListingId: id, adapterVersion: 'ladresse-dom/1.0', transaction: 'sale', description,
    facts: {title: verified(title, 'text', 'lAdresse.h1'), locality: verified(match[4], 'text', 'lAdresse.h1.locality'),
      propertyType: verified(match[1].toLowerCase() === 'maison' ? 'house' as const : 'apartment' as const, 'category', 'lAdresse.h1.propertyType'),
      area: area ? verified(area, 'm2', 'lAdresse.h1.area') : missing('m2'),
      rooms: rooms && Number.isInteger(rooms) ? verified(rooms, 'rooms', 'lAdresse.h1.rooms') : missing('rooms'), price},
    photoUrls: [...photos.values()].slice(0, IMPORT_LIMITS.candidates),
    warnings: [...(price.status === 'missing' ? ['Prix omis : montant non vérifiable.'] : [])]};
}
