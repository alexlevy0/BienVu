import {getCloudflareContext} from '@opennextjs/cloudflare';
import {adminMailboxRequest} from '../../../../lib/mailbox';
export const dynamic='force-dynamic';
export async function GET(request:Request){return adminMailboxRequest(request,(await getCloudflareContext({async:true})).env);}
export async function POST(request:Request){const {env,ctx}=await getCloudflareContext({async:true});return adminMailboxRequest(request,env,undefined,work=>ctx.waitUntil(work));}
