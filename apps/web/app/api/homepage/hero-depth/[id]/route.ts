import {getCloudflareContext} from '@opennextjs/cloudflare';
import {publicHeroDepthMedia} from '../../../../../lib/home-hero-depth-media';
export const dynamic='force-dynamic';
export async function GET(request:Request,{params}:{params:Promise<{id:string}>}){
 const {env}=await getCloudflareContext({async:true});
 return publicHeroDepthMedia(env.MEDIA,(await params).id,request);
}
export const HEAD=GET;
