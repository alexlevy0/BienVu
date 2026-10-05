import {getCloudflareContext} from '@opennextjs/cloudflare';
import {adminMailboxRequest} from '../../../../../../lib/mailbox';
export const dynamic='force-dynamic';
export async function PUT(request:Request,{params}:{params:Promise<{uploadId:string}>}){
  return adminMailboxRequest(request,(await getCloudflareContext({async:true})).env,await params);
}
