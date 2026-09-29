import {getCloudflareContext} from '@opennextjs/cloudflare';
import {respond} from '../../../../../lib/http';
import {ownAnonymousJob,trialResponse} from '../../../../../lib/trials';
import {generationSourcePhoto} from '../../../../../lib/generation-source-photo';
export const dynamic='force-dynamic';
export async function GET(request:Request,{params}:{params:Promise<{id:string}>}){return respond(()=>trialResponse(async()=>{
  const {env}=await getCloudflareContext({async:true});
  return generationSourcePhoto(env,await ownAnonymousJob(request,env,(await params).id));
}));}
