import {AgencyBrand, GeneratableListing, ListingScript, NarrationFailure, ScriptCopyVersion, ScriptPlan, SYNTHETIC_VOICE_DISCLOSURE,
  CustomNarration,type NormalizedListing, type SceneKind, type ScriptFactRef, type VideoDuration} from '@bienvu/contracts';
import {displayEuros, displayNumber, frenchDecimal, frenchEuros, frenchInteger} from './french';
import {descriptionPassages,narrationWordLimit,wordCount} from './suggestion';

export const PROMPT_VERSION = 'narration-fr/1' as const;
export const COPY_VERSION = 'factual-copy/2' as const;
export type Copy = {id: string; kind: SceneKind; narrationText: string; captionText: string; factRefs: ScriptFactRef[];condition?:boolean};
export type ScriptContext = {listing: NormalizedListing; brand: AgencyBrand; contact: 'phone' | 'email' | 'website' | 'none';
  copyVersion: ScriptCopyVersion; copies: Copy[]; provenance: ListingScript['provenance']; inputHash: string;customNarration?:string[];durationSeconds?:VideoDuration};
export const scriptPromptVersion=(context:Pick<ScriptContext,'copyVersion'>)=>context.copyVersion==='description-copy/1'?'narration-fr/2' as const:PROMPT_VERSION;
export async function hashJson(value: unknown) {
  const bytes = new TextEncoder().encode(JSON.stringify(value)), hash = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(hash)].map(b => b.toString(16).padStart(2, '0')).join('');
}
export async function scriptContext(listingInput: unknown, brandInput: unknown, contact?: 'phone' | 'email' | 'website' | 'none',
  copyVersionInput: ScriptCopyVersion = COPY_VERSION,userNarration?:string[],durationSeconds?:VideoDuration): Promise<ScriptContext> {
  const versionResult = ScriptCopyVersion.safeParse(copyVersionInput);
  if (!versionResult.success) throw new NarrationFailure('SCRIPT_INPUT_INVALID');
  const copyVersion = versionResult.data;
  const parsed = GeneratableListing.safeParse(listingInput), parsedBrand = AgencyBrand.safeParse(brandInput);
  if (!parsed.success || !parsedBrand.success || parsed.data.agencyId !== parsedBrand.data.id) throw new NarrationFailure('SCRIPT_INPUT_INVALID');
  const listing = parsed.data, brand = parsedBrand.data;
  const channel = contact ?? (brand.neutral ? 'none' : brand.phone ? 'phone' : brand.email ? 'email' : 'website');
  if (channel==='none' ? !brand.neutral : !brand[channel]) throw new NarrationFailure('SCRIPT_INPUT_INVALID');
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
  if(channel==='none')add('contact',['photos'],'Découvrez le bien',
    ['Retrouvez les détails dans cette annonce.', 'Consultez cette annonce pour en savoir plus.', 'Découvrez cette annonce.'],
    ['Ce bien vous intéresse ? Retrouvez les détails dans cette annonce.', 'Pour en savoir plus, découvrez cette annonce.', 'Découvrez cette annonce.']);
  else add('contact', ['agency.name', 'agency.contact'], `${brand.name}\n${brand[channel]}`,
    [`Pour en savoir plus, contactez ${brand.name}.`, `${brand.name} est votre contact pour en savoir plus.`, `Contactez ${brand.name}.`],
    [`Envie d'en savoir plus ? Contactez ${brand.name}.`, `Ce bien vous intéresse ? Parlons-en avec ${brand.name}.`, `Contactez ${brand.name}.`]);
  const status = listing.sourceKind === 'manual' ? 'user_provided' as const : 'verified' as const;
  const provenance: ListingScript['provenance'] = [];
  for (const key of ['propertyType', 'locality', 'area', 'rooms', 'price'] as const) {
    const fact = listing.facts[key];
    if (fact && (fact.status === 'verified' || fact.status === 'user_provided')) provenance.push({ref: key, status: fact.status, sourcePath: fact.sourcePath});
  }
  provenance.push({ref: 'transaction', status, sourcePath: listing.sourceKind === 'manual' ? 'manual.transaction' : 'listing.transaction'},
    {ref: 'photos', status, sourcePath: 'listing.photos'});
  if(channel!=='none')provenance.push({ref: 'agency.name', status: 'user_provided', sourcePath: 'agency.name'},
    {ref: 'agency.contact', status: 'user_provided', sourcePath: `agency.${channel}`});
  if(copyVersion==='description-copy/1'){
    if(![20,30,40].includes(durationSeconds??20))throw new NarrationFailure('SCRIPT_INPUT_INVALID');
    const passages=descriptionPassages(listing.description?.text??'');
    for(const [index,passage] of passages.entries())for(const kind of ['gallery','location'] as const)
      copies.push({id:`${kind}/description-${index}`,kind,narrationText:passage.narrationText,captionText:passage.text,
        factRefs:['description'],...(passage.condition?{condition:true}:{})});
    if(passages.length&&listing.description)provenance.push({ref:'description',status,sourcePath:listing.description.sourcePath});
  }
  // Seuls les faits et extraits de description filtrés du catalogue sont envoyés.
  // Aucun titre libre, URL ou secret n'est transmis au LLM.
  const inputHash = await hashJson({listingId: listing.id, agencyId: listing.agencyId, sourceKind: listing.sourceKind,
    copies, provenance, photos: listing.photos.map(p => ({id: p.id, contentHash: p.contentHash})), copyVersion,
    ...(copyVersion==='description-copy/1'?{durationSeconds:durationSeconds??20}: {})});
  if(userNarration){
    const parsed=CustomNarration.safeParse(userNarration);if(!parsed.success)throw new NarrationFailure('SCRIPT_INPUT_INVALID');
    const middle=copies.filter(copy=>copy.id.endsWith('/direct')&&!['intro','contact'].includes(copy.kind));
    const kinds:SceneKind[]=['intro',...middle.slice(0,parsed.data.length-2).map(copy=>copy.kind),'contact'];
    if(kinds.length!==parsed.data.length)throw new NarrationFailure('SCRIPT_INPUT_INVALID');
    const customCopies=parsed.data.map((narrationText,index)=>({id:`${kinds[index]}/user`,kind:kinds[index],narrationText,
      captionText:narrationText.slice(0,180),factRefs:['narration','photos'] as ScriptFactRef[]}));
    return {listing,brand,contact:channel,copyVersion,copies:customCopies,customNarration:parsed.data,
      provenance:[{ref:'narration',status:'user_provided',sourcePath:'customization.narration'},...provenance.filter(p=>p.ref==='photos')],
      inputHash:await hashJson({inputHash,customNarration:parsed.data})};
  }
  return {listing, brand, contact: channel, copyVersion, copies, provenance, inputHash,
    ...(copyVersion==='description-copy/1'?{durationSeconds:durationSeconds??20}:{})};
}
export function customScript(context:ScriptContext):ListingScript {
  if(!context.customNarration)throw new NarrationFailure('SCRIPT_INPUT_INVALID');
  return compileScript(context,{scenes:context.copies.map((copy,index)=>({copyId:copy.id,
    photoAssetId:context.listing.photos[index%context.listing.photos.length].id}))},'user-narration/1');
}
// The required caveat is a separate structured selection, so an otherwise
// valid model answer cannot silently omit it. Insert it without foreign photos.
export function descriptionPlan(context:ScriptContext,input:unknown):unknown {
  const conditions=context.copies.filter(c=>c.kind==='gallery'&&c.condition);
  if(context.copyVersion!=='description-copy/1'||!conditions.length)return input;
  if(!input||typeof input!=='object'||Array.isArray(input))throw new NarrationFailure('SCRIPT_INVALID');
  const raw=input as {scenes?:unknown;conditionScene?:unknown};
  if(Object.keys(raw).sort().join(',')!=='conditionScene,scenes'||!Array.isArray(raw.scenes)||raw.scenes.length<3||raw.scenes.length>5
    ||!raw.conditionScene||typeof raw.conditionScene!=='object')throw new NarrationFailure('SCRIPT_INVALID');
  const scene=raw.conditionScene as {copyId?:unknown;photoAssetId?:unknown};
  if(Object.keys(scene).sort().join(',')!=='copyId,photoAssetId'||!conditions.some(c=>c.id===scene.copyId)
    ||!context.listing.photos.some(p=>p.id===scene.photoAssetId))throw new NarrationFailure('SCRIPT_INVALID');
  const others=raw.scenes as {copyId:string;photoAssetId:string}[];
  if(others.some(s=>!s||typeof s!=='object'||typeof s.copyId!=='string'||s.copyId.startsWith('gallery/')))throw new NarrationFailure('SCRIPT_INVALID');
  const at=others.length-1,adjacent=[others[at-1]?.photoAssetId,others[at]?.photoAssetId];
  const photoAssetId=adjacent.includes(scene.photoAssetId as string)?context.listing.photos.find(p=>!adjacent.includes(p.id))!.id:scene.photoAssetId;
  return {scenes:[...others.slice(0,at),{copyId:scene.copyId,photoAssetId},others[at]]};
}
export function compileScript(context: ScriptContext, input: unknown, model: string, version: 1 | 2 = 1): ListingScript {
  const parsed = ScriptPlan.safeParse(input);
  if (!parsed.success) throw new NarrationFailure('SCRIPT_INVALID');
  let plan=parsed.data.scenes;
  if(context.copyVersion==='description-copy/1'&&!context.customNarration){
    // Fitting is deterministic and free: retain whole sourced clauses, force a
    // short opening/contact and omit optional numbers from voice if necessary.
    // Unknown copy/photo IDs still fail before any adaptation.
    if(plan.some(s=>!context.copies.some(c=>c.id===s.copyId)||!context.listing.photos.some(p=>p.id===s.photoAssetId)))throw new NarrationFailure('SCRIPT_INVALID');
    const intro=context.copies.find(c=>c.id==='intro/short')!,ending=context.copies.find(c=>c.id==='contact/short')!;
    let middle=plan.map(s=>context.copies.find(c=>c.id===s.copyId)!).filter(c=>!['intro','contact'].includes(c.kind));
    middle=middle.filter((c,index)=>middle.findIndex(other=>other.kind===c.kind)===index);
    const caveat=context.copies.filter(c=>c.kind==='gallery'&&c.condition).sort((a,b)=>wordCount(a.narrationText)-wordCount(b.narrationText))[0];
    if(caveat&&!middle.some(c=>c.condition))middle=[...middle.filter(c=>c.kind!=='gallery'),caveat];
    if(context.copies.some(c=>c.factRefs.includes('description'))&&!middle.some(c=>c.factRefs.includes('description'))){
      const description=context.copies.filter(c=>c.kind==='location'&&c.factRefs.includes('description')).sort((a,b)=>wordCount(a.narrationText)-wordCount(b.narrationText))[0];
      if(description)middle=[...middle.filter(c=>c.kind!=='location'),description];
    }
    const total=()=>wordCount([intro,...middle,ending].map(c=>c.narrationText).join(' '));
    const maximumScenes=context.durationSeconds===20?4:context.durationSeconds===30?5:6;
    while(middle.length>2&&(middle.length+2>maximumScenes||total()>narrationWordLimit(context.durationSeconds))){
      const removable=middle.filter(c=>!c.condition&&(!c.factRefs.includes('description')||middle.filter(c=>c.factRefs.includes('description')).length>1))
        .sort((a,b)=>Number(a.factRefs.includes('description'))-Number(b.factRefs.includes('description'))||wordCount(b.narrationText)-wordCount(a.narrationText))[0];
      if(!removable)break;middle=middle.filter(c=>c!==removable);
    }
    if(total()>narrationWordLimit(context.durationSeconds))middle=middle.map(current=>{
      const shorter=context.copies.filter(c=>c.kind===current.kind&&Boolean(c.condition)===Boolean(current.condition)
        &&c.factRefs.includes('description')===current.factRefs.includes('description')).sort((a,b)=>wordCount(a.narrationText)-wordCount(b.narrationText))[0];
      return shorter&&wordCount(shorter.narrationText)<wordCount(current.narrationText)?shorter:current;
    });
    const fitted=[intro,...middle,ending];
    plan=fitted.map((c,index)=>({copyId:c.id,photoAssetId:context.listing.photos[index%context.listing.photos.length].id}));
  }
  const scenes = plan.map((scene, index) => {
    const copy = context.copies.find(c => c.id === scene.copyId);
    if (!copy || !context.listing.photos.some(p => p.id === scene.photoAssetId)) throw new NarrationFailure('SCRIPT_INVALID');
    return {id: `scene-${index + 1}`, kind: copy.kind, copyId: copy.id, photoAssetId: scene.photoAssetId,
      narrationText: copy.narrationText, captionText: copy.captionText, factRefs: [...copy.factRefs]};
  });
  if (scenes[0].kind !== 'intro' || scenes.at(-1)!.kind !== 'contact' || new Set(scenes.map(s => s.kind)).size !== scenes.length
    || new Set(scenes.map(s => s.photoAssetId)).size < 3 || scenes.some((s, i) => i > 0 && scenes[i - 1].photoAssetId === s.photoAssetId)
    || scenes.reduce((n, s) => n + s.narrationText.length, 0) > 1000) throw new NarrationFailure('SCRIPT_INVALID');
  if(context.copyVersion==='description-copy/1'&&!context.customNarration){
    if(wordCount(scenes.map(s=>s.narrationText).join(' '))>narrationWordLimit(context.durationSeconds))throw new NarrationFailure('SCRIPT_INVALID');
    if(context.copies.some(c=>c.factRefs.includes('description'))&&!scenes.some(s=>s.factRefs.includes('description')))
      throw new NarrationFailure('SCRIPT_INVALID');
    if(context.copies.some(c=>c.condition)&&!scenes.some(s=>context.copies.find(c=>c.id===s.copyId)?.condition))
      throw new NarrationFailure('SCRIPT_INVALID');
    if(new Set(scenes.filter(s=>s.factRefs.includes('description')).map(s=>s.narrationText)).size!==scenes.filter(s=>s.factRefs.includes('description')).length)
      throw new NarrationFailure('SCRIPT_INVALID');
  }
  const result = ListingScript.safeParse({id: `script-${context.inputHash.slice(0, 32)}-${version}`, agencyId: context.listing.agencyId,
    listingId: context.listing.id, version, language: 'fr-FR', sourceKind: context.listing.sourceKind,
    inputHash: context.inputHash, model, promptVersion: scriptPromptVersion(context), copyVersion: context.copyVersion, disclosure: SYNTHETIC_VOICE_DISCLOSURE,
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
  // Description clauses keep their qualifiers; shortening drops a whole clause
  // when possible, never half a sentence or a condition such as "en sus".
  let scenes=script.scenes.map(s=>({copyId:s.factRefs.includes('description')?s.copyId:`${s.kind}/short`,photoAssetId:s.photoAssetId}));
  if(context.copyVersion==='description-copy/1'&&scenes.length>4){
    const at=scenes.findIndex(s=>{const c=context.copies.find(c=>c.id===s.copyId)!;return !['intro','contact'].includes(c.kind)&&!c.condition
      &&(c.factRefs.includes('description')?scenes.filter(s=>context.copies.find(c=>c.id===s.copyId)!.factRefs.includes('description')).length>1:true);});
    if(at>=0){const reduced=scenes.filter((_,i)=>i!==at);if(new Set(reduced.map(s=>s.photoAssetId)).size>=3)scenes=reduced;}
  }
  if(context.copyVersion==='description-copy/1')scenes=scenes.map(s=>{
    const current=context.copies.find(c=>c.id===s.copyId)!;
    if(!current.factRefs.includes('description')||current.condition)return s;
    const smaller=context.copies.filter(c=>c.kind===current.kind&&c.factRefs.includes('description')&&!c.condition
      &&!scenes.some(s=>context.copies.find(copy=>copy.id===s.copyId)!.narrationText===c.narrationText))
      .sort((a,b)=>wordCount(a.narrationText)-wordCount(b.narrationText))[0];
    return smaller&&wordCount(smaller.narrationText)<wordCount(current.narrationText)?{...s,copyId:smaller.id}:s;
  });
  const shorter = compileScript(context, {scenes}, script.model, 2);
  if (shorter.scenes.every((scene, index) => scene.narrationText === script.scenes[index].narrationText)) throw new NarrationFailure('NARRATION_DURATION_EXCEEDED');
  return shorter;
}
