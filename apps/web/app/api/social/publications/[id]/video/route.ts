import {requireOwner} from '../../../../../../lib/owner';
import {respondSocial} from '../../../../../../lib/social-crypto';
import {socialVideo} from '../../../../../../lib/social';
export const dynamic='force-dynamic';
export async function GET(request:Request,context:{params:Promise<{id:string}>}){return respondSocial(async()=>{const {env,agency}=await requireOwner(request);
  return socialVideo(env,request,(await context.params).id,agency.id);
});}
export const HEAD=GET;
