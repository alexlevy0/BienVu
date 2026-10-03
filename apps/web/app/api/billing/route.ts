import {requireOwner} from '../../../lib/owner';
import {respond} from '../../../lib/http';
import {billingStatus} from '../../../lib/billing';
export const dynamic='force-dynamic';
export async function GET(request:Request){return respond(async()=>{const {env,agency}=await requireOwner(request);return Response.json(await billingStatus(env,agency.id));});}
