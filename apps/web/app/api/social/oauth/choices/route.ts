import {requireOwner} from '../../../../../lib/owner';
import {respondSocial} from '../../../../../lib/social-crypto';
import {socialOAuthChoices} from '../../../../../lib/social';
export const dynamic='force-dynamic';
export async function GET(request:Request){return respondSocial(async()=>{const {env,agency,user,role}=await requireOwner(request);
  return Response.json({choices:await socialOAuthChoices(env,agency.id,user.id,role,new URL(request.url).searchParams.get('grant')??'')});
});}
