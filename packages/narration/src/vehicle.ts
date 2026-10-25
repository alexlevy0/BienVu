import {
  type AgencyBrand,
  NarrationFailure,
  type NormalizedListing,
  type ScriptFactRef,
  type VideoDuration,
} from '@bienvu/contracts';
import { frenchEuros, frenchInteger } from './french';
import type { Copy, ScriptContext } from './script';
import { DESCRIPTION_SEGMENTATION_VERSION, wordCount } from './suggestion';

// A closed catalogue: GPT selects paragraphs and photos, never writes vehicle
// claims. Seller caveats stay whole and are attributed to their source.
export async function vehicleScriptContext(
  listing: NormalizedListing,
  brand: AgencyBrand,
  contact: ScriptContext['contact'],
  duration: VideoDuration,
  hash: (v: unknown) => Promise<string>,
  custom?: string[],
): Promise<ScriptContext> {
  const vehicle = listing.vehicle!;
  const known = <T>(fact: { status: string; value: T | null }) =>
    ['verified', 'user_provided'].includes(fact.status) ? fact.value : null;
  const title = known(listing.facts.title)!;
  // biome-ignore lint/suspicious/noControlCharactersInRegex: Reject control bytes in untrusted listing titles.
  if (/[<>\x00-\x1f\x7f]/.test(title)) throw new NarrationFailure('SCRIPT_INPUT_INVALID');
  const year = known(vehicle.year),
    km = known(vehicle.mileageKm),
    fuel = known(vehicle.fuel),
    transmission = known(vehicle.transmission),
    hp = known(vehicle.powerHp);
  const specifications = [
    year === null ? '' : `Année indiquée dans l’annonce : ${frenchInteger(year)}.`,
    km === null ? '' : `Le compteur affiche ${frenchInteger(km)} kilomètres.`,
    fuel ? `Énergie annoncée : ${fuel}.` : '',
    transmission ? `Transmission : ${transmission}.` : '',
    hp === null ? '' : `Puissance annoncée : ${frenchInteger(hp)} chevaux.`,
  ].filter(Boolean);
  const raw = listing.description?.text ?? '';
  const sentences = raw
    .split(/(?<=[.!?])\s+|\n+/u)
    .map((s) => s.trim())
    .filter(Boolean);
  const safe = sentences.filter(
    (s) =>
      !/(?:ignore[rz]?|instructions?|prompt|système|system|assistant|invente[rz]?|https?:|www\.|@|<|>|meilleur prix|garanti|financement|leasing|mensualit)/iu.test(
        s,
      ),
  );
  const caveat =
    /(?:risqu|défaut|panne|répar|accident|endommag|prévoir|colmatage|sans contrôle|non roulant|ne .{0,30} pas)/iu;
  const essential = safe.filter((s) => caveat.test(s));
  if (sentences.some((s) => caveat.test(s) && !safe.includes(s)) || essential.join(' ').length > 330)
    throw new NarrationFailure('SCRIPT_INPUT_INVALID');
  const quote = essential.length ? `Le vendeur précise : « ${essential.join(' ')} »` : '';
  const price = known(listing.facts.price),
    city = known(listing.facts.locality);
  const provenance: ScriptContext['provenance'] = [
    {
      ref: 'vehicle',
      status:
        listing.sourceKind === 'manual' || Object.values(vehicle).some((f) => f.status === 'user_provided')
          ? 'user_provided'
          : 'verified',
      sourcePath: 'listing.vehicle',
    },
    {
      ref: 'photos',
      status: listing.sourceKind === 'manual' ? 'user_provided' : 'verified',
      sourcePath: 'listing.photos',
    },
    ...(price
      ? [
          {
            ref: 'price' as const,
            status: listing.facts.price.status as 'verified' | 'user_provided',
            sourcePath: 'listing.facts.price',
          },
        ]
      : []),
    ...(quote
      ? [
          {
            ref: 'description' as const,
            status: listing.sourceKind === 'manual' ? ('user_provided' as const) : ('verified' as const),
            sourcePath: listing.description!.sourcePath,
          },
        ]
      : []),
    ...(contact !== 'none'
      ? [{ ref: 'agency.name' as const, status: 'user_provided' as const, sourcePath: 'agency.name' }]
      : []),
  ];
  const intro = `Découvrez ${title}${city ? `, proposé à ${city}` : ''}.`;
  const middle =
    specifications.join(' ') ||
    'Voici les photographies de ce véhicule. Consultez les informations de l’annonce pour ses caractéristiques.';
  const details = [
    quote,
    price ? `Le prix de vente annoncé est de ${frenchEuros(price.amountCents)}.` : '',
    !quote ? 'Les images permettent de découvrir le véhicule sous différents angles.' : '',
  ]
    .filter(Boolean)
    .join(' ');
  const ending =
    contact === 'none'
      ? 'Ce véhicule vous intéresse ? Consultez l’annonce et contactez le vendeur pour en savoir plus.'
      : `Pour en savoir plus sur ce véhicule, contactez ${brand.name}.`;
  const maximum = { 20: 60, 30: 90, 40: 120 }[duration];
  const lines = [intro, middle, details || 'Retrouvez les détails de cette offre dans l’annonce.', ending];
  const additions = [
    'Prenons le temps de le découvrir en images.',
    'Vérifiez auprès du vendeur les informations qui comptent pour votre projet.',
    'Vous pouvez lui demander des précisions sur les caractéristiques et les conditions de vente.',
    'Pour préparer votre échange, retrouvez les renseignements publiés dans cette annonce.',
  ];
  const target = { 20: 48, 30: 78, 40: 100 }[duration];
  for (const addition of additions)
    if (
      wordCount(lines.join(' ')) < target &&
      wordCount([...lines, addition].join(' ')) <= maximum &&
      lines.join(' ').length + addition.length < 980
    )
      lines[3] += ` ${addition}`;
  if (wordCount(lines.join(' ')) > maximum) {
    // Keep caveats and contact. Optional specifications may remain on screen.
    while (specifications.length && wordCount(lines.join(' ')) > maximum) {
      specifications.pop();
      lines[1] = specifications.join(' ') || 'Découvrez ce véhicule en images.';
    }
    if (wordCount(lines.join(' ')) > maximum) throw new NarrationFailure('SCRIPT_INPUT_INVALID');
  }
  const kinds = ['intro', 'gallery', 'location', 'contact'] as const;
  const copies: Copy[] = lines.map((text, i) => ({
    id: `${kinds[i]}/description-0`,
    kind: kinds[i],
    narrationText: text,
    captionText: (i === 0 ? title : text).slice(0, 180),
    factRefs: [i === 2 && quote ? 'description' : 'vehicle', ...(i === 2 && price ? ['price' as const] : [])],
    ...(i === 2 && quote ? { condition: true } : {}),
  }));
  if (custom) {
    if (custom.length !== 4) throw new NarrationFailure('SCRIPT_INPUT_INVALID');
    for (const [i, text] of custom.entries())
      copies[i] = {
        ...copies[i],
        id: `${kinds[i]}/user`,
        narrationText: text,
        captionText: text.slice(0, 180),
        factRefs: ['narration', 'photos'] as ScriptFactRef[],
        condition: undefined,
      };
    provenance.splice(
      0,
      provenance.length,
      { ref: 'narration', status: 'user_provided', sourcePath: 'customization.narration' },
      { ref: 'photos', status: 'user_provided', sourcePath: 'listing.photos' },
    );
  }
  return {
    listing,
    brand,
    contact,
    copyVersion: 'description-copy/2',
    copies,
    provenance,
    inputHash: await hash({ version: 'vehicle-copy/1', listing, brand, contact, duration, copies }),
    durationSeconds: duration,
    descriptionSegmentationVersion: DESCRIPTION_SEGMENTATION_VERSION,
    ...(custom ? { customNarration: custom } : {}),
  };
}
