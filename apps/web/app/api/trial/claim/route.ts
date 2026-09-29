import {claimTrial,generationView,trialForSession} from '@bienvu/db';
import {requireOwner} from '../../../../lib/owner';
import {respond,assertSameOrigin,RequestFailure} from '../../../../lib/http';
import {requireTrial,trialResponse} from '../../../../lib/trials';
export const dynamic='force-dynamic';
export async function POST(request:Request){return respond(()=>trialResponse(async()=>{
  const {env,agency}=await requireOwner(request);assertSameOrigin(request,env);const session=await requireTrial(request,env);
  const intent=await env.DB.prepare('SELECT claim_job_id AS id FROM anonymous_sessions WHERE id=?').bind(session.id).first<{id:string|null}>();
  const row=await trialForSession(env.DB,session,intent?.id??undefined);
  if(!row)throw new RequestFailure('NOT_FOUND');return Response.json(generationView(await claimTrial(env.DB,session,agency.id,row.jobId)));
}));}
