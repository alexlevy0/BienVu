import {getCloudflareContext} from '@opennextjs/cloudflare';
import {adminMusicRequest} from '../../../../../../lib/music-library';
export const dynamic='force-dynamic';
export async function GET(request:Request,{params}:{params:Promise<{id:string}>}){
  return adminMusicRequest(request,(await getCloudflareContext({async:true})).env,(await params).id,true);
}
export const PUT=GET;
