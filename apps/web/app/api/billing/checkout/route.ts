import {requireOwner} from '../../../../lib/owner';
import {respond,boundedJson,assertSameOrigin} from '../../../../lib/http';
import {authOrigin} from '../../../../lib/auth';
import {createCheckout} from '../../../../lib/billing';
export const dynamic='force-dynamic';
export async function POST(request:Request){return respond(async()=>{const {env,agency}=await requireOwner(request);assertSameOrigin(request,env);return Response.json(await createCheckout(env,agency.id,agency.email??'',authOrigin(env),await boundedJson(request,1024),request.headers.get('Idempotency-Key')??''));});}
