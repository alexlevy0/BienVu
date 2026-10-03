import {getCloudflareContext} from '@opennextjs/cloudflare';
import {EntityId} from '@bienvu/contracts';
import {respondSocial,SocialFailure} from '../../../../../lib/social-crypto';
export const dynamic='force-dynamic';
export async function GET(_request:Request,context:{params:Promise<{id:string}>}){return respondSocial(async()=>{
  const {env}=await getCloudflareContext({async:true}),id=(await context.params).id;
  if(!EntityId.safeParse(id).success||!await env.DB.prepare('SELECT id FROM social_deletion_receipts WHERE id=?').bind(id).first())throw new SocialFailure('NOT_FOUND',404);
  return Response.json({status:'completed',message:'Les données de connexion Meta ont été supprimées de BienVu. Les publications déjà présentes sur les réseaux restent gérées dans ces réseaux.'});
});}
