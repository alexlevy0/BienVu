import {requireOwner} from '../../../../lib/owner';
import {assertSameOrigin,boundedJson} from '../../../../lib/http';
import {respondSocial} from '../../../../lib/social-crypto';
import {socialOverview,createSocialPublication} from '../../../../lib/social';
export const dynamic='force-dynamic';
export async function GET(request:Request){return respondSocial(async()=>{const {env,agency}=await requireOwner(request),params=new URL(request.url).searchParams;
  const now=new Date(),from=params.get('from')??new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),1)).toISOString(),to=params.get('to')??new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth()+1,1)).toISOString();
  return Response.json(await socialOverview(env,agency.id,from,to,params.get('cursor')));
});}
export async function POST(request:Request){return respondSocial(async()=>{const {env,agency,user,role}=await requireOwner(request);assertSameOrigin(request,env);
  return Response.json({publication:await createSocialPublication(env,agency.id,user.id,role,request.headers.get('idempotency-key')??'',await boundedJson(request,16000))},{status:202});
});}
