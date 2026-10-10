import {getCloudflareContext} from '@opennextjs/cloudflare';
import {z} from 'zod';
import {ensureAgency,memberAgency} from '@bienvu/db';
import {createAuth} from '../../../../lib/auth';
import {assertSameOrigin,boundedJson,RequestFailure,respond} from '../../../../lib/http';
import {billingMode} from '../../../../lib/billing';
import {promotionValidationAttempt,validatePromotion} from '../../../../lib/subscription-promotions';
export const dynamic='force-dynamic';
export async function POST(request:Request){return respond(async()=>{
  const {env}=await getCloudflareContext({async:true});assertSameOrigin(request,env);
  await promotionValidationAttempt(env.DB,env.BETTER_AUTH_SECRET,request.headers.get('cf-connecting-ip')??'local');
  const body=z.object({code:z.string().max(64)}).strict().safeParse(await boundedJson(request,256));if(!body.success)throw new RequestFailure('VALIDATION_ERROR');
  const mode=billingMode(env);if(!mode)throw new RequestFailure('BILLING_UNAVAILABLE');
  const session=await createAuth(env).api.getSession({headers:request.headers});let agencyId:string|undefined;
  if(session?.user.emailVerified){
    const personal=await ensureAgency(env.DB,session.user),selected=/\bbienvu_agency=([a-zA-Z0-9_-]{1,128})(?:;|$)/.exec(request.headers.get('cookie')??'')?.[1];
    agencyId=(selected?await memberAgency(env.DB,session.user.id,selected):null)?.agency.id??personal.id;
    if(await env.DB.prepare("SELECT 1 FROM subscriptions WHERE agency_id=? AND stripe_mode=? AND status NOT IN ('canceled','incomplete_expired')").bind(agencyId,mode).first())throw new RequestFailure('VALIDATION_ERROR',{promotion:'subscription'});
  }
  return Response.json((await validatePromotion(env.DB,body.data.code,mode,agencyId)).preview);
});}
