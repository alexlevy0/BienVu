import {requireOwner} from '../../../lib/owner';
import {respond,boundedJson,assertSameOrigin} from '../../../lib/http';
import {teamAction,teamSummary} from '../../../lib/teams';
import {authOrigin} from '../../../lib/auth';
export const dynamic='force-dynamic';
export async function GET(request:Request){return respond(async()=>{const {env,agency,user,role}=await requireOwner(request);return Response.json(await teamSummary(env,agency.id,user.id,role));});}
export async function POST(request:Request){return respond(async()=>{const {env,agency,user,role}=await requireOwner(request);assertSameOrigin(request,env);const result=await teamAction(env,agency.id,user,role,await boundedJson(request));const response=Response.json(result);
 if('agencyId' in result)response.headers.set('Set-Cookie',`bienvu_agency=${result.agencyId}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000${authOrigin(env).startsWith('https:')?'; Secure':''}`);return response;
});}
