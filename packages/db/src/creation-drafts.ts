import {CreationDraftData, CreationDraftView, NormalizedListing, PhotoAsset, emptyCreationFields, type CreationFieldName} from '@bienvu/contracts';
import type {Database} from './index';
import {findImport, type ImportRow} from './imports';

export function draftFromListing(listing:NormalizedListing):CreationDraftData {
  const fields=emptyCreationFields(),provenance:CreationDraftData['provenance']={};
  const put=(key:CreationFieldName,value:CreationDraftData['fields'][CreationFieldName],evidence:string|null)=>{
    if(value===null)return; (fields as Record<string,unknown>)[key]=value;
    provenance[key]={source:listing.sourceKind==='manual'?'user':'import',evidence,confirm:false};
  };
  put('transaction',listing.transaction,null);
  for(const key of ['title','propertyType','locality','area','rooms'] as const){const fact=listing.facts[key];
    if(fact?.status==='verified'||fact?.status==='user_provided')put(key,fact.value,fact.rawEvidence);
  }
  if(listing.facts.price.status==='verified'||listing.facts.price.status==='user_provided'){
    put('priceCents',listing.facts.price.value.amountCents,listing.facts.price.rawEvidence);
    if(listing.transaction==='rent')put('charges',listing.facts.price.value.charges==='not_applicable'?null:listing.facts.price.value.charges,listing.facts.price.rawEvidence);
  }
  if(listing.description)put('description',listing.description.text,null);
  return CreationDraftData.parse({fields,provenance,originalText:null,canonicalUrl:listing.canonicalUrl,warnings:listing.warnings});
}
export function blankCreationDraft(originalText:string|null=null):CreationDraftData {
  const fields=emptyCreationFields();fields.description=originalText;
  return CreationDraftData.parse({fields,provenance:originalText?{description:{source:'user',evidence:null,confirm:false}}:{},
    originalText,canonicalUrl:null,warnings:[]});
}
export async function startCreationDraft(db:Database,agencyId:string,id:string,data:CreationDraftData,now=Date.now()) {
  const at=new Date(now).toISOString();
  await db.prepare(`INSERT INTO creation_drafts(id,agency_id,data_json,created_at,updated_at) VALUES(?,?,?,?,?) ON CONFLICT(id) DO NOTHING`)
    .bind(id,agencyId,JSON.stringify(CreationDraftData.parse(data)),at,at).run();
  return findCreationDraft(db,agencyId,id);
}
export function viewCreationDraft(row:ImportRow):CreationDraftView|null {
  if(row.status!=='importing'||row.draftPending!==1||!row.draftData||!row.draftVersion)return null;
  return CreationDraftView.parse({id:row.id,version:row.draftVersion,status:'needs_input',sourceKind:row.sourceKind,
    sourceUrl:row.sourceUrl,expiresAt:row.expiresAt,data:JSON.parse(row.draftData),photos:PhotoAsset.array().parse(JSON.parse(row.draftPhotos??'[]'))});
}
export async function findCreationDraft(db:Database,agencyId:string,id:string){
  const row=await findImport(db,agencyId,id);return row?viewCreationDraft(row):null;
}
export async function updateCreationDraft(db:Database,agencyId:string,id:string,version:number,data:CreationDraftData){
  const row=await db.prepare(`UPDATE creation_drafts SET version=version+1,data_json=?,updated_at=?
    WHERE id=? AND agency_id=? AND version=? AND state='needs_input' AND EXISTS
    (SELECT 1 FROM listing_imports WHERE id=? AND agency_id=? AND status='importing' AND expires_at>?) RETURNING version`)
    .bind(JSON.stringify(CreationDraftData.parse(data)),new Date().toISOString(),id,agencyId,version,id,agencyId,new Date().toISOString())
    .first<{version:number}>();return row?.version??null;
}

export async function markCreationDraftDeleting(db:Database,agencyId:string,id:string,now=Date.now()){
  // A draft has no transport lease to wait for. Keep its journal for the existing
  // five-minute reconciliation window so an interrupted R2 put can still be purged.
  const row=await db.prepare(`UPDATE listing_imports SET status='deleting',
    lease_until=CASE WHEN status='importing' THEN ? ELSE lease_until END
    WHERE agency_id=? AND id=? AND draft_pending=1 AND status IN ('importing','deleting')
    AND EXISTS(SELECT 1 FROM creation_drafts WHERE id=? AND agency_id=? AND state='needs_input')
    AND NOT EXISTS(SELECT 1 FROM jobs WHERE agency_id=? AND listing_id=?) RETURNING id`)
    .bind(new Date(now).toISOString(),agencyId,id,id,agencyId,agencyId,id).first();
  return Boolean(row);
}
