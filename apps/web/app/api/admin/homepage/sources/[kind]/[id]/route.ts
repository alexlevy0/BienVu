import {getCloudflareContext} from '@opennextjs/cloudflare';
import {adminHomepageSourceRequest} from '../../../../../../../lib/homepage-media';
export const dynamic='force-dynamic';
export async function GET(request:Request,{params}:{params:Promise<{kind:string;id:string}>}){
 const {kind,id}=await params;return adminHomepageSourceRequest(request,(await getCloudflareContext({async:true})).env,kind,id);
}
export const HEAD=GET;
