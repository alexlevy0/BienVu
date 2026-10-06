import {getCloudflareContext} from '@opennextjs/cloudflare';
import {adminVoicesRequest} from '../../../../../../lib/voices';
export const dynamic='force-dynamic';
export async function GET(request:Request,context:{params:Promise<{id:string}>}){
  return adminVoicesRequest(request,(await getCloudflareContext({async:true})).env,(await context.params).id);
}
