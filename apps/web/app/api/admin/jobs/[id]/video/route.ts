import {getCloudflareContext} from '@opennextjs/cloudflare';
import {adminJobRequest} from '../../../../../../lib/admin';
export const dynamic='force-dynamic';
export async function GET(request:Request,{params}:{params:Promise<{id:string}>}){
  return adminJobRequest(request,(await getCloudflareContext({async:true})).env,(await params).id,true);
}
export const HEAD=GET;
