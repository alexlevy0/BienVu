import { ImportFailure, sourceForHost, sourceListingId, VehicleFacts } from '@bienvu/contracts';
import { descriptionFromString } from './description';
import { missing, verified } from './facts';
import { absolute, attr, type HtmlNode, rawText, tag } from './html';
import type { ExtractedListing } from './listing';

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Obj) : {});
const list = (v: unknown): unknown[] => (v == null ? [] : Array.isArray(v) ? v : [v]);
const string = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
const name = (v: unknown) => string(v) || string(obj(v).name);
const number = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v)
    ? v
    : typeof v === 'string' && /^\d+(?:\.\d+)?$/.test(v.trim())
      ? Number(v)
      : null;
const types = (v: Obj) => list(v['@type']).map((t) => String(t).replace(/^https?:\/\/schema.org\//, ''));
export function isVehicleSource(url: string) {
  const u = new URL(url),
    id = sourceForHost(u.hostname)?.id;
  return (
    ['lacentrale', 'autoscout24', 'aramisauto'].includes(id ?? '') ||
    (id === 'leboncoin' && /\/(?:ad\/)?voitures\//.test(u.pathname))
  );
}

// Read only the identified vehicle, never recommendation cards or site-wide images.
// JSON is parsed as data. Embedded scripts are never evaluated.
export function extractVehicle(
  nodes: HtmlNode[],
  documents: unknown[],
  url: string,
  canonicalUrl: string,
): ExtractedListing {
  const source = sourceForHost(new URL(url).hostname),
    id = source && sourceListingId(source, new URL(url).pathname);
  const roots = documents.flatMap((v) => (Array.isArray(v) ? v : list(obj(v)['@graph'] ?? v))).map(obj);
  if (roots.some((v) => types(v).some((t) => ['ItemList', 'CollectionPage', 'SearchResultsPage'].includes(t))))
    throw new ImportFailure('NOT_A_LISTING', 'Cette page est une liste de véhicules.', 'not_listing');
  const candidates = roots.flatMap((root) =>
    types(root).some((t) => ['Car', 'Vehicle', 'MotorVehicle'].includes(t))
      ? [{ car: root, offer: obj(root.offers), root }]
      : types(root).includes('Product') && types(obj(obj(root.offers).itemOffered)).includes('Car')
        ? [{ car: obj(obj(root.offers).itemOffered), offer: obj(root.offers), root }]
        : [],
  );
  if (candidates.length !== 1)
    throw new ImportFailure(
      candidates.length ? 'CONFLICTING_FACTS' : 'NOT_A_LISTING',
      'Le véhicule de cette annonce ne peut pas être identifié.',
      'structure_changed',
    );
  const { car, offer, root } = candidates[0];
  const u = new URL(url);
  for (const raw of [offer.url, car.url, car['@id']])
    if (typeof raw === 'string' && /^https?:/.test(raw)) {
      const v = new URL(raw, url);
      if (
        v.origin !== u.origin ||
        v.pathname !== u.pathname ||
        (u.searchParams.has('vehicleId') && v.searchParams.get('vehicleId') !== u.searchParams.get('vehicleId'))
      )
        throw new ImportFailure('CONFLICTING_FACTS', 'Les données désignent un autre véhicule.');
    }
  if (id && string(car.identifier) && string(car.identifier) !== id)
    throw new ImportFailure('CONFLICTING_FACTS', 'Référence du véhicule différente du lien.');
  let details: Obj = {};
  if (source?.id === 'autoscout24') {
    const scripts = nodes.filter((n) => tag(n) === 'script' && attr(n, 'id') === '__NEXT_DATA__');
    if (scripts.length === 1 && rawText(scripts[0]).length < 2_000_000) {
      try {
        details = (obj(obj(obj(JSON.parse(rawText(scripts[0]))).props).pageProps).listingDetails as Obj) ?? {};
      } catch {
        /* Structured facts remain usable. */
      }
      if (string(details.id) !== id)
        throw new ImportFailure('CONFLICTING_FACTS', 'La galerie appartient à une autre annonce.');
    }
  }
  const vehicle = obj(details.vehicle),
    mileage = obj(car.mileageFromOdometer);
  const yearRaw = string(car.dateVehicleFirstRegistered) || string(car.productionDate),
    year = /^\d{4}(?:-|$)/.test(yearRaw) ? Number(yearRaw.slice(0, 4)) : null;
  const hp = list(car.vehicleEngine)
    .flatMap((e) => list(obj(e).enginePower))
    .map(obj)
    .find((p) => ['BHP', 'HP'].includes(string(p.unitCode)));
  const data = (v: unknown, unit: string, path: string) =>
    v == null || v === '' ? missing(unit) : verified(v, unit, path);
  const facts = VehicleFacts.parse({
    make: data(
      name(car.brand) || name(car.manufacturer) || name(root.brand) || null,
      'text',
      'JSON-LD.vehicle.manufacturer',
    ),
    model: data(name(car.model) || null, 'text', 'JSON-LD.vehicle.model'),
    year: data(year, 'year', 'JSON-LD.vehicle.dateVehicleFirstRegistered'),
    mileageKm: data(
      ['KMT', 'km'].includes(string(mileage.unitCode ?? mileage.unitText)) ? number(mileage.value) : null,
      'km',
      'JSON-LD.vehicle.mileageFromOdometer',
    ),
    fuel: data(name(car.fuelType) || string(obj(vehicle.fuelCategory).formatted) || null, 'text', 'vehicle.fuelType'),
    transmission: data(name(car.vehicleTransmission) || null, 'text', 'JSON-LD.vehicle.vehicleTransmission'),
    powerHp: data(hp ? number(hp.value) : null, 'hp', 'JSON-LD.vehicle.vehicleEngine.enginePower'),
  });
  const locality =
    string(obj(obj(offer.offeredBy).address).addressLocality) ||
    string(obj(details.location).city) ||
    string(obj(car.address).addressLocality);
  const title = string(details.title) || string(car.name);
  const amount = number(offer.price);
  const conditionalPrice =
    obj(details.price).isConditionalPrice === true ||
    /LeaseOut/.test(string(offer.businessFunction)) ||
    list(offer.priceSpecification).some((s) =>
      /^(MON|month|mois|P1M)$/i.test(string(obj(s).unitCode ?? obj(s).billingDuration)),
    );
  const photos = [...list(car.image), ...list(root.image), ...list(details.images)]
    .map((v) => (typeof v === 'string' ? v : string(obj(v).contentUrl ?? obj(v).url)))
    .filter(Boolean)
    .map((v) => absolute(v, url));
  if (
    source?.id === 'autoscout24' &&
    photos.some(
      (v) =>
        new URL(v).hostname !== 'prod.pictures.autoscout24.net' ||
        !new URL(v).pathname.startsWith(`/listing-images/${id}_`),
    )
  )
    throw new ImportFailure('CONFLICTING_FACTS', 'Une photo ne correspond pas au véhicule.');
  // Aramis betamodels are catalogue illustrations, not photos of this stock item.
  const photoUrls = [...new Set(photos)]
    .filter(
      (v) =>
        source?.id !== 'aramisauto' ||
        (new URL(v).pathname.startsWith('/aramis_vehicles/') && !new URL(v).pathname.includes('/betamodels/')),
    )
    .slice(0, 48);
  return {
    category: 'vehicle',
    vehicle: facts,
    canonicalUrl,
    sourceListingId: id || null,
    adapterVersion: 'vehicle-jsonld/1',
    transaction: 'sale',
    description: descriptionFromString(
      details.description ?? car.description ?? root.description,
      'vehicle.sellerDescription',
    ),
    facts: {
      title: title ? verified(title, 'text', 'vehicle.name') : missing('text'),
      propertyType: missing('category'),
      locality: locality ? verified(locality, 'text', 'vehicle.seller.addressLocality') : missing('text'),
      area: missing('m2'),
      price:
        !conditionalPrice && amount !== null && amount > 0 && offer.priceCurrency === 'EUR'
          ? verified(
              { amountCents: Math.round(amount * 100), currency: 'EUR', period: 'total', charges: 'not_applicable' },
              'EUR_cent',
              'JSON-LD.vehicle.offers.price',
            )
          : missing('EUR_cent'),
    },
    photoUrls,
    warnings: [
      ...(photoUrls.length < 3
        ? ['Ajoutez au moins trois photos réelles du véhicule ; les illustrations de catalogue sont exclues.']
        : []),
      ...(!locality ? ['Localisation non indiquée : vous pouvez la compléter.'] : []),
    ],
  };
}
