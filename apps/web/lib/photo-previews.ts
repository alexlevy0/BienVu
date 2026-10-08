import type {PhotoAsset} from '@bienvu/contracts';
import {findImport,type Database} from '@bienvu/db';
import {readLimited} from '@bienvu/importers';
import {importResult} from './imports';
import {RequestFailure,respond} from './http';

type Env={DB:Database;MEDIA:Pick<R2Bucket,'head'|'get'>};
type Convert=(body:Uint8Array<ArrayBuffer>,signal:AbortSignal)=>Promise<Response>;
export async function privatePhotoPreview(request:Request,env:Env,agencyId:string,id:string,photoId:string,convert:Convert){
  const result=importResult(await findImport(env.DB,agencyId,id));
  const photo:PhotoAsset|undefined=(result.listing?.photos??result.draft?.photos??[]).find(p=>p.id===photoId);
  if(!photo||photo.agencyId!==agencyId||photo.listingId!==id||!photo.objectKey.startsWith(`agencies/${agencyId}/imports/${id}/`))throw new RequestFailure('NOT_FOUND');
  const head=await env.MEDIA.head(photo.objectKey);
  if(!head||head.size!==photo.sizeBytes||head.customMetadata?.sha256!==photo.contentHash)throw new RequestFailure('NOT_FOUND');
  if(head.size>10*1024*1024)throw new RequestFailure('INVALID_PHOTO');
  const tag=`"photo-preview-v1-640-${photo.contentHash}"`,headers={'ETag':tag,'Cache-Control':'private, no-cache','Vary':'Cookie'};
  // Validate ownership, current draft state and the original before reusing any
  // browser bytes. No shared CDN cache or stale access after deletion/logout.
  if(request.headers.get('if-none-match')?.split(',').some(value=>value.trim()===tag||value.trim()===`W/${tag}`))
    return new Response(null,{status:304,headers});
  const object=await env.MEDIA.get(photo.objectKey);
  if(!object||object.size!==photo.sizeBytes||object.customMetadata?.sha256!==photo.contentHash){
    await object?.body.cancel();throw new RequestFailure('NOT_FOUND');
  }
  // Use bounded byte bodies across the Next/Workers adapter, as for the
  // existing manual-photo normalization transport.
  const bytesIn=new Uint8Array(await object.arrayBuffer());
  if(bytesIn.length!==photo.sizeBytes)throw new RequestFailure('INVALID_PHOTO');
  const response=await convert(bytesIn,request.signal);
  if(!response.ok||response.headers.get('Content-Type')!=='image/webp'){await response.body?.cancel();throw new RequestFailure('INVALID_PHOTO');}
  const bytes=await readLimited(response,256*1024);
  if(bytes.length<12||new TextDecoder().decode(bytes.slice(0,4))!=='RIFF'||new TextDecoder().decode(bytes.slice(8,12))!=='WEBP')throw new RequestFailure('INVALID_PHOTO');
  return new Response(bytes,{headers:{...headers,'Content-Type':'image/webp','Content-Length':String(bytes.length)}});
}
export async function respondPhotoPreview(action:()=>Promise<Response>){
  const response=await respond(action);
  if([200,304].includes(response.status))response.headers.set('Cache-Control','private, no-cache');
  return response;
}
