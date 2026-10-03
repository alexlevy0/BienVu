import {requireOwner} from '../../../../../lib/owner';
import {assertSameOrigin,boundedJson} from '../../../../../lib/http';
import {respondSocial} from '../../../../../lib/social-crypto';
import {socialPublication,changeSocialPublication} from '../../../../../lib/social';
export const dynamic='force-dynamic';
type Context={params:Promise<{id:string}>};
export async function GET(request:Request,context:Context){return respondSocial(async()=>{const {env,agency}=await requireOwner(request);
  return Response.json({publication:await socialPublication(env,agency.id,(await context.params).id)});
});}
export async function PATCH(request:Request,context:Context){return respondSocial(async()=>{const {env,agency,user,role}=await requireOwner(request);assertSameOrigin(request,env);
  return Response.json({publication:await changeSocialPublication(env,agency.id,user.id,role,(await context.params).id,await boundedJson(request,16000))});
});}
