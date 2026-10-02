import type {VideoDuration, ScriptCopyVersion, ScriptFactRef} from '@bienvu/contracts';
import {frenchDecimal, frenchEuros, frenchInteger} from './french';

export const narrationWordLimit = (duration: VideoDuration = 20,version:ScriptCopyVersion='description-copy/2') =>
  (version==='description-copy/2'?{20:60,30:90,40:120}:{20:40,30:60,40:75})[duration];
export const narrationWordTarget = (duration: VideoDuration = 20) => ({20:50,30:77,40:104})[duration];
export const wordCount = (text: string) => text.trim().split(/\s+/u).filter(Boolean).length;
export type DescriptionPassage = {text: string; narrationText: string; condition: boolean; score: number};
const administrative = /(?:RSAC|RNE|SIRE[NT]|immatricul|agent commercial|registre|honoraires|géorisques|diagnostic|DPE|copropriété|charges annuelles|consommation énergétique|estimation des coûts|référence annonce|nos agences|nous contacter|contactez|exclusivité chez|en exclusivité)/iu;
const instructions = /(?:ignore[rz]?|instructions?|prompt|système|system|assistant|invente[rz]?|http[s]?:|www\.|@|clé api|token|<|>)/iu;
const condition = /(?:rafra[iî]chissement|r[eé]novation|travaux|r[eé]nover|rafra[iî]chir).{0,35}(?:pr[eé]voir|n[eé]cessaire|requi|à faire)|(?:à r[eé]nover|à rafra[iî]chir)/iu;

