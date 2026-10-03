import {retainedAnimation} from '@bienvu/db';
import {requireOwner} from '../../../../lib/owner';
import {respond,RequestFailure} from '../../../../lib/http';
import {streamPrivateAsset} from '../../../../lib/media-stream';
export const dynamic='force-dynamic';
export async function GET(request:Request,{params}:{params:Promise<{id:string}>}){return respond(async()=>{
 const {env,agency}=await requireOwner(request),cached=await retainedAnimation(env.DB,agency.id,(await params).id);
 if(!cached)throw new RequestFailure('NOT_FOUND');return streamPrivateAsset(request,env.MEDIA,cached.asset,`agencies/${agency.id}/imports/animation-library/`);
});}
export const HEAD=GET;
