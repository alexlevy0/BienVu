import {MANUAL_PHOTO_LIMITS} from '@bienvu/contracts';
import {requireOwner} from '../../../../../../lib/owner';
import {assertSameOrigin, boundedBytes, RequestFailure, respond} from '../../../../../../lib/http';
import {photoNormalizer,assertImportMode,reserveCloudflareImport} from '../../../../../../lib/import-transport';
import {manualDraft, uploadManualPhoto} from '../../../../../../lib/manual-listings';
import {findImport} from '@bienvu/db';
import {uploadCreationPhoto,removeCreationPhoto} from '../../../../../../lib/creation-drafts';
export const dynamic = 'force-dynamic';
export async function PUT(request: Request, {params}: {params: Promise<{id: string; index: string}>}) {
  return respond(async () => {
    const {env, agency} = await requireOwner(request); assertSameOrigin(request, env);
    const {id, index} = await params, normalize = photoNormalizer(request, env, agency.id, id);
    if (!/^(?:[0-9]|1[01])$/.test(index)) throw new RequestFailure('VALIDATION_ERROR');
    const row=await findImport(env.DB,agency.id,id);
    if(row?.draftPending){
      if(assertImportMode(request,env)==='cloudflare')await reserveCloudflareImport(env,agency.id,id);
      const uploadId=request.headers.get('X-Upload-ID')??'';
      const bytes=await boundedBytes(request,MANUAL_PHOTO_LIMITS.fileBytes,'PHOTO_TOO_LARGE');
      return Response.json({photo:await uploadCreationPhoto(env,agency.id,id,Number(index),uploadId,bytes,
        request.headers.get('content-type')?.split(';')[0]??'',normalize,request.signal)});
    }
    await manualDraft(env.DB, agency.id, id);
    const bytes = await boundedBytes(request, MANUAL_PHOTO_LIMITS.fileBytes, 'PHOTO_TOO_LARGE');
    const photo = await uploadManualPhoto(env, agency.id, id, Number(index), bytes, request.headers.get('content-type')?.split(';')[0] ?? '', normalize, request.signal);
    return Response.json({photo});
  });
}
export async function DELETE(request:Request,{params}:{params:Promise<{id:string;index:string}>}){
  return respond(async()=>{const {env,agency}=await requireOwner(request);assertSameOrigin(request,env);
    const {id,index}=await params,uploadId=request.headers.get('X-Upload-ID')??'';
    if(!/^(?:[0-9]|1[01])$/.test(index)||!/^[-a-zA-Z0-9_]{16,64}$/.test(uploadId))throw new RequestFailure('VALIDATION_ERROR');
    await removeCreationPhoto(env,agency.id,id,uploadId);return Response.json({ok:true});
  });
}
