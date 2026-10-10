import {getCloudflareContext} from '@opennextjs/cloudflare';
import {avatarMediaRequest} from '../../../../../lib/avatars';
export const dynamic='force-dynamic';
export async function GET(request:Request,{params}:{params:Promise<{id:string}>}){
  return avatarMediaRequest(request,(await getCloudflareContext({async:true})).env,(await params).id);
}
export const HEAD=GET;
