import {requireOwner} from '../../../lib/owner';
import {respond,assertSameOrigin,boundedJson} from '../../../lib/http';
import {workspaceAction,workspaceSummary} from '../../../lib/agency-workspace';
export const dynamic='force-dynamic';
export async function GET(request:Request){return respond(async()=>{const {env,agency}=await requireOwner(request);return Response.json(await workspaceSummary(env,agency.id));});}
export async function POST(request:Request){return respond(async()=>{const {env,agency}=await requireOwner(request);assertSameOrigin(request,env);return Response.json(await workspaceAction(env,agency.id,await boundedJson(request)));});}
