import {requireOwner} from '../../../../lib/owner';
import {assertSameOrigin,boundedJson} from '../../../../lib/http';
import {respondSocial,socialConfigured} from '../../../../lib/social-crypto';
import {socialConnections,selectSocialConnections} from '../../../../lib/social';
export const dynamic='force-dynamic';
export async function GET(request:Request){return respondSocial(async()=>{const {env,agency}=await requireOwner(request);
  return Response.json({configured:socialConfigured(env),connections:await socialConnections(env,agency.id)});
});}
export async function POST(request:Request){return respondSocial(async()=>{const {env,agency,user,role}=await requireOwner(request);assertSameOrigin(request,env);
  return Response.json({connections:await selectSocialConnections(env,agency.id,user.id,role,await boundedJson(request))});
});}
