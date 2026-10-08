import {requireOwner} from '../../../../../../../lib/owner';
import {photoPreviewer} from '../../../../../../../lib/import-transport';
import {privatePhotoPreview,respondPhotoPreview} from '../../../../../../../lib/photo-previews';
export const dynamic='force-dynamic';
export async function GET(request:Request,{params}:{params:Promise<{id:string;photoId:string}>}){
  return respondPhotoPreview(async()=>{
    const {env,agency}=await requireOwner(request),{id,photoId}=await params;
    return privatePhotoPreview(request,env,agency.id,id,photoId,photoPreviewer(request,env,agency.id,id));
  });
}
