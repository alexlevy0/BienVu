import {requireOwner} from '../../../../../lib/owner';
import {assertSameOrigin} from '../../../../../lib/http';
import {respondSocial,socialOrigin,socialOAuthStartInput} from '../../../../../lib/social-crypto';
import {startSocialOAuth} from '../../../../../lib/social';
export const dynamic='force-dynamic';
export async function POST(request:Request){return respondSocial(async()=>{
  const {env,agency,user,role}=await requireOwner(request);assertSameOrigin(request,env);
  const input=await socialOAuthStartInput(request);
  const result=await startSocialOAuth(env,agency.id,user.id,role,input.pageId,input.flow),secure=socialOrigin(env).startsWith('https:')?'; Secure':'',headers=new Headers();
  headers.append('Set-Cookie',`bienvu_meta_state=${result.browser}; Path=/api/social/oauth; HttpOnly; SameSite=Lax; Max-Age=900${secure}`);
  headers.append('Set-Cookie',`bienvu_meta_page=${result.pageHint??''}; Path=/api/social/oauth; HttpOnly; SameSite=Lax; Max-Age=${result.pageHint?900:0}${secure}`);
  return Response.json({url:result.url},{headers});
});}
