import {getCloudflareContext} from '@opennextjs/cloudflare';
import {respond} from '../../../../../../lib/http';
import {ownAnonymousJob,trialResponse} from '../../../../../../lib/trials';
import {generationStream} from '../../../../../../lib/progressive-video';
export const dynamic='force-dynamic';
export async function GET(request:Request,{params}:{params:Promise<{id:string;file:string}>}){return respond(()=>trialResponse(async()=>{
  const {env}=await getCloudflareContext({async:true}),{id,file}=await params;return generationStream(request,env,await ownAnonymousJob(request,env,id),file);
}));}
export const HEAD=GET;
