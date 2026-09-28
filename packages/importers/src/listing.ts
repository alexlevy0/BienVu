import {ImportFailure, type NormalizedListing} from '@bienvu/contracts';
import {absolute, attr, children, descendants, hasClass, htmlDocument, imageCandidate, rawText, tag, text, type HtmlNode} from './html';
import {descriptionFromNodes, descriptionFromString} from './description';
import {IMPORT_LIMITS, publicUrl} from './network';

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj => v !== null && typeof v === 'object' && !Array.isArray(v) ? v as Obj : {};
const list = (v: unknown): unknown[] => v === undefined || v === null ? [] : Array.isArray(v) ? v : [v];
const types = (v: Obj) => list(v['@type']).map(t => String(t).replace(/^https?:\/\/schema.org\//, ''));
const homeTypes: Record<string, 'apartment' | 'house' | 'other'> = {Apartment: 'apartment', House: 'house', SingleFamilyResidence: 'house', Residence: 'other'};
export const verified = <T, U extends string>(value: T, unit: U, sourcePath: string, raw: unknown = value) =>
  ({status: 'verified' as const, value, unit, sourcePath, rawEvidence: (typeof raw === 'object' ? JSON.stringify(raw) : String(raw)).trim().slice(0, 500)});
export const missing = <U extends string>(unit: U) => ({status: 'missing' as const, value: null, unit, sourcePath: null, rawEvidence: null});
export type ExtractedListing = Omit<NormalizedListing, 'id' | 'agencyId' | 'photos' | 'sourceUrl' | 'fetchedAt' | 'sourceHost' | 'sourceKind'> & {photoUrls: string[]};
function numeric(value: unknown): number | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const raw = String(value).replace(/[\s\u00a0\u202f]/g, '');
  if (!/^\d+(?:[.,]\d{1,2})?$/.test(raw)) return null;
  const n = Number(raw.replace(',', '.')); return Number.isFinite(n) && n > 0 ? n : null;
}
function unique<T>(values: T[], message: string): T | undefined {
  const distinct = [...new Map(values.map(v => [JSON.stringify(v), v])).values()];
  if (distinct.length > 1) throw new ImportFailure('CONFLICTING_FACTS', message);
  return distinct[0];
}
const clean = (v: unknown) => typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : '';
function canonical(nodes: HtmlNode[], url: string) {
  const found = nodes.filter(n => tag(n) === 'link' && attr(n, 'rel').split(/\s+/).includes('canonical')).map(n => absolute(attr(n, 'href'), url));
  const value = unique(found, 'Plusieurs URL canoniques.') ?? url;
  const a = publicUrl(value), b = publicUrl(url);
  // Le canonique peut enlever la query de suivi, jamais changer de bien.
  if (a.origin !== b.origin || a.pathname !== b.pathname || a.search && a.search !== b.search)
    throw new ImportFailure('CONFLICTING_FACTS', 'Le canonique désigne une autre annonce.');
  return a.href;
}
function identity(node: Obj, url: string) {
  for (const value of [node.url, obj(node.mainEntityOfPage)['@id']]) if (typeof value === 'string') {
    const u = new URL(value, url), current = new URL(url);
    if (u.origin !== current.origin || u.pathname !== current.pathname)
      throw new ImportFailure('CONFLICTING_FACTS', 'Les données désignent une autre annonce.');
  }
}
function structured(documents: unknown[], url: string, canonicalUrl: string): ExtractedListing {
  const nodes = documents.flatMap(v => Array.isArray(v) ? v : list(obj(v)['@graph'] ?? v)).map(obj);
  if (nodes.length > 200) throw new ImportFailure('NOT_A_LISTING', 'Trop d’entités structurées.');
  const resolve = (v: unknown): Obj => {
    const value = obj(v), id = value['@id'];
    if (Object.keys(value).length === 1 && typeof id === 'string') {
      const matches = nodes.filter(n => n['@id'] === id && Object.keys(n).length > 1);
      if (matches.length !== 1) throw new ImportFailure('CONFLICTING_FACTS', 'Référence JSON-LD ambiguë.');
      return matches[0];
    }
    return value;
  };
  const wrappers = nodes.filter(n => types(n).includes('RealEstateListing'));
  if (wrappers.length > 1) throw new ImportFailure('CONFLICTING_FACTS', 'Plusieurs annonces structurées.');
  const wrapper = wrappers[0] ?? {};
  const nested = resolve(wrapper.mainEntity ?? wrapper.about);
  const homes = Object.keys(nested).length ? [nested] : nodes.filter(n => types(n).some(t => homeTypes[t]));
  if (homes.length !== 1) throw new ImportFailure(homes.length ? 'CONFLICTING_FACTS' : 'NOT_A_LISTING', 'Bien unique non identifié.');
  const home = homes[0]; identity(home, url); identity(wrapper, url);
  const property = unique(types(home).map(t => homeTypes[t]).filter(Boolean), 'Types de bien contradictoires.');
  const title = clean(home.name ?? wrapper.name), locality = clean(resolve(home.address).addressLocality);
  if (!property || title.length < 3 || !locality) throw new ImportFailure('INCOMPLETE_LISTING', 'Titre, type ou localisation absent.');
  const offers = [...list(home.offers), ...list(wrapper.offers)].map(resolve);
  const functions = offers.map(o => String(o.businessFunction ?? '')).filter(Boolean);
  const transaction = unique(functions.map(f => /[#/]Sell$|^Sell$/.test(f) ? 'sale' as const : /[#/]LeaseOut$|^LeaseOut$/.test(f) ? 'rent' as const : null).filter(v => v !== null), 'Vente et location contradictoires.');
  if (!transaction) throw new ImportFailure('INCOMPLETE_LISTING', 'Vente ou location non établie.');
  const warnings: string[] = [];
  const specs = offers.flatMap(o => list(o.priceSpecification).map(resolve));
  const currencies = [...offers, ...specs].map(o => clean(o.priceCurrency)).filter(Boolean);
  const currency = unique(currencies, 'Devises contradictoires.');
  const amounts = [...offers, ...specs].map(o => numeric(o.price)).filter(v => v !== null);
  const amount = unique(amounts, 'Prix contradictoires.');
  const periods = specs.map(s => clean(s.unitCode ?? s.unitText ?? s.billingDuration)).filter(Boolean);
  const monthly = periods.length > 0 && periods.every(p => /^(MON|month|mois|P1M)$/i.test(p));
  const chargeValues = [...offers, ...specs].flatMap(o => list(o.additionalProperty)).map(resolve)
    .filter(v => /^(charges|charges incluses)$/i.test(clean(v.name))).map(v => String(v.value).toLowerCase());
  const chargeRaw = unique(chargeValues, 'Charges contradictoires.');
  const charges = ['true', 'included', 'incluses'].includes(chargeRaw ?? '') ? 'included' as const
    : ['false', 'excluded', 'exclues'].includes(chargeRaw ?? '') ? 'excluded' as const : null;
  const price = amount !== undefined && currency === 'EUR' && (transaction === 'sale' || monthly && charges)
    ? verified({amountCents: Math.round(amount * 100), currency: 'EUR' as const,
      period: transaction === 'sale' ? 'total' as const : 'month' as const,
      charges: transaction === 'sale' ? 'not_applicable' as const : charges!}, 'EUR_cent', 'JSON-LD.mainEntity.offers', JSON.stringify(offers).slice(0, 500))
    : missing('EUR_cent');
  if (price.status === 'missing') warnings.push('Prix omis : montant, devise, période ou charges non vérifiables.');
  const sizes = list(home.floorSize).map(resolve);
  const areas = sizes.filter(s => ['MTK', 'm²', 'm2'].includes(String(s.unitCode ?? s.unitText))).map(s => numeric(s.value)).filter(v => v !== null);
  const area = unique(areas, 'Surfaces contradictoires.');
  const rooms = unique(list(home.numberOfRooms).map(v => numeric(typeof v === 'object' ? obj(v).value : v)).filter(v => v !== null), 'Nombre de pièces contradictoire.');
  const photoUrls = [...new Set([...list(home.image), ...list(wrapper.image)].map(v => typeof v === 'string' ? v : clean(obj(v).contentUrl ?? obj(v).url)).filter(Boolean).map(v => absolute(v, url)))];
  const homePath = Object.keys(nested).length
    ? `JSON-LD.RealEstateListing.${wrapper.mainEntity != null ? 'mainEntity' : 'about'}` : 'JSON-LD.property';
  const description = descriptionFromString(home.description, `${homePath}.description`)
    ?? descriptionFromString(wrapper.description, 'JSON-LD.RealEstateListing.description');
  return {canonicalUrl, sourceListingId: clean(home.identifier ?? wrapper.identifier) || null, adapterVersion: 'structured/3.2', transaction, description,
    facts: {title: verified(title, 'text', 'JSON-LD.mainEntity.name'), propertyType: verified(property, 'category', 'JSON-LD.mainEntity.@type'),
      locality: verified(locality, 'text', 'JSON-LD.mainEntity.address.addressLocality'), price,
      area: area === undefined ? missing('m2') : verified(area, 'm2', 'JSON-LD.mainEntity.floorSize'),
      rooms: rooms === undefined || !Number.isInteger(rooms) ? missing('rooms') : verified(rooms, 'rooms', 'JSON-LD.mainEntity.numberOfRooms')},
    photoUrls: photoUrls.slice(0, IMPORT_LIMITS.candidates), warnings};
}

function microdata(root: HtmlNode): Obj {
  const value: Obj = {'@type': attr(root, 'itemtype').split('/').pop()};
  function walk(node: HtmlNode) {
    for (const child of 'childNodes' in node ? node.childNodes : []) {
      const prop = attr(child, 'itemprop');
      const scope = 'attrs' in child && child.attrs.some(a => a.name === 'itemscope');
      if (prop) {
        const item = scope ? microdata(child) : attr(child, 'content') || attr(child, 'href') || attr(child, 'src') || text(child);
        for (const name of prop.split(/\s+/)) value[name] = value[name] === undefined ? item : [...list(value[name]), item];
      }
      if (!scope) walk(child);
    }
  }
  walk(root); return value;
}

function espaces(nodes: HtmlNode[], url: string, canonicalUrl: string): ExtractedListing {
  const articles = nodes.filter(n => tag(n) === 'article' && hasClass(n, 'vente'));
  if (articles.length !== 1) throw new ImportFailure('NOT_A_LISTING', 'Article d’annonce absent.');
  const scoped = descendants(articles[0]);
  const title = text(scoped.find(n => tag(n) === 'h1' && hasClass(n, 'annonce-title')));
  const records = nodes.filter(n => tag(n) === 'script').flatMap(n => {
    const match = rawText(n).match(/(?:^|\s)(?:var\s+)?dataLayer\s*=\s*(\[[\s\S]*?\])\s*;/);
    if (!match) return []; try {return list(JSON.parse(match[1])).map(obj);} catch {return [];}
  }).filter(n => typeof n.reference === 'string' && typeof n.type_de_bien === 'string');
  if (records.length !== 1) throw new ImportFailure('CONFLICTING_FACTS', 'Identité embarquée ambiguë.');
  const d = records[0], reference = clean(d.reference), path = new URL(url).pathname;
  if (!path.endsWith(`-${reference}/`)) throw new ImportFailure('CONFLICTING_FACTS', 'Référence incohérente.');
  if (d.status !== 'envente') throw new ImportFailure('SOURCE_UNAVAILABLE', 'Annonce non disponible à la vente.');
  const property = d.type_de_bien === 'Appartement' ? 'apartment' : d.type_de_bien === 'Maison' ? 'house' : null;
  if (!title || !property || !clean(d.ville)) throw new ImportFailure('INCOMPLETE_LISTING', 'Faits essentiels absents.');
  const summary = scoped.filter(n => hasClass(n, 'info-resume')).map(text).join(' ');
  const amount = numeric(d.prix_vente);
  const displayed = [...summary.matchAll(/([\d\s\u00a0\u202f]+)\s*€/g)].map(m => numeric(m[1])).filter(v => v !== null);
  unique([...(amount === null ? [] : [amount]), ...displayed], 'Prix affiché et embarqué contradictoires.');
  const galleries = scoped.filter(n => attr(n, 'id') === 'gallery');
  const photoUrls = galleries.flatMap(g => descendants(g)).filter(n => tag(n) === 'a' && hasClass(n, 'rsImg'))
    .map(n => absolute(attr(n, 'href'), url)).filter(v => new URL(v).pathname.includes(`/${reference}/`));
  return {canonicalUrl, sourceListingId: reference, adapterVersion: 'espaces-atypiques/3.2', transaction: 'sale',
    description: descriptionFromNodes(scoped.filter(n => attr(n, 'id') === 'annonce-description'), 'article.vente #annonce-description'),
    facts: {title: verified(title, 'text', 'article.vente h1.annonce-title'), propertyType: verified(property, 'category', 'dataLayer.type_de_bien'),
      locality: verified(clean(d.ville), 'text', 'dataLayer.ville'), area: missing('m2'),
      rooms: numeric(d.nb_pieces) && Number.isInteger(numeric(d.nb_pieces)) ? verified(numeric(d.nb_pieces)!, 'rooms', 'dataLayer.nb_pieces', d.nb_pieces) : missing('rooms'),
      price: amount && displayed.includes(amount) ? verified({amountCents: amount * 100, currency: 'EUR', period: 'total', charges: 'not_applicable'}, 'EUR_cent', 'dataLayer.prix_vente + .info-resume') : missing('EUR_cent')},
    photoUrls: [...new Set(photoUrls)].slice(0, IMPORT_LIMITS.candidates), warnings: ['Surface omise : les surfaces Carrez, au sol et pondérées ne sont pas assimilées.']};
}

function domAgency(nodes: HtmlNode[], url: string, canonicalUrl: string): ExtractedListing | undefined {
  const u = new URL(url), century = u.hostname === 'www.century21.fr', orpi = u.hostname === 'www.orpi.com';
  if (!century && !orpi) return undefined;
  const id = century ? u.pathname.match(/^\/trouver_logement\/detail\/(\d+)\/$/)?.[1]
    : u.pathname.match(/^\/annonce-vente-.*-([a-f0-9]{8}-[a-f0-9-]{27})\/$/)?.[1];
  if (!id) throw new ImportFailure('NOT_A_LISTING', 'Route d’annonce non reconnue.');
  const heads = nodes.filter(n => tag(n) === 'h1');
  if (heads.length !== 1) throw new ImportFailure('CONFLICTING_FACTS', 'Titre d’annonce ambigu.');
  const title = text(heads[0]);
  const match = century ? title.match(/^(Appartement|Maison)(?:\s+\S+)? à vendre\s+(\d+) pièces?\s*-\s*([\d.,]+) m[²2]\s+(.+?)\s*-\s*\d{5}$/i)
    : title.match(/^(Appartement|Maison) à vendre\s+(\d+) pièces?\s*•\s*([\d.,]+) m[²2]\s+(.+)$/i);
  if (!match) throw new ImportFailure('INCOMPLETE_LISTING', 'Type, surface ou localisation non établis.');
  const [, kind, roomsText, areaText, locality] = match;
  const parent = 'parentNode' in heads[0] ? heads[0].parentNode : null;
  const header = parent && 'parentNode' in parent ? parent.parentNode : null;
  if (!header) throw new ImportFailure('INCOMPLETE_LISTING', 'En-tête de bien absent.');
  if (orpi && unique(nodes.map(n => attr(n, 'data-estate-reference')).filter(Boolean), 'Plusieurs références Orpi.') !== id)
    throw new ImportFailure('CONFLICTING_FACTS', 'Référence Orpi différente de l’URL.');
  if (century && !nodes.some(n => attr(n, 'data-property-uid') === id)) throw new ImportFailure('CONFLICTING_FACTS', 'Référence Century 21 absente.');
  const prices = (century ? nodes : descendants(header)).filter(n => century ? hasClass(n, 'c-the-property-abstract__price')
    : tag(n) === 'strong' && hasClass(n, 'h2') && hasClass(n, 'text-primary')).map(n => text(n));
  const amount = unique(prices.map(p => p.match(/^([\d\s.,]+)\s*€$/)?.[1]).filter((v): v is string => Boolean(v)).map(numeric).filter(v => v !== null), 'Prix affichés contradictoires.');
  const roots = nodes.filter(n => hasClass(n, century ? 'c-the-detail-images-no-js-carousel' : 'js-swiper-estate-media'));
  if (roots.length !== 1) throw new ImportFailure('INSUFFICIENT_PHOTOS', 'Galerie du bien non identifiée.');
  const photoUrls = descendants(roots[0]).filter(n => tag(n) === 'img').map(n => imageCandidate(n, url)).filter((v): v is string => v !== null);
  if (orpi && photoUrls.some(v => !decodeURIComponent(new URL(v).pathname).includes(id)))
    throw new ImportFailure('CONFLICTING_FACTS', 'Image étrangère à la référence Orpi.');
  let description: NormalizedListing['description'] = null;
  if (century) {
    const sections = nodes.filter(n => hasClass(n, 'c-the-property-detail-description'));
    description = descriptionFromNodes(sections.flatMap(descendants).filter(n => hasClass(n, 'has-formated-text')),
      '.c-the-property-detail-description .has-formated-text');
  } else {
    const headings = nodes.filter(n => tag(n) === 'h2' && /^L[’']avis de l[’']agent$/i.test(text(n)));
    if (headings.length === 1) {
      const heading = headings[0], parent = 'parentNode' in heading ? heading.parentNode : null;
      const siblings = parent ? children(parent).filter(n => tag(n)) : [], next = siblings[siblings.findIndex(n => n === heading) + 1];
      description = descriptionFromNodes(next && tag(next) === 'div' ? descendants(next).filter(n => hasClass(n, 's-cms')) : [],
        "h2[L'avis de l'agent] + div .s-cms");
    }
  }
  return {canonicalUrl, sourceListingId: id, adapterVersion: century ? 'century21-dom/3.2' : 'orpi-dom/3.2', transaction: 'sale', description,
    facts: {title: verified(title, 'text', 'h1'), propertyType: verified(kind.toLowerCase() === 'maison' ? 'house' : 'apartment', 'category', 'h1', kind),
      locality: verified(locality, 'text', 'h1.locality'), area: verified(numeric(areaText)!, 'm2', 'h1.area', areaText),
      rooms: verified(Number(roomsText), 'rooms', 'h1.rooms', roomsText),
      price: amount === undefined ? missing('EUR_cent') : verified({amountCents: Math.round(amount * 100), currency: 'EUR', period: 'total', charges: 'not_applicable'}, 'EUR_cent', century ? '.c-the-property-abstract__price' : 'header strong.h2.text-primary', prices.join(' | '))},
    photoUrls: [...new Set(photoUrls)].slice(0, IMPORT_LIMITS.candidates), warnings: []};
}

export function extractListingHtml(html: string, url: string): ExtractedListing {
  const {nodes} = htmlDocument(html), canonicalUrl = canonical(nodes, url);
  const scripts = nodes.filter(n => tag(n) === 'script' && attr(n, 'type') === 'application/ld+json');
  if (scripts.length > 20) throw new ImportFailure('NOT_A_LISTING', 'Trop de blocs JSON-LD.');
  const documents = scripts.flatMap(n => {const content = rawText(n); if (content.length > 128_000) throw new ImportFailure('NOT_A_LISTING', 'JSON-LD trop volumineux.'); try {return [JSON.parse(content) as unknown];} catch {return [];}});
  let output: ExtractedListing | undefined;
  try {if (documents.length) output = structured(documents, url, canonicalUrl);} catch (error) {
    if (!(error instanceof ImportFailure) || error.code !== 'NOT_A_LISTING') throw error;
  }
  const microHomes = nodes.filter(n => /\/(House|Apartment|SingleFamilyResidence|Residence)$/.test(attr(n, 'itemtype')));
  if (microHomes.length > 1) throw new ImportFailure('CONFLICTING_FACTS', 'Plusieurs biens dans le DOM.');
  if (microHomes.length === 1) {
    const home = microHomes[0], micro = structured([microdata(home)], url, canonicalUrl);
    micro.adapterVersion = 'microdata/3.2';
    // Le texte riche est lu dans le DOM pour conserver ses paragraphes.
    const descriptionNodes = descendants(home).filter(n => attr(n, 'itemprop').split(/\s+/).includes('description') && attr(n, 'content') === '')
      .filter(n => {
        let parent = 'parentNode' in n ? n.parentNode : null;
        while (parent && parent !== home) {
          if ('attrs' in parent && parent.attrs.some(a => a.name === 'itemscope')) return false;
          parent = 'parentNode' in parent ? parent.parentNode : null;
        }
        return parent === home;
      });
    micro.description = descriptionNodes.length
      ? descriptionFromNodes(descriptionNodes, 'microdata[property].description')
      : descriptionFromString(microdata(home).description, 'microdata[property].description');
    // Galerie exclusivement à l'intérieur du bien identifié, jamais les recommandations.
    const gallery = descendants(home).filter(n => attr(n, 'itemprop') === 'image' || hasClass(n, 'property-gallery'));
    micro.photoUrls = [...new Set([...micro.photoUrls, ...gallery.flatMap(g => descendants(g)).filter(n => tag(n) === 'img')
      .map(n => imageCandidate(n, url)).filter((v): v is string => v !== null)])].slice(0, IMPORT_LIMITS.candidates);
    if (output) {
      for (const field of ['propertyType', 'locality', 'price', 'area'] as const) {
        const a = output.facts[field], b = micro.facts[field];
        if (a.status === 'verified' && b.status === 'verified') unique([a.value, b.value], `Contradiction JSON-LD/DOM : ${field}.`);
      }
      output.description ??= micro.description;
    } else output = micro;
  }
  if (new URL(url).hostname === 'www.espaces-atypiques.com' && new URL(url).pathname.startsWith('/ventes/')) {
    const agency = espaces(nodes, url, canonicalUrl);
    if (output) for (const field of ['price', 'propertyType', 'locality'] as const) {
      const a = output.facts[field], b = agency.facts[field];
      if (a.status === 'verified' && b.status === 'verified') unique([a.value, b.value], `Contradiction des faits : ${field}.`);
    }
    agency.description ??= output?.description ?? null;
    output = agency;
  }
  const dom = domAgency(nodes, url, canonicalUrl);
  if (dom) {
    if (output) for (const field of ['price', 'propertyType', 'locality', 'area'] as const) {
      const a = output.facts[field], b = dom.facts[field];
      if (a.status === 'verified' && b.status === 'verified') unique([a.value, b.value], `Contradiction structurée/DOM : ${field}.`);
    }
    dom.description ??= output?.description ?? null;
    output = dom;
  }
  if (!output) throw new ImportFailure('NOT_A_LISTING', 'Aucune annonce structurée exploitable.');
  // Les URLs douteuses de la galerie sont refusées avant tout téléchargement.
  output.photoUrls = output.photoUrls.filter(v => !/(?:logo|avatar|floor.?plan|plan[-_]|dpe|ges)(?:[-_.\/]|$)/i.test(new URL(v).pathname));
  if (output.photoUrls.length < 3) throw new ImportFailure('INSUFFICIENT_PHOTOS', 'La galerie liée au bien est insuffisante.');
  return output;
}
