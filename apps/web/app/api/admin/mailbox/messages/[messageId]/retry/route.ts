import {getCloudflareContext} from '@opennextjs/cloudflare';
import {adminMailboxRequest} from '../../../../../../../lib/mailbox';
export const dynamic='force-dynamic';
export async function POST(request:Request,{params}:{params:Promise<{messageId:string}>}){
  const {env,ctx}=await getCloudflareContext({async:true});return adminMailboxRequest(request,env,{...await params,retry:true},work=>ctx.waitUntil(work));
}
