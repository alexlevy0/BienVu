import {getCloudflareContext} from '@opennextjs/cloudflare';
import {respond} from '../../../../lib/http';
import {trialHistoryResponse,trialResponse} from '../../../../lib/trials';
export const dynamic='force-dynamic';
export async function GET(request:Request){return respond(()=>trialResponse(async()=>trialHistoryResponse(request,(await getCloudflareContext({async:true})).env)));}
