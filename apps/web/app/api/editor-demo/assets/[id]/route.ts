import {getCloudflareContext} from '@opennextjs/cloudflare';
import {publicDemoMedia} from '../../../../../lib/editor-demo-media';
export const dynamic='force-dynamic';
export async function GET(request:Request,{params}:{params:Promise<{id:string}>}){
  const {env}=await getCloudflareContext({async:true});return publicDemoMedia(env.MEDIA,(await params).id,request);
}
export const HEAD=GET;
