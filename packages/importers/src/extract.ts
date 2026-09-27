import {ImportFailure,Listing} from '@bienvu/contracts';
type Obj=Record<string,unknown>;
const obj=(v:unknown):Obj=>v!==null&&typeof v==='object'&&!Array.isArray(v)?v as Obj:{};
const list=(v:unknown):unknown[]=>Array.isArray(v)?v:v===undefined?[]:[v];
const types=(v:Obj)=>list(v['@type']).map(String);
const fact=<T>(value:T,sourcePath:string)=>({value,sourcePath,rawEvidence:String(value).slice(0,500),status:'verified' as const});
function number(value:unknown) {if(typeof value==='number')return Number.isFinite(value)&&value>0?value:null;if(typeof value==='string'&&/^\d+(?:[.,]\d+)?$/.test(value.trim()))return Number(value.replace(',','.'));return null;}
export function extractJsonLd(documents:unknown[],sourceUrl:string):Listing {
  const nodes=documents.flatMap(value=>Array.isArray(value)?value:list(obj(value)['@graph']??value)).map(obj);
  const listings=nodes.filter(n=>types(n).includes('RealEstateListing'));
  if(listings.length>1)throw new ImportFailure('CONFLICTING_FACTS','Plusieurs annonces sur cette page.');
  const wrapper=listings[0];
  const embedded=wrapper?obj(wrapper.mainEntity??wrapper.about):{};
  const homes=Object.keys(embedded).length?[embedded]:nodes.filter(n=>types(n).some(t=>['House','Apartment','Residence'].includes(t)));
  if(homes.length!==1)throw new ImportFailure(homes.length?'CONFLICTING_FACTS':'NOT_A_LISTING','Identité du bien non déterminée.');
  const home=homes[0]; const propertyType=types(home).find(t=>['House','Apartment','Residence'].includes(t));
  const title=home.name??wrapper?.name;const address=obj(home.address);const locality=address.addressLocality;
  if(typeof title!=='string'||typeof locality!=='string'||!propertyType)throw new ImportFailure('INCOMPLETE_LISTING','Type, titre ou localisation manquant.');
  const offers=[...list(home.offers),...list(wrapper?.offers)].map(obj);
  const currencies=[...new Set(offers.map(o=>o.priceCurrency).filter(Boolean))];
  const prices=[...new Set(offers.map(o=>number(o.price)).filter(v=>v!==null))];
  if(prices.length>1||currencies.length>1)throw new ImportFailure('CONFLICTING_FACTS','Prix contradictoires.');
  const business=[...new Set(offers.map(o=>String(o.businessFunction??'' )).filter(Boolean))];
  if(business.length>1)throw new ImportFailure('CONFLICTING_FACTS','Transaction contradictoire.');
  const transaction=business[0]?.endsWith('Sell')?'sale':business[0]?.endsWith('LeaseOut')?'rent':'unknown';
  const size=obj(home.floorSize);const area=number(size.value);const areaSupported=['MTK','m²','m2'].includes(String(size.unitCode??size.unitText));
  const imageValues=[...list(home.image),...list(wrapper?.image)].map(v=>typeof v==='string'?v:obj(v).contentUrl??obj(v).url).filter((v):v is string=>typeof v==='string');
  const photoUrls=[...new Set(imageValues.map(v=>{try{return new URL(v,sourceUrl).href;}catch{return '';}}).filter(Boolean))].slice(0,12);
  if(photoUrls.length<3)throw new ImportFailure('INSUFFICIENT_PHOTOS','Moins de trois images liées au bien dans les données structurées.');
  const warnings:string[]=[];
  if(transaction==='unknown')warnings.push('Transaction non vérifiée : prix omis.');
  if(transaction==='rent')warnings.push('Location : unité et charges non implémentées dans la sonde ; prix omis.');
  if(!areaSupported)warnings.push('Surface absente ou unité non vérifiée : omise.');
  return Listing.parse({sourceUrl,fetchedAt:new Date().toISOString(),adapterVersion:'jsonld-probe/1',
    title:fact(title,'mainEntity.name'),propertyType:fact(propertyType,'mainEntity.@type'),locality:fact(locality,'mainEntity.address.addressLocality'),transaction,
    priceCents:transaction==='sale'&&currencies[0]==='EUR'&&prices.length===1?fact(Math.round(prices[0]!*100),'offers.price'):null,
    currency:transaction==='sale'&&currencies[0]==='EUR'&&prices.length===1?'EUR':null,
    areaM2:area!==null&&areaSupported?fact(area,'mainEntity.floorSize'):null,photoUrls,warnings});
}
