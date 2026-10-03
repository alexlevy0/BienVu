import {requireOwner} from '../../../../../lib/owner';
import {respondSocial} from '../../../../../lib/social-crypto';
import {socialCaption} from '../../../../../lib/social';
export const dynamic='force-dynamic';
export async function GET(request:Request,context:{params:Promise<{id:string}>}){return respondSocial(async()=>{const {env,agency}=await requireOwner(request);
  return Response.json(await socialCaption(env,agency.id,(await context.params).id));
});}
