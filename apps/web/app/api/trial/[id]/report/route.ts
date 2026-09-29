import {getCloudflareContext} from '@opennextjs/cloudflare';
import {assertSameOrigin,boundedJson,respond} from '../../../../../lib/http';
import {ownAnonymousJob} from '../../../../../lib/trials';
import {saveProblemReport} from '../../../../../lib/problem-reports';
export const dynamic='force-dynamic';
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){return respond(async()=>{
  const {env} = await getCloudflareContext({async:true});assertSameOrigin(request,env);
  const row=await ownAnonymousJob(request,env,(await params).id);
  return Response.json(await saveProblemReport(env.DB,row,`session:${row.anonymousSessionId}`,request.headers.get('Idempotency-Key')??'',
    await boundedJson(request,1500)),{status:201});
});}
