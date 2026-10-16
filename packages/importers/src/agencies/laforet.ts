import {ImportFailure} from '@bienvu/contracts';
import {attr, children, descendants, hasClass, imageCandidate, tag, text, type HtmlNode} from '../html';
import {descriptionFromNodes} from '../description';
import {missing, numeric, unique, verified} from '../facts';
import {IMPORT_LIMITS, scopedUrl, sourcePolicy} from '../network';
import {euroAmount, listingIdentity, salePrice, schemaNodes, schemaTypes} from './data';
import type {ExtractedListing} from '../listing';

// Public SSR observed on 13/10/2026. The JSON-LD describes breadcrumbs only;
// the identified page, property sections and gallery establish the facts.
const localityKey = (value: string) => value.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase('fr').replace(/[^a-z0-9]/g, '');
const galleryHost = 'laforetbusiness.laforet-intranet.com';

// Laforêt rounds the summary and SEO surface while the feature panel can keep
// hundredths. Compare at each displayed precision, retaining the most precise
// visible value; equally precise disagreements still fail.
function livingArea(values: unknown[]): number | undefined {
  const readings = values.flatMap(raw => {
    const value = numeric(raw);
    return value === null ? [] : [{value, decimals: String(raw).replace(/\s/gu, '').split(/[.,]/)[1]?.length ?? 0}];
  });
  if (!readings.length) return undefined;
  const precise = readings.reduce((best, item) => item.decimals > best.decimals ? item : best);
  const hundredths = Math.round(precise.value * 100);
  if (readings.some(item => Math.round(hundredths / 10 ** (2 - item.decimals)) !== Math.round(item.value * 10 ** item.decimals)))
    throw new ImportFailure('CONFLICTING_FACTS', 'Surface habitable Laforêt contradictoire.');
  return precise.value;
}

