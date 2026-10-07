import {getCloudflareContext} from '@opennextjs/cloudflare';
import {respond} from '../../../../../../lib/http';
import {trialResponse} from '../../../../../../lib/trials';
import {completeAnonymousManual} from '../../../../../../lib/anonymous-manual';
export const dynamic='force-dynamic';
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){return respond(()=>trialResponse(async()=>{
  const {env}=await getCloudflareContext({async:true}),{id}=await params;return completeAnonymousManual(request,env,id);
}));}
