import {getCloudflareContext} from '@opennextjs/cloudflare';
import {adminMailboxRequest} from '../../../../../../../lib/mailbox';
export const dynamic='force-dynamic';
export async function GET(request:Request,{params}:{params:Promise<{messageId:string}>}){
  return adminMailboxRequest(request,(await getCloudflareContext({async:true})).env,{...await params,html:true});
}
