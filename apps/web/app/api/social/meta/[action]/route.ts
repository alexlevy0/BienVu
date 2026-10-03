import {getCloudflareContext} from '@opennextjs/cloudflare';
import {boundedBytes} from '../../../../../lib/http';
import {respondSocial,verifyMetaSignedRequest,socialOrigin,SocialFailure} from '../../../../../lib/social-crypto';
import {revokeMetaUser,type SocialEnv} from '../../../../../lib/social';
export const dynamic='force-dynamic';
export async function POST(request:Request,context:{params:Promise<{action:string}>}){return respondSocial(async()=>{
  const {env:bindings}=await getCloudflareContext({async:true}),action=(await context.params).action;
  const env:SocialEnv=bindings;
  if(!env.META_APP_SECRET||!['deauthorize','deletion'].includes(action))throw new SocialFailure('NOT_FOUND',404);
  if(request.headers.get('content-type')?.split(';')[0]!=='application/x-www-form-urlencoded')throw new SocialFailure('VALIDATION_ERROR');
  const params=new URLSearchParams(new TextDecoder().decode(await boundedBytes(request,10000))),user=await verifyMetaSignedRequest(params.get('signed_request')??'',env.META_APP_SECRET);
  await revokeMetaUser(env,user,action==='deletion');
  if(action==='deauthorize')return Response.json({ok:true});
  const id=crypto.randomUUID();await env.DB.prepare('INSERT INTO social_deletion_receipts VALUES(?,?)').bind(id,new Date().toISOString()).run();
  return Response.json({url:`${socialOrigin(env)}/api/social/deletion/${id}`,confirmation_code:id});
});}
