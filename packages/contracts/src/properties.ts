import {z} from 'zod';
import {ManualListingInput,MANUAL_PHOTO_LIMITS} from './manual-listing';
import type {CreationFields} from './creation-draft';
import type {GenerationView} from './generation';

export type PropertyPhoto = {id:string;url:string;width:number;height:number};
export type PropertySummary = {
  id:string;title:string;reference:string;fields:CreationFields;archived:boolean;createdAt:string;updatedAt:string;
  coverUrl:string|null;thumbnails:PropertyPhoto[];photoCount:number;videoCount:number;draftCount:number;
  visualCount:number;textCount:number;attentionCount:number;projectId:string|null;
};
export type PropertyPublication = {id:string;jobId:string;scheduledAt:string;caption:string;
  targets:{platform:string;name:string;status:string;permalink:string|null}[]};
export type PropertyDetail = {property:PropertySummary;photos:PropertyPhoto[];
  drafts:{id:string;title:string;editor:boolean}[];jobs:GenerationView[];nextCursor:string|null;
  shares:{id:string;jobId:string}[];caption:string;publications:PropertyPublication[]};
// Saving a property does not launch a video. The three-photo requirement still
// applies to generation, while the agency can save a partially photographed bien.
export const PropertyListingInput=ManualListingInput.safeExtend({photos:z.array(ManualListingInput.shape.photos.element).max(MANUAL_PHOTO_LIMITS.maximum)});
export const propertyFacts = (fields:CreationFields) => [fields.locality,fields.area?`${fields.area.toLocaleString('fr-FR')} m²`:null,
  fields.rooms?`${fields.rooms} pièce${fields.rooms>1?'s':''}`:null].filter(Boolean).join(' · ');
export function propertyPrice(fields:CreationFields){return fields.priceCents===null?'':
  `${(fields.priceCents/100).toLocaleString('fr-FR',{maximumFractionDigits:2})} €${fields.transaction==='rent'?' / mois':''}`;}
export function propertyCaption(fields:CreationFields,agency='votre agence'){
  const title=fields.title?.trim()||'Un nouveau bien à découvrir',facts=propertyFacts(fields),price=propertyPrice(fields);
  return [title+(fields.transaction==='rent'?' · À louer':fields.transaction==='sale'?' · À vendre':''),facts,price,
    fields.description?.trim().slice(0,1500),`Contactez ${agency} pour une visite.`].filter(Boolean).join('\n\n').slice(0,2200);
}
