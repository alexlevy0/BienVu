import {AgencyBrand, GeneratableListing, ListingScript, NarrationFailure, ScriptCopyVersion, ScriptPlan, SYNTHETIC_VOICE_DISCLOSURE,
  type NormalizedListing, type SceneKind, type ScriptFactRef} from '@bienvu/contracts';
import {displayEuros, displayNumber, frenchDecimal, frenchEuros, frenchInteger} from './french';

export const PROMPT_VERSION = 'narration-fr/1' as const;
export const COPY_VERSION = 'factual-copy/2' as const;
export type Copy = {id: string; kind: SceneKind; narrationText: string; captionText: string; factRefs: ScriptFactRef[]};
export type ScriptContext = {listing: NormalizedListing; brand: AgencyBrand; contact: 'phone' | 'email' | 'website';
  copyVersion: ScriptCopyVersion; copies: Copy[]; provenance: ListingScript['provenance']; inputHash: string};
export async function hashJson(value: unknown) {
  const bytes = new TextEncoder().encode(JSON.stringify(value)), hash = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(hash)].map(b => b.toString(16).padStart(2, '0')).join('');
}
export async function scriptContext(listingInput: unknown, brandInput: unknown, contact?: 'phone' | 'email' | 'website',
  copyVersionInput: ScriptCopyVersion = COPY_VERSION): Promise<ScriptContext> {
  const versionResult = ScriptCopyVersion.safeParse(copyVersionInput);
  if (!versionResult.success) throw new NarrationFailure('SCRIPT_INPUT_INVALID');
  const copyVersion = versionResult.data;
  const parsed = GeneratableListing.safeParse(listingInput), parsedBrand = AgencyBrand.safeParse(brandInput);
  if (!parsed.success || !parsedBrand.success || parsed.data.agencyId !== parsedBrand.data.id) throw new NarrationFailure('SCRIPT_INPUT_INVALID');
  const listing = parsed.data, brand = parsedBrand.data;
  const channel = contact ?? (brand.phone ? 'phone' : brand.email ? 'email' : 'website');
  if (!brand[channel]) throw new NarrationFailure('SCRIPT_INPUT_INVALID');
  const known = <T>(fact: {status: string; value: T}) => fact.status === 'verified' || fact.status === 'user_provided';
  const locality = listing.facts.locality.value!, category = listing.facts.propertyType.value!;
  if ([locality, brand.name].some(s => /[<>\u0000-\u001f\u007f]/.test(s))) throw new NarrationFailure('SCRIPT_INPUT_INVALID');
  const property = category === 'house' ? 'cette maison' : category === 'apartment' ? 'cet appartement' : 'ce bien';
  const label = category === 'house' ? 'Maison' : category === 'apartment' ? 'Appartement' : 'Bien immobilier';
  const transaction = listing.transaction === 'sale' ? 'À vendre' : 'À louer';
  const copies: Copy[] = [];
  // La v1 reste reproductible pour les jobs déjà enregistrés. La v2 écrit pour
  // l'oral, sans adjectif sur le bien ni renseignement absent de la source.
  const add = (kind: SceneKind, factRefs: ScriptFactRef[], captionText: string,
    legacy: [string, string, string], conversational: [string, string, string]) => {
    const [direct, warm, short] = copyVersion === 'factual-copy/1' ? legacy : conversational;
    for (const [style, narrationText] of Object.entries({direct, warm, short})) {
      if (narrationText.length > 500 || captionText.length > 180) throw new NarrationFailure('SCRIPT_INPUT_INVALID');
      copies.push({id: `${kind}/${style}`, kind, narrationText, captionText, factRefs});
    }
  };
  add('intro', ['propertyType', 'locality', 'transaction'], `${transaction} · ${label} à ${locality}`,
    [`${transaction}, ${property} se situe à ${locality}.`, `Découvrez ${property} à ${locality}, ${listing.transaction === 'sale' ? 'proposé à la vente' : 'proposé à la location'}.`, `${transaction}, ${property} à ${locality}.`],
    [`Direction ${locality}, pour découvrir ${property} ${transaction.toLowerCase()}.`, `On vous emmène à ${locality}, visiter ${property} ${transaction.toLowerCase()}.`, `${transaction}, ${property} à ${locality}.`]);
  const area = listing.facts.area;
  if (known(area) && area.value !== null) {
    const n = frenchDecimal(area.value), text = `${displayNumber(area.value)} m²`;
    add('area', ['area'], text,
      [`Ce bien présente une surface de ${n} mètres carrés.`, `Découvrez une surface de ${n} mètres carrés.`, `Une surface de ${n} mètres carrés.`],
      [`Vous disposez ici de ${n} mètres carrés.`, `Côté surface, comptez ${n} mètres carrés.`, `Une surface de ${n} mètres carrés.`]);
  }
  const rooms = listing.facts.rooms;
  if (rooms && known(rooms) && rooms.value !== null) {
    const n = frenchInteger(rooms.value).replace(/un$/, 'une'), unit = rooms.value === 1 ? 'pièce' : 'pièces';
    add('rooms', ['rooms'], `${rooms.value} ${unit}`,
      [`Ce bien compte ${n} ${unit}.`, `Vous y trouverez ${n} ${unit}.`, `${n[0].toUpperCase()}${n.slice(1)} ${unit}.`],
      [`À l'intérieur, vous trouverez ${n} ${unit}.`, `La visite se poursuit à l'intérieur, avec ${n} ${unit}.`, `${n[0].toUpperCase()}${n.slice(1)} ${unit}.`]);
  }
  const price = listing.facts.price;
  if (known(price) && price.value !== null) {
    const money = frenchEuros(price.value.amountCents), formatted = displayEuros(price.value.amountCents);
    const end = listing.transaction === 'rent' ? ` par mois, charges ${price.value.charges === 'included' ? 'comprises' : 'non comprises'}` : '';
    const captionEnd = listing.transaction === 'rent' ? ` / mois · ${price.value.charges === 'included' ? 'charges comprises' : 'hors charges'}` : '';
    const start = listing.transaction === 'rent' ? 'Le loyer est de' : 'Le prix de vente est de';
    add('price', ['price', 'transaction'], `${formatted}${captionEnd}`,
      [`${start} ${money}${end}.`, `${listing.transaction === 'rent' ? 'Un loyer' : 'Un prix de vente'} de ${money}${end}.`, `${money[0].toUpperCase()}${money.slice(1)}${end}.`],
      [`${listing.transaction === 'rent' ? 'Le loyer' : 'Son prix'} : ${money}${end}.`, `Côté ${listing.transaction === 'rent' ? 'loyer' : 'prix'}, comptez ${money}${end}.`, `${money[0].toUpperCase()}${money.slice(1)}${end}.`]);
  }
  add('location', ['locality'], locality,
    [`Le bien se situe à ${locality}.`, `Votre découverte se poursuit à ${locality}.`, `À ${locality}.`],
    [`Pour le découvrir, rendez-vous à ${locality}.`, `C'est à ${locality} que la visite se poursuit.`, `À ${locality}.`]);
  add('gallery', ['photos'], 'Le bien en images',
    ['Découvrez les photographies de ce bien.', 'Poursuivez la visite en images.', 'Le bien en images.'],
    ['Prenons un instant pour découvrir les lieux en images.', 'On vous laisse découvrir les lieux en images.', 'Le bien en images.']);
  add('contact', ['agency.name', 'agency.contact'], `${brand.name}\n${brand[channel]}`,
    [`Pour en savoir plus, contactez ${brand.name}.`, `${brand.name} est votre contact pour en savoir plus.`, `Contactez ${brand.name}.`],
    [`Envie d'en savoir plus ? Contactez ${brand.name}.`, `Ce bien vous intéresse ? Parlons-en avec ${brand.name}.`, `Contactez ${brand.name}.`]);
  const status = listing.sourceKind === 'manual' ? 'user_provided' as const : 'verified' as const;
  const provenance: ListingScript['provenance'] = [];
  for (const key of ['propertyType', 'locality', 'area', 'rooms', 'price'] as const) {
    const fact = listing.facts[key];
    if (fact && (fact.status === 'verified' || fact.status === 'user_provided')) provenance.push({ref: key, status: fact.status, sourcePath: fact.sourcePath});
  }
  provenance.push({ref: 'transaction', status, sourcePath: listing.sourceKind === 'manual' ? 'manual.transaction' : 'listing.transaction'},
    {ref: 'photos', status, sourcePath: 'listing.photos'}, {ref: 'agency.name', status: 'user_provided', sourcePath: 'agency.name'},
    {ref: 'agency.contact', status: 'user_provided', sourcePath: `agency.${channel}`});
  // Ni description commerciale, ni titre libre, ni URL, ni secret envoyé au LLM.
  const inputHash = await hashJson({listingId: listing.id, agencyId: listing.agencyId, sourceKind: listing.sourceKind,
    copies, provenance, photos: listing.photos.map(p => ({id: p.id, contentHash: p.contentHash})), copyVersion});
  return {listing, brand, contact: channel, copyVersion, copies, provenance, inputHash};
}
export function compileScript(context: ScriptContext, input: unknown, model: string, version: 1 | 2 = 1): ListingScript {
  const parsed = ScriptPlan.safeParse(input);
  if (!parsed.success) throw new NarrationFailure('SCRIPT_INVALID');
  const scenes = parsed.data.scenes.map((scene, index) => {
    const copy = context.copies.find(c => c.id === scene.copyId);
    if (!copy || !context.listing.photos.some(p => p.id === scene.photoAssetId)) throw new NarrationFailure('SCRIPT_INVALID');
    return {id: `scene-${index + 1}`, kind: copy.kind, copyId: copy.id, photoAssetId: scene.photoAssetId,
      narrationText: copy.narrationText, captionText: copy.captionText, factRefs: [...copy.factRefs]};
  });
  if (scenes[0].kind !== 'intro' || scenes.at(-1)!.kind !== 'contact' || new Set(scenes.map(s => s.kind)).size !== scenes.length
    || new Set(scenes.map(s => s.photoAssetId)).size < 3 || scenes.some((s, i) => i > 0 && scenes[i - 1].photoAssetId === s.photoAssetId)
    || scenes.reduce((n, s) => n + s.narrationText.length, 0) > 1000) throw new NarrationFailure('SCRIPT_INVALID');
  const result = ListingScript.safeParse({id: `script-${context.inputHash.slice(0, 32)}-${version}`, agencyId: context.listing.agencyId,
    listingId: context.listing.id, version, language: 'fr-FR', sourceKind: context.listing.sourceKind,
    inputHash: context.inputHash, model, promptVersion: PROMPT_VERSION, copyVersion: context.copyVersion, disclosure: SYNTHETIC_VOICE_DISCLOSURE,
    scenes, provenance: context.provenance.filter(p => scenes.some(s => s.factRefs.includes(p.ref)))});
  if (!result.success) throw new NarrationFailure('SCRIPT_INVALID');
  return result.data;
}
export function validateScript(context: ScriptContext, input: unknown): ListingScript {
  const parsed = ListingScript.safeParse(input);
  if (!parsed.success) throw new NarrationFailure('SCRIPT_INVALID');
  const expected = compileScript(context, {scenes: parsed.data.scenes.map(s => ({copyId: s.copyId, photoAssetId: s.photoAssetId}))}, parsed.data.model, parsed.data.version);
  if (JSON.stringify(expected) !== JSON.stringify(parsed.data)) throw new NarrationFailure('SCRIPT_INVALID');
  return expected;
}
export function shortenScript(context: ScriptContext, script: ListingScript): ListingScript {
  validateScript(context, script);
  if (script.version !== 1) throw new NarrationFailure('NARRATION_DURATION_EXCEEDED');
  const shorter = compileScript(context, {scenes: script.scenes.map(s => ({copyId: `${s.kind}/short`, photoAssetId: s.photoAssetId}))}, script.model, 2);
  if (shorter.scenes.every((scene, index) => scene.narrationText === script.scenes[index].narrationText)) throw new NarrationFailure('NARRATION_DURATION_EXCEEDED');
  return shorter;
}
