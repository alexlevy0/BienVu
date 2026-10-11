import {cache} from 'react';
import {getCloudflareContext} from '@opennextjs/cloudflare';
import {notFound} from 'next/navigation';
import {resolvePublicShowcase,showcaseView,publicShowcaseProperty} from './showcases';
import {RequestFailure} from './http';
import {absoluteUrl,seoMetadata,showcaseSchemaImage} from './showcase-seo';
export type ShowcaseSearch=Record<string,string|string[]|undefined>;
export function showcaseQuery(search:ShowcaseSearch){return new URLSearchParams(Object.entries(search).flatMap(([key,value])=>typeof value==='string'?[[key,value]]:[]));}
export const readShowcasePage=cache(async(slug:string,query='')=>{const{env}=await getCloudflareContext({async:true});try{
  const row=await resolvePublicShowcase(env,slug);let data;try{data=await showcaseView(env,row,new URLSearchParams(query));}catch(error){if(error instanceof RequestFailure&&error.code==='VALIDATION_ERROR')data=await showcaseView(env,row);else throw error;}return{row,data,env};
}catch(error){if(error instanceof RequestFailure&&error.code==='NOT_FOUND')notFound();throw error;}});
export const readShowcasePropertyPage=cache(async(slug:string,id:string)=>{const base=await readShowcasePage(slug);try{return{...base,property:await publicShowcaseProperty(base.env,base.row,id)};}catch(error){if(error instanceof RequestFailure&&error.code==='NOT_FOUND')notFound();throw error;}});
export function agencyShowcaseMetadata(data:Awaited<ReturnType<typeof readShowcasePage>>['data'],filtered=false){const c=data.config;return seoMetadata({title:`${c.name}${c.city?` — Immobilier à ${c.city}`:''}`,description:(c.description||`Découvrez les biens à vendre et à louer de ${c.name}${c.city?` à ${c.city}`:''}. Photos, vidéos et contact direct avec l’agence.`).slice(0,170),path:`/agences/${c.slug}`,image:showcaseSchemaImage(data),noindex:filtered});}
export function agencySchema(data:Awaited<ReturnType<typeof readShowcasePage>>['data']){const c=data.config;return{'@context':'https://schema.org','@type':'RealEstateAgent',name:c.name,url:absoluteUrl(`/agences/${c.slug}`),description:c.description||undefined,
  image:absoluteUrl(showcaseSchemaImage(data)),telephone:c.phone??undefined,email:c.email??undefined,address:c.showAddress&&c.address?c.address:undefined,areaServed:c.sectors.length?c.sectors:c.city||undefined,sameAs:[c.website,...Object.values(c.socials)].filter(Boolean)};}
