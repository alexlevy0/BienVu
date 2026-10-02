import type {VideoDuration} from '@bienvu/contracts';
import {frenchDecimal, frenchEuros, frenchInteger} from './french';

export const narrationWordLimit = (duration: VideoDuration = 20) => ({20: 40, 30: 60, 40: 75})[duration];
export const wordCount = (text: string) => text.trim().split(/\s+/u).filter(Boolean).length;
export type DescriptionPassage = {text: string; narrationText: string; condition: boolean; score: number};
const administrative = /(?:RSAC|RNE|SIRE[NT]|immatricul|agent commercial|registre|honoraires|géorisques|diagnostic|DPE|copropriété|charges annuelles|consommation énergétique|estimation des coûts|référence annonce|nos agences|nous contacter|contactez|exclusivité chez|en exclusivité)/iu;
const instructions = /(?:ignore[rz]?|instructions?|prompt|système|system|assistant|invente[rz]?|http[s]?:|www\.|@|clé api|token|<|>)/iu;
const condition = /(?:rafra[iî]chissement|r[eé]novation|travaux|r[eé]nover|rafra[iî]chir).{0,35}(?:pr[eé]voir|n[eé]cessaire|requi|à faire)|(?:à r[eé]nover|à rafra[iî]chir)/iu;

// Extractive catalogue: every property assertion retains its complete source
// clause, including negatives, future tense and supplements. No arbitrary word
// truncation, and no free assertion authored by the model.
export function descriptionPassages(description: string): DescriptionPassage[] {
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
      if (count < 3 || count > 28 || text.length > 165) continue;
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

export type SuggestedListing = {propertyType: string; transaction: string; locality: string; description: string;
  priceCents: string; area: string; rooms: string; charges?: string};
const positive = (value: string) => {const n = Number(value.replace(/\s/g, '').replace(',', '.')); return Number.isFinite(n) && n > 0 ? n : null;};

// Free, local draft suggestion. Generated automatically until the owner edits
// it; final automatic selection is made from the same source clauses on server.
export function suggestedNarration(fields: SuggestedListing, agency: string, duration: VideoDuration = 20): string[] {
  const property = fields.propertyType === 'house' ? 'cette maison' : fields.propertyType === 'apartment' ? 'cet appartement' : 'ce bien';
  const intro = `${fields.transaction === 'rent' ? 'À louer' : 'À vendre'}, ${property}${fields.locality ? ` à ${fields.locality}` : ''}.`;
  const ending = agency ? `Contactez ${agency}.` : 'Découvrez cette annonce.';
  const limit = narrationWordLimit(duration), available = limit - wordCount(intro + ' ' + ending);
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
  return [intro, ...middle, ending];
}
