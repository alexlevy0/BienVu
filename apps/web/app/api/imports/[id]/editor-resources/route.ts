import {findCreationDraft,retainedAnimations} from '@bienvu/db';
import {generationCreditCost} from '@bienvu/contracts';
import {requireOwner} from '../../../../../lib/owner';
import {respond,RequestFailure} from '../../../../../lib/http';
export const dynamic='force-dynamic';
export async function GET(request:Request,{params}:{params:Promise<{id:string}>}){return respond(async()=>{
 const {env,agency}=await requireOwner(request),id=(await params).id,draft=await findCreationDraft(env.DB,agency.id,id);
 if(!draft)throw new RequestFailure('NOT_FOUND');const settings=draft.data.videoCustomization;
 const reuses=await retainedAnimations(env.DB,agency.id,{agencyId:agency.id,photos:draft.photos},settings,settings?.editor?.aspectRatio??'9:16');
 return Response.json({version:draft.version,cost:generationCreditCost(settings)-reuses.length,animations:reuses.map(reuse=>({slot:draft.photos[reuse.index].sourceOrder,url:`/api/animations/${reuse.libraryId}`}))});
});}
