import {getCloudflareContext} from '@opennextjs/cloudflare';
import {homepageMediaRequest} from '../../../../../lib/homepage-media';
export const dynamic='force-dynamic';
export async function GET(request:Request,{params}:{params:Promise<{id:string}>}){
 return homepageMediaRequest(request,(await getCloudflareContext({async:true})).env,(await params).id);
}
export const HEAD=GET;
