import {getCloudflareContext} from '@opennextjs/cloudflare';
import {respondSocial} from '../../../../../lib/social-crypto';
import {socialVideo} from '../../../../../lib/social';
export const dynamic='force-dynamic';
export async function GET(request:Request,context:{params:Promise<{id:string}>}){return respondSocial(async()=>{
  const {env}=await getCloudflareContext({async:true});return socialVideo(env,request,(await context.params).id);
});}
export const HEAD=GET;
