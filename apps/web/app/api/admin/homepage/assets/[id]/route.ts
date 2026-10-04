import {getCloudflareContext} from '@opennextjs/cloudflare';
import {homepageMediaRequest} from '../../../../../../lib/homepage-media';
export const dynamic='force-dynamic';
export async function GET(request:Request,{params}:{params:Promise<{id:string}>}){
 const env=(await getCloudflareContext({async:true})).env;return homepageMediaRequest(request,env,(await params).id,env);
}
export const HEAD=GET;
