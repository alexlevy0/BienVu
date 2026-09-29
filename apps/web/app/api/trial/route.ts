import {getCloudflareContext} from '@opennextjs/cloudflare';
import {respond} from '../../../lib/http';
import {trialResponse,trialSessionResponse,startTrial} from '../../../lib/trials';
export const dynamic='force-dynamic';
export async function GET(request:Request){return respond(()=>trialResponse(async()=>trialSessionResponse(request,(await getCloudflareContext({async:true})).env)));}
export async function POST(request:Request){return respond(()=>trialResponse(async()=>{const {env,cf}=await getCloudflareContext({async:true});return startTrial(request,env,Boolean(cf?.colo));}));}