// Extractive catalogue: every property assertion retains its complete source
// clause, including negatives, future tense and supplements. No arbitrary word
// truncation, and no free assertion authored by the model.
export function descriptionPassages(description: string,expanded=false): DescriptionPassage[] {
  const source = description.normalize('NFC').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
  const tail = source.search(/(?:Monsieur\s+\p{Lu}|Madame\s+\p{Lu}|exerce l'activité|registre national|registre spécial|RSAC|SIRE[NT])/iu);
  const body = tail >= 0 ? source.slice(0, tail) : source;
  const sentences = body.split(/[!?;]+\s*|\.(?:\s+|(?=[A-ZÀ-Ÿ]))/u);
  const passages: DescriptionPassage[] = [];
  for (const sentence of sentences) {
    // A comma enumerates independent clauses; an "avec" stays with its noun,
    // so "garage en sus" and "cuisine pouvant s'ouvrir" cannot lose qualifiers.
    for (const raw of sentence.split(/,(?!\s*(?:en sus|en supplément|en supplement|non inclus|non compris|à prévoir|sous réserve|mais|sans|avec|pouvant|qui|à rénover)\b)\s*/iu)) {
      let text = raw.trim().replace(/^\.{1,}/, '').replace(/[.!?;]+$/u, '').trim();
      if (!text || administrative.test(text) || instructions.test(text)) continue;
      // Structured price/area/room count take precedence over rounded or stale
      // figures in descriptions. Those facts have their own exact catalogue.
      const numericFact=/\d[\d\s.,]*\s*(?:m[²2]|mètres carrés|euros?|€|pièces?)(?=\s|[,.;!?]|$)/iu;
      if (numericFact.test(text)) {
        const suffix=text.match(/\bavec\s+(.+)$/iu)?.[1];
        if(!suffix||numericFact.test(suffix))continue;
        text=`Le bien est proposé avec ${suffix}`;
      }
      if (/^(?:appartement\s+T\d|T\d\b)/iu.test(text)) continue;
      const count = wordCount(text);
      if (count < 3 || count > (expanded?50:28) || text.length > (expanded?340:165)) continue;
      // Ignore isolated advertising fragments and agent identifiers.
      if (!/(?:séjour|salon|chambre|cuisine|balcon|terrasse|jardin|piscine|cave|garage|box|cellier|placard|rangement|résidence|calme|lumineu|expos|étage|ascenseur|commerces|métro|gare|proche|rafra[iî]ch|r[eé]nov|travaux|vue|bain|douche|parquet|cheminée|pierre|bureau|suite|extérieur|pièce de vie|centre|transport)/iu.test(text)) continue;
      text = text[0].toLocaleUpperCase('fr-FR') + text.slice(1);
      const noun = /^(?:Un |Une |Deux |Trois |Des |[1-9]\d* chambres?\b)/u.test(text)
        && !/(?:est |sont |se |offre |dispose |à prévoir|nécessaire|requis)/iu.test(text);
      const narrationText = noun ? `Vous trouverez ${text[0].toLocaleLowerCase('fr-FR')}${text.slice(1)}.` : `${text}.`;
      const score = (/(?:balcon|terrasse|jardin|séjour|salon)/iu.test(text) ? 8 : 0)
        + (/(?:chambre|cuisine|calme|lumineu|vue|piscine)/iu.test(text) ? 5 : 0)
        + (/(?:proche|métro|gare|commerces)/iu.test(text) ? 3 : 0);
      if (!passages.some(p => p.text.toLocaleLowerCase('fr-FR') === text.toLocaleLowerCase('fr-FR')))
        passages.push({text, narrationText, condition: condition.test(text), score});
    }
  }
  return passages.slice(0, 16);
}

export type NarrationPhrase={text:string;refs:ScriptFactRef[];condition?:boolean};
// Whole source clauses only. Longer durations get more clauses, never padded
// repetitions or invented features. The two middle paragraphs fit the editable
// and rendered scene contracts and preserve their source references.
export function expandedNarrationLines(intro:NarrationPhrase,ending:NarrationPhrase,facts:NarrationPhrase[],description:string,maximumWords:number):NarrationPhrase[]{
  const passages=descriptionPassages(description,true),essential=passages.filter(p=>p.condition),selected:NarrationPhrase[]=[];
  const reserve=essential.reduce((n,p)=>n+wordCount(p.narrationText),0);
  const textOf=(items:NarrationPhrase[])=>items.map(p=>p.text).join(' ');
  const pack=(items:NarrationPhrase[]):NarrationPhrase[][]|null=>{
    const result:NarrationPhrase[][]=[[],[]];
    for(const phrase of items){const index=[0,1].sort((a,b)=>textOf(result[a]).length-textOf(result[b]).length)
      .find(i=>textOf([...result[i],phrase]).length<=500);if(index===undefined)return null;result[index].push(phrase);}
    return result;
  };
  const add=(phrase:NarrationPhrase,extraReserve=0)=>{
    const all=[intro,...selected,phrase,ending];
    if(wordCount(textOf(all))+extraReserve>maximumWords||textOf(all).length>860||!pack([...selected,phrase])
      ||selected.some(p=>p.text===phrase.text))return false;
    selected.push(phrase);return true;
  };
  // Include the price first when the source provides it. At longer durations,
  // room count and area also have room alongside the property description.
  if(facts[0])add(facts[0],reserve+(passages.some(p=>!p.condition)?8:0));
  for(const passage of passages.filter(p=>!p.condition).sort((a,b)=>b.score-a.score))
    add({text:passage.narrationText,refs:['description']},reserve);
  for(const passage of essential){if(!add({text:passage.narrationText,refs:['description'],condition:true}))return [];}
  for(const fact of facts.slice(1))add(fact);
  const packed=pack(selected)!;
  const middle=packed.map((phrases,index):NarrationPhrase=>phrases.length?{text:textOf(phrases),
    refs:[...new Set(phrases.flatMap(p=>p.refs))],...(phrases.some(p=>p.condition)?{condition:true}:{})}
    :{text:index?'Poursuivons la visite en images.':'Découvrez les lieux en images.',refs:['photos']});
  const result=[intro,...middle,ending];
  return wordCount(textOf(result))<=maximumWords&&textOf(result).length<=900?result:[];
}

export type SuggestedListing = {propertyType: string; transaction: string; locality: string; description: string;
  priceCents: string; area: string; rooms: string; charges?: string};
const positive = (value: string) => {const n = Number(value.replace(/\s/g, '').replace(',', '.')); return Number.isFinite(n) && n > 0 ? n : null;};

// Free, local draft suggestion. Generated automatically until the owner edits
// it; final automatic selection is made from the same source clauses on server.
export function suggestedNarration(fields: SuggestedListing, agency: string, duration: VideoDuration = 20): string[] {
  const property = fields.propertyType === 'house' ? 'cette maison' : fields.propertyType === 'apartment' ? 'cet appartement' : 'ce bien';
  const intro = `${fields.transaction === 'rent' ? 'À louer' : 'À vendre'}, ${property}${fields.locality ? ` à ${fields.locality}` : ''}.`;
  const ending = agency ? `Contactez ${agency}.` : 'Découvrez cette annonce.';
  const limit = narrationWordLimit(duration,'description-copy/1'), available = limit - wordCount(intro + ' ' + ending);
  const passages = descriptionPassages(fields.description), selected: string[] = [];
  let used = 0;
  const add = (text: string, reserve = 0) => {
    if (used + wordCount(text) + reserve > available || selected.includes(text)) return false;
    selected.push(text); used += wordCount(text); return true;
  };
  const essential = passages.find(p => p.condition);
  // Keep a source caveat if it fits; otherwise don't make up a positive state.
  const ranked = [...passages].filter(p => !p.condition).sort((a, b) => b.score - a.score || wordCount(a.narrationText) - wordCount(b.narrationText));
  for (const passage of ranked) {
    add(passage.narrationText, essential && used === 0 ? wordCount(essential.narrationText) : 0);
    if (selected.length >= (duration === 20 ? 1 : duration === 30 ? 2 : 3)) break;
  }
  if (essential) add(essential.narrationText);
  const rawAmount = positive(fields.priceCents), amount=rawAmount&&Number.isSafeInteger(Math.round(rawAmount*100))?rawAmount:null;
  const rawArea = positive(fields.area),area=rawArea&&rawArea<=100_000?rawArea:null,rawRooms = positive(fields.rooms),rooms=rawRooms&&rawRooms<=100?rawRooms:null;
  const facts = [area ? `Une surface de ${frenchDecimal(area)} mètres carrés.` : '',
    rooms && Number.isInteger(rooms) ? `${frenchInteger(rooms).replace(/un$/, 'une')} ${rooms === 1 ? 'pièce' : 'pièces'}.` : '',
    amount ? `${frenchEuros(Math.round(amount * 100))}${fields.transaction === 'rent' ? ` par mois${fields.charges === 'included' ? ', charges comprises' : fields.charges === 'excluded' ? ', hors charges' : ''}` : ''}.` : ''].filter(Boolean);
  for (const fact of facts) add(fact);
  // Four passages match the existing editable narration contract. Short generic
  // transitions fill only the missing slots, never property characteristics.
  while (selected.length < 2) add(selected.length ? 'Poursuivons la visite.' : 'Découvrez les lieux en images.') || selected.push('La visite en images.');
  const middle = ['', ''];
  selected.forEach((text, index) => {const at = index % 2; middle[at] += (middle[at] ? ' ' : '') + text;});
  const longer=expandedNarrationLines({text:intro,refs:['propertyType','transaction','locality']},{text:ending,refs:['agency.name']},
    [facts.find(f=>f.includes('euros')),...facts.filter(f=>!f.includes('euros'))].filter((text):text is string=>Boolean(text)).map(text=>({text,refs:['photos']})),
    fields.description,narrationWordTarget(duration));
  return longer.length?longer.map(p=>p.text):[intro,...middle,ending];
}
