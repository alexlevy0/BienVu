import {z} from 'zod';
import type {NormalizedListing} from './product';
import type {PreparedNarration} from './narration';

export const AI_QUALITY_VERSION='bienvu-quality/1';
export const QualityVerdict=z.enum(['problem','false_positive','intentional','accepted']);
export type QualityVerdict=z.infer<typeof QualityVerdict>;
export const AiQualitySettings=z.object({enabled:z.boolean(),retentionDays:z.number().int().min(7).max(365),reviewSamplePercent:z.number().int().min(0).max(100)}).strict();
export type AiQualitySettings=z.infer<typeof AiQualitySettings>;
export const DEFAULT_AI_QUALITY_SETTINGS:AiQualitySettings={enabled:true,retentionDays:90,reviewSamplePercent:10};
export type QualityCheck={key:string;label:string;status:'pass'|'fail'|'na'|'error'|'pending';reason:string;value?:number};
export type QualityFacts={transaction:string;propertyType:unknown;locality:unknown;price:unknown;area:unknown;rooms:unknown};
export function qualityFacts(listing:NormalizedListing):QualityFacts {
  const value=(fact:{status:string;value:unknown}|undefined)=>fact&&['verified','user_provided'].includes(fact.status)?fact.value:null;
  return {transaction:listing.transaction,propertyType:value(listing.facts.propertyType),locality:value(listing.facts.locality),
    price:value(listing.facts.price),area:value(listing.facts.area),rooms:value(listing.facts.rooms)};
}
const number=(s:string)=>Number(s.replace(/[\s\u00a0\u202f]/g,'').replace(',','.'));
export function factualNarrationChecks(facts:QualityFacts,text:string):QualityCheck[] {
  const result:QualityCheck[]=[],add=(key:string,label:string,bad:boolean,applicable:boolean,reason:string)=>result.push({key,label,status:applicable?(bad?'fail':'pass'):'na',reason:applicable?reason:'Aucune mention à comparer.'});
  const prices=[...text.matchAll(/(?<![\p{L}\d.,])(\d+(?:[ \u00a0\u202f]\d{3})*(?:[,.]\d+)?)\s*(k|m|millions?)?\s*(?:€|euros?)(?![\p{L}])/giu)]
    .map(m=>Math.round(number(m[1])*(m[2]?.toLowerCase()==='k'?1000:m[2]?1e6:1)*100));
  const price=facts.price as {amountCents?:number;period?:string}|null;
  add('price','Prix annoncé',prices.some(p=>p!==price?.amountCents),prices.length>0,'Les montants prononcés doivent correspondre au prix confirmé. Une autre somme nécessite une relecture.');
  const areas=[...text.matchAll(/\b(\d+(?:[,.]\d+)?)\s*(?:m²|m2|mètres? carrés?)/giu)].map(m=>number(m[1]));
  add('area','Surface annoncée',areas.some(a=>a!==facts.area),areas.length>0,'Comparer la surface prononcée à celle confirmée ; une surface annexe peut nécessiter une relecture.');
  const rooms=[...text.matchAll(/\b(\d+)\s*pi[eè]ces?\b/giu)].map(m=>Number(m[1]));
  add('rooms','Nombre de pièces',rooms.some(r=>r!==facts.rooms),rooms.length>0,'Les chambres ne sont pas comptées comme des pièces.');
  const rent=/(?:^|\s)(?:loyer|à louer|par mois|mensuel)\b/iu.test(text),sale=/(?:^|\s)(?:à vendre|prix de vente|en vente)\b/iu.test(text);
  add('transaction','Vente ou location',facts.transaction==='sale'?rent:sale,rent||sale,'Le type de transaction doit correspondre aux informations confirmées.');
  return result;
}
export function qualificationChecks(source:string,text:string):QualityCheck {
  const normalized=(value:string)=>value.toLocaleLowerCase('fr').normalize('NFD').replace(/\p{M}/gu,'');
  const a=normalized(source),b=normalized(text),problems:string[]=[];
  for(const item of ['garage','parking','stationnement']){
    const optional=new RegExp(`\\b${item}\\b[^.!?]{0,50}(?:en supplement|en option|non inclus)|(?:en supplement|en option)[^.!?]{0,25}\\b${item}\\b`);
    const mentioned=new RegExp(`\\b${item}\\b`),qualified=new RegExp(`\\b${item}\\b[^.!?]{0,50}(?:supplement|option|non inclus|en plus)|(?:supplement|option|non inclus|en plus)[^.!?]{0,25}\\b${item}\\b`);
    if(optional.test(a)&&mentioned.test(b)&&!qualified.test(b))problems.push(`${item} proposé sous condition dans la source`);
  }
  for(const item of ['ascenseur','garage','piscine','balcon','terrasse']){
    const denied=new RegExp(`\\b(?:sans|aucun|pas d[e’'])\\s*${item}\\b`),affirmed=new RegExp(`\\b(?:avec|dispose d[e’'])\\s*(?:un[e]?\\s+)?${item}\\b`);
    if(denied.test(a)&&affirmed.test(b))problems.push(`contradiction sur ${item}`);
  }
  return {key:'qualifications',label:'Conditions explicites',status:problems.length?'fail':source?'pass':'na',reason:problems.length?problems.join(' ; ')+'. À confirmer par une relecture.':'Repérage limité aux suppléments et négations explicites. Les autres nuances demandent une relecture humaine.'};
}
export function narrationQualityChecks(listing:NormalizedListing,narration:PreparedNarration|null):QualityCheck[] {
  const facts=qualityFacts(listing),checks:QualityCheck[]=[{key:'facts',label:'Informations confirmées',status:Object.values(listing.facts).some(f=>f.status==='conflicting')?'fail':'pass',reason:'Contrôles sur les informations figées au départ de cette génération.'}];
  if(!narration)return [...checks,{key:'narration',label:'Narration finale',status:'na',reason:'La narration n’a pas été préparée.'}];
  const text=narration.script.scenes.map(s=>s.narrationText).join(' '),voice=narration.voiceEnabled!==false;
  checks.push(...factualNarrationChecks(facts,text));
  checks.push(qualificationChecks(listing.description?.text??'',text));
  checks.push({key:'narration',label:'Narration finale',status:text.trim()?'pass':'fail',reason:'Texte compilé et ajusté après mesure audio.'});
  const clipped=narration.audio.some((a,i)=>a.durationMs>narration.durationFrames[i]*1000/30+1),audioMs=narration.audio.reduce((n,a)=>n+a.durationMs,0),videoMs=narration.durationFrames.reduce((n,f)=>n+f,0)*1000/30;
  checks.push({key:'timing',label:'Voix complète',status:voice?(clipped?'fail':'pass'):'na',reason:voice?'Chaque piste doit tenir dans sa scène, sans coupure.':'Voix désactivée.',value:audioMs});
  checks.push({key:'silence',label:'Temps sans voix',status:voice?(videoMs-audioMs>Math.max(5000,videoMs*.3)?'fail':'pass'):'na',reason:voice?'Plus de 30 % de temps sans voix (minimum 5 s) appelle une écoute ; ce n’est pas une erreur certaine.':'Voix désactivée.',value:Math.max(0,videoMs-audioMs)});
  checks.push({key:'audio',label:'Niveau sonore',status:voice?(narration.audio.some(a=>a.rmsDbfs< -45)?'fail':'pass'):'na',reason:voice?'Le niveau RMS mesuré doit rester audible. La prononciation demande une écoute humaine.':'Voix désactivée.'});
  const seen=new Set<string>(),repeated=narration.script.scenes.some(s=>{const t=s.narrationText.trim().toLocaleLowerCase('fr');const duplicate=seen.has(t);seen.add(t);return duplicate;});
  checks.push({key:'repetition',label:'Paragraphes distincts',status:repeated?'fail':'pass',reason:'Repérage des paragraphes strictement répétés ; le style est évalué séparément.'});
  return checks;
}
// Stable sampling: retries and concurrent workers never pick a different cohort.
export function qualitySample(id:string,percent:number){let hash=2166136261;for(const c of id)hash=Math.imul(hash^c.charCodeAt(0),16777619);return (hash>>>0)%10000<percent*100;}
export function qualityCoverage(checks:QualityCheck[]){const assessed=checks.filter(c=>['pass','fail'].includes(c.status));return {assessed:assessed.length,passed:assessed.filter(c=>c.status==='pass').length,failed:assessed.filter(c=>c.status==='fail').length,na:checks.filter(c=>c.status==='na').length,errors:checks.filter(c=>c.status==='error').length,pending:checks.filter(c=>c.status==='pending').length};}
export type AiQualityRun={id:string;jobId:string;agencyId:string;attempt:number;title:string;createdAt:string;completedAt:string;status:string;
  audience:string;sourceHost:string|null;durationSeconds:number|null;voice:string|null;model:string|null;promptVersion:string|null;
  traceId:string;checks:QualityCheck[];reviewSampled:boolean;review:QualityVerdict|null;flagged:boolean;costEstimatedUsd:number|null;costActualUsd:number|null;costReconciledEur?:number|null;costActualEur?:number|null};
