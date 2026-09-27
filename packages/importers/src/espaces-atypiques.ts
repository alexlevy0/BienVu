import {ImportFailure,Listing} from '@bienvu/contracts';
export type AgencySnapshot={title:string;canonical:string;data:Record<string,unknown>[];gallery:string[];summary:string};
export function extractAgency(s:AgencySnapshot,url:string):Listing {
  const u=new URL(url);if(u.hostname!=='www.espaces-atypiques.com'||!u.pathname.startsWith('/ventes/'))throw new ImportFailure('NOT_A_LISTING','Source non couverte par cet adaptateur.');
  if(s.canonical!==url)throw new ImportFailure('CONFLICTING_FACTS','Identité canonique différente du lien visité.');
  const facts=s.data.filter(x=>typeof x.reference==='string'&&typeof x.type_de_bien==='string');
  if(facts.length!==1)throw new ImportFailure('CONFLICTING_FACTS','Identité embarquée ambiguë.');
  const d=facts[0];const reference=String(d.reference);
  if(!u.pathname.endsWith(`-${reference}/`))throw new ImportFailure('CONFLICTING_FACTS','Référence différente entre page et données.');
  if(d.status!=='envente')throw new ImportFailure('SOURCE_UNAVAILABLE','Annonce non en vente.');
  const type=d.type_de_bien==='Appartement'?'Apartment':d.type_de_bien==='Maison'?'House':null;
  if(!type||typeof d.ville!=='string'||!s.title)throw new ImportFailure('INCOMPLETE_LISTING','Faits essentiels absents.');
  const paths=s.gallery.filter(p=>{try{return new URL(p).hostname===u.hostname&&new URL(p).pathname.includes(`/${reference}/`);}catch{return false;}});
  const photoUrls=[...new Set(paths)].slice(0,12);
  if(photoUrls.length<3)throw new ImportFailure('INSUFFICIENT_PHOTOS','Galerie du bien insuffisante.');
  const rawPrice=String(d.prix_vente??'');const price=Number(rawPrice);
  const displayed=[...s.summary.matchAll(/([\d\s\u00a0\u202f]+)\s*€/g)].map(m=>Number(m[1].replace(/\s/g,'')));
  if(displayed.some(n=>n!==price))throw new ImportFailure('CONFLICTING_FACTS','Prix affiché et embarqué contradictoires.');
  const f=<T>(value:T,sourcePath:string)=>({value,sourcePath,rawEvidence:String(value).slice(0,500),status:'verified' as const});
  return Listing.parse({sourceUrl:url,fetchedAt:new Date().toISOString(),adapterVersion:'espaces-atypiques-probe/1',
    title:f(s.title,'article.vente h1.annonce-title'),propertyType:f(type,'dataLayer.type_de_bien'),locality:f(d.ville,'dataLayer.ville'),transaction:'sale',
    priceCents:/^\d+$/.test(rawPrice)&&price>0&&displayed.includes(price)?f(price*100,'dataLayer.prix_vente + article .info-resume'):null,
    currency:displayed.includes(price)?'EUR':null,areaM2:null,photoUrls,
    warnings:['Surface omise : surfaces pondérée, au sol et Carrez à distinguer avant usage produit.','Extraction technique privée ; droits de réutilisation des photos non établis.']});
}
