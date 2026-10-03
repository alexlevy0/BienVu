import {requireOwner} from '../../../../../lib/owner';
import {assertSameOrigin} from '../../../../../lib/http';
import {respondSocial} from '../../../../../lib/social-crypto';
import {disconnectSocial} from '../../../../../lib/social';
export const dynamic='force-dynamic';
export async function DELETE(request:Request,context:{params:Promise<{id:string}>}){return respondSocial(async()=>{
  const {env,agency,role}=await requireOwner(request);assertSameOrigin(request,env);
  await disconnectSocial(env,agency.id,(await context.params).id,role);return Response.json({ok:true});
});}
