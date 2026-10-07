import {getCloudflareContext} from '@opennextjs/cloudflare';
import {respond} from '../../../../lib/http';
import {trialResponse} from '../../../../lib/trials';
import {prepareAnonymousManual} from '../../../../lib/anonymous-manual';
export const dynamic='force-dynamic';
export async function POST(request:Request){return respond(()=>trialResponse(async()=>{
  const {env,cf}=await getCloudflareContext({async:true});return prepareAnonymousManual(request,env,Boolean(cf?.colo));
}));}
