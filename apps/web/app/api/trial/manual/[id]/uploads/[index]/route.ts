import {getCloudflareContext} from '@opennextjs/cloudflare';
import {respond} from '../../../../../../../lib/http';
import {trialResponse} from '../../../../../../../lib/trials';
import {uploadAnonymousManual} from '../../../../../../../lib/anonymous-manual';
export const dynamic='force-dynamic';
export async function PUT(request:Request,{params}:{params:Promise<{id:string;index:string}>}){return respond(()=>trialResponse(async()=>{
  const {env}=await getCloudflareContext({async:true}),{id,index}=await params;return uploadAnonymousManual(request,env,id,index);
}));}