export function extractLaforet(nodes: HtmlNode[], documents: unknown[], url: string, canonicalUrl: string, id: string): ExtractedListing {
  const route = new URL(url).pathname.match(/^\/agence-immobiliere\/[^/]+\/(acheter|louer)\/([^/]+)\/(maison|appartement)-(\d+)-pieces?-(\d+)\/?$/);
  if (!route || route[5] !== id) throw new ImportFailure('NOT_A_LISTING', 'Route Laforêt non reconnue.', 'not_listing');
  const section = (name: string, required = true) => {
    const found = nodes.filter(node => attr(node, 'id') === name);
    if (found.length > 1) throw new ImportFailure('CONFLICTING_FACTS', 'Plusieurs sections Laforêt : ' + name);
    if (!found.length && required) throw new ImportFailure('NOT_A_LISTING', 'Section Laforêt absente : ' + name, 'structure_changed');
    return found[0];
  };
  const main = section('content'), scoped = descendants(main), heads = nodes.filter(node => tag(node) === 'h1');
  if (heads.length !== 1) throw new ImportFailure(heads.length ? 'CONFLICTING_FACTS' : 'NOT_A_LISTING', 'En-tête Laforêt unique absent.', 'structure_changed');
  const title = text(heads[0]), heading = title.match(/^(Maison|Appartement)\s+(?:T(\d+)\s+)?(.+?)\s+à\s+(vendre|louer)$/iu);
  if (!heading) throw new ImportFailure('NOT_A_LISTING', 'Titre Laforêt non reconnu.', 'structure_changed');
  const transaction = route[1] === 'acheter' ? 'sale' as const : 'rent' as const;
  if (heading[1].toLocaleLowerCase('fr') !== route[3] || (heading[4].toLocaleLowerCase('fr') === 'vendre' ? 'sale' : 'rent') !== transaction)
    throw new ImportFailure('CONFLICTING_FACTS', 'Type ou transaction Laforêt contradictoire.');
  const header = 'parentNode' in heads[0] ? heads[0].parentNode : null;
  if (!header) throw new ImportFailure('NOT_A_LISTING', 'Présentation Laforêt absente.', 'structure_changed');
  const address = unique(descendants(header).filter(node => tag(node) === 'a' && attr(node, 'href') === '#section-location').map(text), 'Adresses Laforêt contradictoires.');
  const displayedLocality = address?.match(/^(.+?)\s*\(\d{5}\)$/)?.[1];
  const locality = heading[3];
  if (!displayedLocality || unique([localityKey(locality), localityKey(displayedLocality), localityKey(decodeURIComponent(route[2]))], 'Localisations Laforêt contradictoires.') !== localityKey(locality))
    throw new ImportFailure('INCOMPLETE_LISTING', 'Localisation Laforêt non confirmée.');
  const identities = nodes.filter(node => tag(node) === 'meta' && attr(node, 'property') === 'og:url').map(node => attr(node, 'content'));
  if (!identities.length) throw new ImportFailure('INCOMPLETE_LISTING', 'Identité Laforêt absente.');
  for (const identity of identities) listingIdentity(identity, url);
  for (const node of scoped.filter(node => attr(node, 'data-url'))) listingIdentity(attr(node, 'data-url'), url);
  const records = schemaNodes(documents);
  for (const record of records.filter(record => schemaTypes(record).includes('BreadcrumbList'))) {
    const items = Array.isArray(record.itemListElement) ? record.itemListElement : [];
    const last = items.at(-1) as {item?: unknown} | undefined;
    if (last?.item) listingIdentity(last.item, url);
  }
  const overview = scoped.find(node => tag(node) === 'section' && !attr(node, 'id'));
  const paragraphs = overview ? descendants(overview).filter(node => tag(node) === 'p').map(text) : [];
  const compact = paragraphs.map(value => value.match(/^([\d.,]+)\s*m[²2]\s*[•·]\s*(\d+)\s*pièces?/iu)).filter(value => value !== null);
  const features = section('section-features', false), criteria = features ? descendants(features).filter(node => tag(node) === 'span').map(text) : [];
  const positive = (values: unknown[]) => values.map(numeric).filter((value): value is number => value !== null);
  const rooms = unique(positive([route[4], heading[2], ...compact.map(value => value[2]),
    ...criteria.map(value => value.match(/^(\d+)\s*pièces?$/iu)?.[1])]), 'Pièces Laforêt contradictoires.');
  const areaReadings = [...compact.map(value => value[1]),
    ...criteria.map(value => value.match(/^Surface\s*:\s*([\d.,]+)\s*m[²2]$/iu)?.[1])];
  const area = livingArea(areaReadings);
  const pricePattern = transaction === 'sale' ? /^\d[\d\s.,]*\s*€$/u
    : /^\d[\d\s.,]*\s*€(?:\s*(?:\/|par)\s*mois)?(?:\s*(?:CC|HC|charges (?:comprises|incluses|exclues)))?$/iu;
  const priceLabels = overview ? descendants(overview).filter(node => tag(node) === 'p' && hasClass(node, 'font-bold') && hasClass(node, 'text-primary'))
    .map(text).filter(value => pricePattern.test(value)) : [];
  const amounts = positive(priceLabels.map(value => euroAmount(value.match(/^([\d\s.,]+)\s*€/)?.[1])));
  const metaTitles = nodes.filter(node => tag(node) === 'meta' && attr(node, 'property') === 'og:title').map(node => attr(node, 'content'));
  const metaAreas: string[] = [];
  for (const value of metaTitles) {
    const meta = value.match(/^(Achat|Location)\s+(maison|appartement)\s+(.+?)\s+-\s+(\d+)\s+pièce(?:s|\(s\))?\s+-\s+([\d.,]+)\s*m[²2]\s+-\s+([\d\s.,]+)\s*€/iu);
    if (!meta) continue;
    if ((meta[1].toLocaleLowerCase('fr') === 'achat' ? 'sale' : 'rent') !== transaction || meta[2].toLocaleLowerCase('fr') !== route[3]
      || localityKey(meta[3]) !== localityKey(locality)) throw new ImportFailure('CONFLICTING_FACTS', 'Métadonnées Laforêt étrangères au bien.');
    unique(positive([rooms, meta[4]]), 'Pièces Laforêt contradictoires.');
    metaAreas.push(meta[5]);
    unique(positive([...amounts, euroAmount(meta[6])]), 'Prix Laforêt contradictoires.');
  }
  livingArea([...areaReadings, ...metaAreas]);
  let price: ExtractedListing['facts']['price'] = salePrice(amounts, 'Laforet.#content overview price');
  if (transaction === 'rent') {
    const label = unique(priceLabels, 'Loyers Laforêt contradictoires.'), monthly = label && /(?:\/|par)\s*mois/iu.test(label);
    const charges = label && /\b(?:CC|charges (?:comprises|incluses))\b/iu.test(label) ? 'included' as const
      : label && /\b(?:HC|charges exclues)\b/iu.test(label) ? 'excluded' as const : null;
    price = price.status === 'verified' && monthly && charges ? verified({...price.value!, period: 'month' as const, charges}, 'EUR_cent', 'Laforet.#content monthly rent + charges', label) : missing('EUR_cent');
  }
  const galleries = nodes.filter(node => tag(node) === 'section' && attr(node, 'data-controller').split(/\s+/).includes('gallery'));
  if (galleries.length > 1) throw new ImportFailure('CONFLICTING_FACTS', 'Plusieurs galeries Laforêt.');
  const photos = new Map<string, string>(), hosts = sourcePolicy(url).imageHosts;
  const image = (value: string) => {
    const source = scopedUrl(value, hosts, {stage: 'photo', resourceType: 'image'});
    const path = source.pathname.replace(/^\/glide(?=\/office)/, '');
    const match = path.match(/^\/office\d+\/laforet_[a-z0-9]+(?:[-_][a-z0-9]+)*\/catalog\/images\/pr_[pb]\/((?:\d\/)+)(\d+)[a-z]+\.jpe?g$/iu);
    if (!match || match[2] !== id || match[1].replaceAll('/', '') !== id
      || source.hostname !== galleryHost && !source.pathname.startsWith('/glide/'))
      throw new ImportFailure('CONFLICTING_FACTS', 'Photo étrangère à la référence Laforêt.');
    return {source, key: path.replace('/pr_b/', '/pr_p/')};
  };
  for (const node of galleries.flatMap(descendants).filter(node => tag(node) === 'img')) {
    const candidate = imageCandidate(node, url); if (!candidate) continue;
    const {source, key} = image(candidate);
    if (!photos.has(key) || source.hostname === galleryHost) photos.set(key, source.href);
  }
  if (galleries.length) for (const node of nodes.filter(node => tag(node) === 'meta' && /^og:image(?:_\d+)?$/.test(attr(node, 'property')))) {
    const {source, key} = image(new URL(attr(node, 'content'), url).href);
    if (!photos.has(key)) throw new ImportFailure('CONFLICTING_FACTS', 'Image Laforêt absente de la galerie du bien.');
    if (source.hostname === galleryHost) photos.set(key, source.href);
  }
  const descriptionRoot = section('section-description', false), descriptionNodes = descriptionRoot
    ? children(descriptionRoot).filter(node => tag(node) === 'div' && hasClass(node, 'prose')) : [];
  return {canonicalUrl, sourceListingId: id, adapterVersion: 'laforet-dom/1.1', transaction,
    description: descriptionFromNodes(descriptionNodes, 'Laforet.#section-description .prose'),
    facts: {title: verified(title, 'text', 'Laforet.h1'), propertyType: verified(route[3] === 'maison' ? 'house' as const : 'apartment' as const, 'category', 'Laforet.h1 + route'),
      locality: verified(locality, 'text', 'Laforet.h1 + #section-location'),
      rooms: rooms && Number.isInteger(rooms) ? verified(rooms, 'rooms', 'Laforet.h1 + overview + #section-features') : missing('rooms'),
      area: area ? verified(area, 'm2', 'Laforet.overview + #section-features Surface') : missing('m2'), price},
    photoUrls: [...photos.values()].slice(0, IMPORT_LIMITS.candidates), warnings: price.status === 'missing' ? ['Prix omis : montant, période ou charges non vérifiables.'] : []};
}
