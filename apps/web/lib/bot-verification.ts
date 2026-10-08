import {opaqueHash} from '@bienvu/db';
import {authOrigin,type AuthEnvironment} from './auth';
import {RequestFailure} from './http';

export async function verifyBot(env:AuthEnvironment&{TURNSTILE_SECRET_KEY?:string},token:unknown,idempotency:string,
  action:'anonymous_trial'|'partner_application',fetcher:typeof fetch=fetch) {
  if(typeof token!=='string'||!token||token.length>2048||!env.TURNSTILE_SECRET_KEY)throw new RequestFailure('BOT_VERIFICATION_FAILED');
  // The verification retry belongs to both this intent and this fresh token.
  const hash=await opaqueHash(idempotency+':'+token),uuid=`${hash.slice(0,8)}-${hash.slice(8,12)}-4${hash.slice(13,16)}-8${hash.slice(17,20)}-${hash.slice(20,32)}`;
  try {
    const response=await fetcher('https://challenges.cloudflare.com/turnstile/v0/siteverify',{method:'POST',signal:AbortSignal.timeout(8000),
      headers:{'Content-Type':'application/json'},body:JSON.stringify({secret:env.TURNSTILE_SECRET_KEY,response:token,idempotency_key:uuid})});
    const result=await response.json() as {success?:boolean;hostname?:string;action?:string;challenge_ts?:string};
    const age=Date.now()-Date.parse(result.challenge_ts??'');
    if(!response.ok||result.success!==true||result.hostname!==new URL(authOrigin(env)).hostname||result.action!==action||!Number.isFinite(age)||age< -30_000||age>300_000)throw 0;
    return opaqueHash(token);
  }catch{throw new RequestFailure('BOT_VERIFICATION_FAILED');}
}
