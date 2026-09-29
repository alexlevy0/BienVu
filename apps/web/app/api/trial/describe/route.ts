import {getCloudflareContext} from '@opennextjs/cloudflare';
import {respond} from '../../../../lib/http';
import {describeGuest} from '../../../../lib/guest-extraction';
export const dynamic='force-dynamic';
export async function POST(request:Request){return respond(async()=>{
  const {env,cf}=await getCloudflareContext({async:true});
  return describeGuest(request,env,Boolean(cf?.colo));
});}
