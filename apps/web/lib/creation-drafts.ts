import {VideoCustomization,CreationDraftData, CreationFields, GeneratableListing, ManualListingInput, NormalizedListing, PhotoAsset,
  type CreationFieldName, type CreationDraftView, type NormalizedListing as Listing} from '@bienvu/contracts';
import {beginManualImport, completeImport, findImport, findCreationDraft, startCreationDraft, blankCreationDraft,markCreationDraftDeleting,importObjectKeys,
  draftFromListing,updateCreationDraft, ImportStateFailure, type ImportRow, type Database} from '@bienvu/db';
import {contentHash, type PhotoNormalizer} from './manual-listings';
import {RequestFailure} from './http';
import {logDiagnostic,requestContext} from '@bienvu/observability';

type Env={DB:Database;MEDIA:Pick<R2Bucket,'put'|'head'|'delete'>};
function required(row:ImportRow|null):CreationDraftView {
  if(!row||row.status!=='importing'||!row.draftPending||row.expiresAt<=new Date().toISOString())throw new RequestFailure('NOT_FOUND');
  const data=CreationDraftData.parse(JSON.parse(row.draftData!));
  return {id:row.id,version:row.draftVersion!,status:'needs_input',sourceKind:row.sourceKind,sourceUrl:row.sourceUrl,
    expiresAt:row.expiresAt,data,photos:PhotoAsset.array().parse(JSON.parse(row.draftPhotos??'[]'))};
}
export async function startManualCreationDraft(db:Database,agencyId:string,key:string,originalText:string|null=null){
  const sourceHash=originalText?await contentHash(new TextEncoder().encode(originalText)):null;
  const input=JSON.stringify({draft:1,sourceHash});
  try {const started=await beginManualImport(db,agencyId,key,input,await contentHash(new TextEncoder().encode(input)));
    if(started.row.status==='ready')throw new RequestFailure('CONFLICT');
    await startCreationDraft(db,agencyId,started.row.id,blankCreationDraft(originalText));
    return required(await findImport(db,agencyId,started.row.id));
  }catch(error){if(error instanceof ImportStateFailure)throw new RequestFailure(error.code);throw error;}
}
export async function patchCreationDraft(db:Database,agencyId:string,id:string,body:unknown){
  if(!body||typeof body!=='object'||Array.isArray(body))throw new RequestFailure('VALIDATION_ERROR');
  const input=body as {version?:unknown;changes?:unknown;confirm?:unknown;videoCustomization?:unknown};
  if(!Number.isSafeInteger(input.version)||!input.changes||typeof input.changes!=='object'||Array.isArray(input.changes)||
    !Array.isArray(input.confirm))throw new RequestFailure('VALIDATION_ERROR');
  const before=required(await findImport(db,agencyId,id));
  if(before.version!==input.version)throw new RequestFailure('CONFLICT');
  const changes=input.changes as Record<string,unknown>;
  if(Object.keys(changes).some(key=>!(key in before.data.fields))||input.confirm.some(key=>!(key in before.data.fields)))
    throw new RequestFailure('VALIDATION_ERROR');
  const fields=CreationFields.safeParse({...before.data.fields,...changes});if(!fields.success)throw new RequestFailure('VALIDATION_ERROR');
  const provenance={...before.data.provenance};
  for(const key of Object.keys(changes) as CreationFieldName[])if(before.data.fields[key]!==fields.data[key])
    provenance[key]={source:'user',evidence:null,confirm:false};
  for(const key of input.confirm as CreationFieldName[])if(provenance[key]&&fields.data[key]!==null)
    provenance[key]={...provenance[key],confirm:false};
  if('transaction' in changes&&before.data.fields.transaction!==fields.data.transaction){
    // A sale price is never silently turned into monthly rent or vice versa.
    if(!('priceCents' in changes)){fields.data.priceCents=null;delete provenance.priceCents;}
    if(!('charges' in changes)){fields.data.charges=null;delete provenance.charges;}
  }
  const settings=input.videoCustomization===undefined?undefined:VideoCustomization.safeParse(input.videoCustomization);
  if(settings&&!settings.success)throw new RequestFailure('VALIDATION_ERROR');
  const data=CreationDraftData.parse({...before.data,fields:fields.data,provenance,
    ...(settings?.success?{videoCustomization:settings.data}:{})});
  if(await updateCreationDraft(db,agencyId,id,before.version,data)===null)throw new RequestFailure('CONFLICT');
  return required(await findImport(db,agencyId,id));
}
// A private editable copy retains the original import and any jobs referencing
// it. Replay uses deterministic upload IDs; no scraping or video credit occurs.
export async function customizeImportedListing(env:Env&{MEDIA:Env['MEDIA']&Pick<R2Bucket,'get'>},agencyId:string,id:string,key:string,signal:AbortSignal){
  const source=await findImport(env.DB,agencyId,id);
  if(source?.draftPending)return required(source);
  if(!source||source.status!=='ready'||!source.result||source.expiresAt<=new Date().toISOString())throw new RequestFailure('NOT_FOUND');
  const listing=GeneratableListing.parse(JSON.parse(source.result));
  if(listing.agencyId!==agencyId||listing.id!==id)throw new RequestFailure('NOT_FOUND');
  const input=JSON.stringify({customize:id}),hash=await contentHash(new TextEncoder().encode(input));
  let row:ImportRow;
  try{row=(await beginManualImport(env.DB,agencyId,key,input,hash)).row;}
  catch(error){if(error instanceof ImportStateFailure)throw new RequestFailure(error.code);throw error;}
  if(row.status==='ready')throw new RequestFailure('CONFLICT');
  await startCreationDraft(env.DB,agencyId,row.id,draftFromListing(listing));
  const copy=async(photo:typeof listing.photos[number])=>{
    signal.throwIfAborted();
    if(!photo.objectKey.startsWith(`agencies/${agencyId}/imports/${id}/`))throw new RequestFailure('NOT_FOUND');
    const object=await env.MEDIA.get(photo.objectKey);
    if(!object||object.size!==photo.sizeBytes)throw new RequestFailure('INSUFFICIENT_PHOTOS');
    const bytes=new Uint8Array(await object.arrayBuffer());
    if(await contentHash(bytes)!==photo.contentHash)throw new RequestFailure('INSUFFICIENT_PHOTOS');
    const uploadId=(await contentHash(new TextEncoder().encode(`${row.id}:${photo.id}`))).slice(0,32);
    await uploadCreationPhoto(env,agencyId,row.id,photo.sourceOrder,uploadId,bytes,photo.mime,
      async()=>({bytes,width:photo.width,height:photo.height,mime:photo.mime}),signal);
  };
  // Two independent, journaled photos at a time. Await both even when one
  // fails, so a cancelled request cannot leave untracked background writes.
  for(let offset=0;offset<listing.photos.length;offset+=2){
    const copied=await Promise.allSettled(listing.photos.slice(offset,offset+2).map(copy));
    const failure=copied.find(result=>result.status==='rejected');
    if(failure?.status==='rejected')throw failure.reason;
  }
  return required(await findImport(env.DB,agencyId,row.id));
}
export async function deleteCreationDraft(env:Env,agencyId:string,id:string,now=Date.now()){
  if(!await findImport(env.DB,agencyId,id))throw new RequestFailure('NOT_FOUND');
  if(!await markCreationDraftDeleting(env.DB,agencyId,id,now))throw new RequestFailure('CONFLICT');
  const keys=await importObjectKeys(env.DB,agencyId,id);
  if(keys.some(key=>!key.startsWith(`agencies/${agencyId}/imports/${id}/`)))throw new Error('IMPORT_KEY_SCOPE');
  try{if(keys.length)await env.MEDIA.delete(keys);}
  catch{logDiagnostic(requestContext(),{event:'request_failed',status:503,code:'INTERNAL_ERROR'});}
  // Logical deletion is committed. The cron retries cleanup after in-flight puts
  // have stopped, including when the immediate R2 deletion was unavailable.
}
function photoList(row:ImportRow){return PhotoAsset.array().parse(JSON.parse(row.draftPhotos??'[]')).sort((a,b)=>a.sourceOrder-b.sourceOrder);}
export async function uploadCreationPhoto(env:Env,agencyId:string,id:string,index:number,uploadId:string,
  bytes:Uint8Array<ArrayBuffer>,mime:string,normalize:PhotoNormalizer,signal:AbortSignal){
  if(!Number.isInteger(index)||index<0||index>11||!/^[-a-zA-Z0-9_]{16,64}$/.test(uploadId)||
    !['image/jpeg','image/png','image/webp'].includes(mime)||!bytes.length||bytes.length>10*1024*1024)throw new RequestFailure('INVALID_PHOTO');
  const row=await findImport(env.DB,agencyId,id);required(row);
  if(await env.DB.prepare('SELECT id FROM creation_upload_cancellations WHERE id=? AND agency_id=? AND import_id=?')
    .bind(uploadId,agencyId,id).first())throw new RequestFailure('CONFLICT');
  const saved=photoList(row!);const existing=saved.find(photo=>photo.id===uploadId);
  if(existing){const head=await env.MEDIA.head(existing.objectKey);if(head?.size===existing.sizeBytes&&head.customMetadata?.sha256===existing.contentHash)return existing;}
  if(saved.some(photo=>photo.sourceOrder===index&&photo.id!==uploadId)||saved.length>=12&&!existing)throw new RequestFailure('CONFLICT');
  const normalized=await normalize(bytes,mime,signal);
  if(normalized.mime!=='image/jpeg'||normalized.width<640||normalized.height<360||normalized.width>2048||normalized.height>2048||
    normalized.bytes.length>10*1024*1024||normalized.bytes[0]!==255||normalized.bytes[1]!==216||normalized.bytes.at(-2)!==255||normalized.bytes.at(-1)!==217)
    throw new RequestFailure('INVALID_PHOTO');
  const hash=await contentHash(normalized.bytes);
  if(saved.some(photo=>photo.contentHash===hash&&photo.id!==uploadId))throw new RequestFailure('DUPLICATE_PHOTO');
  const photo=PhotoAsset.parse({id:uploadId,agencyId,listingId:id,sourceUrl:null,sourceOrder:index,
    // Include the upload ID so a late cancelled put cannot delete a replacement
    // that happens to have the same normalized bytes.
    objectKey:`agencies/${agencyId}/imports/${id}/${uploadId}-${hash}.jpg`,contentHash:hash,width:normalized.width,height:normalized.height,
    mime:'image/jpeg',sizeBytes:normalized.bytes.length});
  const inserted=await env.DB.prepare(`INSERT INTO import_objects(id,agency_id,import_id,object_key,photo_json)
    SELECT ?,?,?,?,? WHERE EXISTS(SELECT 1 FROM creation_drafts WHERE id=? AND agency_id=? AND state='needs_input')
    AND NOT EXISTS(SELECT 1 FROM creation_upload_cancellations WHERE id=? AND agency_id=? AND import_id=?)
    ON CONFLICT(id) DO NOTHING RETURNING id`)
    .bind(uploadId,agencyId,id,photo.objectKey,JSON.stringify(photo),id,agencyId,uploadId,agencyId,id).first();
  if(!inserted&&!existing)throw new RequestFailure('CONFLICT');
  const current=photoList((await findImport(env.DB,agencyId,id))!).find(item=>item.id===uploadId);
  if(!current||JSON.stringify(current)!==JSON.stringify(photo))throw new RequestFailure('CONFLICT');
  await env.MEDIA.put(photo.objectKey,normalized.bytes,{httpMetadata:{contentType:'image/jpeg',cacheControl:'private, no-store'},
    customMetadata:{agencyId,importId:id,sha256:hash}});
  const cancelled=await env.DB.prepare('SELECT id FROM creation_upload_cancellations WHERE id=? AND agency_id=? AND import_id=?')
    .bind(uploadId,agencyId,id).first();
  const afterPut=await findImport(env.DB,agencyId,id);
  if(cancelled||afterPut?.status!=='importing'||!afterPut.draftPending){
    await env.MEDIA.delete(photo.objectKey);throw new RequestFailure('CONFLICT');}
  return photo;
}
export async function removeCreationPhoto(env:Env,agencyId:string,id:string,uploadId:string){
  required(await findImport(env.DB,agencyId,id));
  await env.DB.prepare(`INSERT INTO creation_upload_cancellations(id,agency_id,import_id,created_at) VALUES(?,?,?,?) ON CONFLICT(id) DO NOTHING`)
    .bind(uploadId,agencyId,id,new Date().toISOString()).run();
  const photo=photoList((await findImport(env.DB,agencyId,id))!).find(item=>item.id===uploadId);
  // Retain the journal if R2 fails so a retry (or the draft cleanup) still knows
  // which object to delete. The tombstone already prevents late/replayed PUTs.
  if(photo){await env.MEDIA.delete(photo.objectKey);
    await env.DB.prepare('DELETE FROM import_objects WHERE id=? AND agency_id=? AND import_id=?').bind(uploadId,agencyId,id).run();}
}
const fact=<T,U extends string>(value:T|null,unit:U,source:'import'|'ai'|'user'|undefined,evidence:string|null)=>value===null
  ? {status:'missing' as const,value:null,unit,sourcePath:null,rawEvidence:null}
  : {status:source==='import'?'verified' as const:'user_provided' as const,value,unit,sourcePath:source==='import'?'import.resume':'manual.confirmed',
    rawEvidence:(evidence??String(value)).slice(0,500)};
