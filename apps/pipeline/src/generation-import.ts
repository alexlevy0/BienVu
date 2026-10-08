import {GeneratableListing,GenerationRequest,customizedListing,ImportFailure,errorCodes,importFailureReason,parseImportResourceHeader} from '@bienvu/contracts';
import {beginImport,completeImport,failImport,findImport,journalImportPhoto,reserveHostedImport,GenerationFailure,type GenerationRow} from '@bienvu/db';
import {importListing,readLimited,IMPORT_LIMITS,type ImportTransport} from '@bienvu/importers';
export type GenerationImportEnv={DB:D1Database;MEDIA:R2Bucket;IMPORT_SERVICE:Fetcher;IMPORT_TOKEN:string};
export async function loadGenerationListing(env:GenerationImportEnv,row:GenerationRow){
  const input=GenerationRequest.parse(JSON.parse(row.input));
  let id='listingId' in input?input.listingId:undefined;
  if(!id){
    if(!('url' in input))throw new GenerationFailure('VALIDATION_ERROR');
    const start=await beginImport(env.DB,row.agencyId,input.url,`generation-${row.jobId}`);id=start.row.id;
    if(start.fresh){
      try {
        await reserveHostedImport(env.DB,row.agencyId,id);
        const call=async(path:string,body:unknown,signal:AbortSignal)=>{
          const response=await env.IMPORT_SERVICE.fetch(`https://import.internal${path}`,{method:'POST',body:JSON.stringify(body),
            signal,headers:{'Content-Type':'application/json',Authorization:`Bearer ${env.IMPORT_TOKEN}`,'X-Agency-ID':row.agencyId,'X-Import-ID':id!}});
          if(!response.ok){const code=errorCodes.find(c=>c===response.headers.get('X-Import-Error'))??'SOURCE_UNAVAILABLE';await response.body?.cancel();
            const failure=new ImportFailure(code,'Import indisponible',importFailureReason(response.headers.get('X-Import-Reason')),parseImportResourceHeader(response.headers.get('X-Import-Resource')));
            failure.browserUsed=response.headers.get('X-Import-Browser')==='1';throw failure;}
          return response;
        };
        const transport:ImportTransport={load:async(url,kind,_hosts,signal,maxBytes)=>{
          const response=await call('/resource',{url,kind,maxBytes},signal);
          return {url:response.headers.get('X-Source-Url')??url,mime:response.headers.get('Content-Type')??'',
            sourceBytes:Number(response.headers.get('X-Source-Bytes')),width:Number(response.headers.get('X-Image-Width'))||undefined,
            browserUsed:response.headers.get('X-Import-Browser')==='1',
            height:Number(response.headers.get('X-Image-Height'))||undefined,bytes:await readLimited(response,kind==='image'?IMPORT_LIMITS.imageBytes:IMPORT_LIMITS.htmlBytes)};
        }};
        const {listing,diagnostics}=await importListing(input.url,{agencyId:row.agencyId,importId:id},{transport,
          browserHtml:async(_url,signal)=>new TextDecoder().decode(await readLimited(await call('/browser',{},signal),IMPORT_LIMITS.htmlBytes)),
          store:async(photo,bytes,signal)=>{signal.throwIfAborted();await journalImportPhoto(env.DB,row.agencyId,id!,photo);
            await env.MEDIA.put(photo.objectKey,bytes,{httpMetadata:{contentType:photo.mime},customMetadata:{agencyId:row.agencyId,importId:id!,sha256:photo.contentHash}});}
        },{mode:'cloudflare',signal:AbortSignal.timeout(75_000)});
        await completeImport(env.DB,listing,diagnostics);
      }catch(error){await failImport(env.DB,row.agencyId,id,error instanceof ImportFailure?error.code:'SOURCE_UNAVAILABLE',
        error&&typeof error==='object'&&'diagnostics' in error?error.diagnostics:{stage:'generation'});if(error instanceof ImportFailure)throw new GenerationFailure(error.code);throw error;}
    }
  }
  const imported=await findImport(env.DB,row.agencyId,id);
  if(!imported||imported.status!=='ready'||!imported.result||imported.expiresAt<=new Date().toISOString())throw new GenerationFailure('INCOMPLETE_LISTING');
  const listing=GeneratableListing.parse(JSON.parse(imported.result));
  if(listing.agencyId!==row.agencyId||listing.id!==id)throw new GenerationFailure('NOT_FOUND');
  let selected;
  try{selected=customizedListing(listing,input.customization);}catch{throw new GenerationFailure('VALIDATION_ERROR');}
  // Les objets sont contrôlés avant tout appel texte/voix payant.
  for(const photo of selected.photos){const object=await env.MEDIA.get(photo.objectKey);
    if(!object||object.size!==photo.sizeBytes)throw new GenerationFailure('INVALID_PHOTO');
    const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',await object.arrayBuffer()))].map(b=>b.toString(16).padStart(2,'0')).join('');
    if(hash!==photo.contentHash)throw new GenerationFailure('INVALID_PHOTO');}
  await env.DB.prepare("UPDATE jobs SET listing_id=?,updated_at=? WHERE id=? AND agency_id=? AND status NOT IN ('ready','failed')")
    .bind(id,new Date().toISOString(),row.jobId,row.agencyId).run();
  return {listingId:id};
}
