import {getCloudflareContext} from '@opennextjs/cloudflare';
import {generationView} from '@bienvu/db';
import {respond} from '../../../../lib/http';
import {ownAnonymousJob,trialResponse} from '../../../../lib/trials';
export const dynamic='force-dynamic';
export async function GET(request:Request,{params}:{params:Promise<{id:string}>}){return respond(()=>trialResponse(async()=>{
  const {env}=await getCloudflareContext({async:true});return Response.json(generationView(await ownAnonymousJob(request,env,(await params).id),Date.now(),'anonymous'));
}));}