export async function finishCreationDraft(env:Env,agencyId:string,id:string,expectedVersion:number){
  const row=await findImport(env.DB,agencyId,id);if(row?.status==='ready')return row;
  const draft=required(row),data=draft.data,fields=data.fields;
  if(draft.version!==expectedVersion)throw new RequestFailure('CONFLICT');
  if(Object.entries(data.provenance).some(([key,value])=>value?.confirm&&fields[key as CreationFieldName]!==null))throw new RequestFailure('VALIDATION_ERROR');
  const photos=draft.photos.sort((a,b)=>a.sourceOrder-b.sourceOrder);
  const manifest=photos.map(p=>({hash:p.contentHash,size:p.sizeBytes,mime:p.mime}));
  const input=ManualListingInput.safeParse({...fields,description:fields.description??'',photos:manifest});
  if(!input.success)throw new RequestFailure('VALIDATION_ERROR',Object.fromEntries(input.error.issues.map(issue=>[String(issue.path[0]),issue.message])));
  for(const [index,photo] of photos.entries()){const head=await env.MEDIA.head(photo.objectKey);
    if(!head||head.size!==photo.sizeBytes||head.customMetadata?.sha256!==photo.contentHash)
      throw new RequestFailure('INSUFFICIENT_PHOTOS',{photos:`La photo ${index+1} n’est plus disponible. Retirez-la puis ajoutez-la à nouveau.`});}
  const source=(key:CreationFieldName)=>{
    const value=data.provenance[key];
    // The copied import evidence stays visible in the draft. Its completed
    // manual listing is confirmed by the user, as required by that contract.
    return value&&row!.sourceKind==='manual'&&value.source==='import'?{...value,source:'user' as const}:value;
  };
  const listing:Listing=NormalizedListing.parse({id,agencyId,sourceKind:row!.sourceKind,sourceUrl:row!.sourceUrl,
    canonicalUrl:row!.sourceUrl?data.canonicalUrl??row!.sourceUrl:null,sourceHost:row!.sourceUrl?new URL(row!.sourceUrl).hostname:null,
    sourceListingId:null,fetchedAt:row!.createdAt,adapterVersion:'creation-draft/1',transaction:input.data.transaction,
    description:input.data.description?{text:input.data.description,sourcePath:source('description')?.source==='import'?'import.description':'manual.description',truncated:false}:null,
    facts:{title:fact(input.data.title,'text',source('title')?.source,source('title')?.evidence??null),
      propertyType:fact(input.data.propertyType,'category',source('propertyType')?.source,source('propertyType')?.evidence??null),
      locality:fact(input.data.locality,'text',source('locality')?.source,source('locality')?.evidence??null),
      price:fact(input.data.priceCents===null?null:{amountCents:input.data.priceCents,currency:'EUR' as const,
        period:input.data.transaction==='rent'?'month' as const:'total' as const,
        charges:input.data.transaction==='rent'?input.data.charges!:'not_applicable' as const},'EUR_cent',source('priceCents')?.source,source('priceCents')?.evidence??null),
      area:fact(input.data.area,'m2',source('area')?.source,source('area')?.evidence??null),
      rooms:fact(input.data.rooms,'rooms',source('rooms')?.source,source('rooms')?.evidence??null)},photos,warnings:data.warnings});
  try{await completeImport(env.DB,GeneratableListing.parse(listing),{mode:'draft-completion',photos:photos.length});}
  catch(error){const latest=await findImport(env.DB,agencyId,id);if(latest?.status==='ready')return latest;throw error;}
  return (await findImport(env.DB,agencyId,id))!;
}
