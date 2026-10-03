import {requireOwner} from '../../../../lib/owner';
import {respond,boundedJson,assertSameOrigin} from '../../../../lib/http';
import {authOrigin} from '../../../../lib/auth';
import {createTopupCheckout,topupHistory} from '../../../../lib/credit-purchases';
export const dynamic='force-dynamic';
export async function GET(request:Request){return respond(async()=>{const {env,agency}=await requireOwner(request);return Response.json({purchases:await topupHistory(env,agency.id)});});}
export async function POST(request:Request){return respond(async()=>{const {env,agency}=await requireOwner(request);assertSameOrigin(request,env);return Response.json(await createTopupCheckout(env,agency.id,agency.email??'',authOrigin(env),await boundedJson(request,1024),request.headers.get('Idempotency-Key')??''));});}
