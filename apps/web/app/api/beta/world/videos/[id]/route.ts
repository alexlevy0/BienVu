import {getCloudflareContext} from '@opennextjs/cloudflare';
import {betaWorldVideo} from '../../../../../../lib/beta-world-map';
import {respond} from '../../../../../../lib/http';
export const dynamic='force-dynamic';
export async function GET(request:Request,{params}:{params:Promise<{id:string}>}){return respond(async()=>{
 const {env}=await getCloudflareContext({async:true});return betaWorldVideo(request,env,(await params).id);
});}
export const HEAD=GET;
