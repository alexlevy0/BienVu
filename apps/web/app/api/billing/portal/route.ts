import {requireOwner} from '../../../../lib/owner';
import {respond,assertSameOrigin} from '../../../../lib/http';
import {authOrigin} from '../../../../lib/auth';
import {createPortal} from '../../../../lib/billing';
export const dynamic='force-dynamic';
export async function POST(request:Request){return respond(async()=>{const {env,agency}=await requireOwner(request);assertSameOrigin(request,env);return Response.json(await createPortal(env,agency.id,authOrigin(env)));});}
