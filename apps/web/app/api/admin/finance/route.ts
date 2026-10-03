import {getCloudflareContext} from '@opennextjs/cloudflare';
import {financeRequest} from '../../../../lib/profitability';
export const dynamic='force-dynamic';
export async function GET(request:Request){return financeRequest(request,(await getCloudflareContext({async:true})).env);}
export const POST=GET;
