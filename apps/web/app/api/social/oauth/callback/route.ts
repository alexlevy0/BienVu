import {getCloudflareContext} from '@opennextjs/cloudflare';
import {requireOwner} from '../../../../../lib/owner';
import {respond,RequestFailure} from '../../../../../lib/http';
import {socialOrigin,SocialFailure,socialOAuthReturn} from '../../../../../lib/social-crypto';
import {finishSocialOAuth} from '../../../../../lib/social';
export const dynamic='force-dynamic';
export async function GET(request:Request){return respond(async()=>{
  const {env}=await getCloudflareContext({async:true}),origin=socialOrigin(env);
  let destination='/agence?socialError=SOCIAL_CONNECT_FAILED';
  try{const {agency,user,role}=await requireOwner(request),params=new URL(request.url).searchParams;
    const cookie=request.headers.get('cookie')??'',browser=/(?:^|;\s*)bienvu_meta_state=([A-Za-z0-9_-]{43})(?:;|$)/.exec(cookie)?.[1]??'';
    const pageHint=/(?:^|;\s*)bienvu_meta_page=([^;]*)/.exec(cookie)?.[1]??null;
    const grant=await finishSocialOAuth(env,agency.id,user.id,role,params.getAll('state').length===1?params.get('state')!:'',browser,socialOAuthReturn(params),undefined,pageHint);
    destination=`/agence?socialGrant=${grant}`;
  }catch(error){const code=error instanceof SocialFailure?error.code:error instanceof RequestFailure&&error.code==='UNAUTHORIZED'?'SOCIAL_STATE':'SOCIAL_CONNECT_FAILED';
    destination=`/agence?socialError=${encodeURIComponent(code)}`;
    console.warn(JSON.stringify({event:'social_oauth_callback_failed',code}));}
  const headers=new Headers({Location:origin+destination+'#reseaux'}),secure=origin.startsWith('https:')?'; Secure':'';
  for(const name of ['bienvu_meta_state','bienvu_meta_page'])headers.append('Set-Cookie',`${name}=; Path=/api/social/oauth; HttpOnly; SameSite=Lax; Max-Age=0${secure}`);
  return new Response(null,{status:303,headers});
});}
