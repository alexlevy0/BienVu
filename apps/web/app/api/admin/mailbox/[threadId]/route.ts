import {getCloudflareContext} from '@opennextjs/cloudflare';
import {adminMailboxRequest} from '../../../../../lib/mailbox';
export const dynamic='force-dynamic';
type Context={params:Promise<{threadId:string}>};
export async function GET(request:Request,{params}:Context){return adminMailboxRequest(request,(await getCloudflareContext({async:true})).env,await params);}
export async function PATCH(request:Request,{params}:Context){return adminMailboxRequest(request,(await getCloudflareContext({async:true})).env,await params);}
