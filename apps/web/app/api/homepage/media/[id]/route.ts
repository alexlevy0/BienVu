import {getCloudflareContext} from '@opennextjs/cloudflare';
import {homepageMediaRequest,homepageEdgeCache} from '../../../../../lib/homepage-media';
export const dynamic='force-dynamic';
export async function GET(request:Request,{params}:{params:Promise<{id:string}>}){
 const {env,ctx}=await getCloudflareContext({async:true});
 return homepageMediaRequest(request,env,(await params).id,undefined,await homepageEdgeCache(env.BETTER_AUTH_URL,task=>ctx.waitUntil(task)));
}
export const HEAD=GET;
