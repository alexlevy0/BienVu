import {admitAnonymous,anonymousSession,createAnonymousSession,generationEvent,generationView,GenerationFailure,listAnonymousGenerationPage,opaqueHash,priorTrial,trialForSession,trialPolicy,type AnonymousSession} from '@bienvu/db';
import {authOrigin} from './auth';
import {assertSameOrigin,boundedJson,RequestFailure} from './http';
import {callGeneration,streamGenerationMedia} from './generations';
export type TrialEnv=CloudflareEnv&{ANONYMOUS_TRIALS_ENABLED?:string;TURNSTILE_SITE_KEY?:string;TURNSTILE_SECRET_KEY?:string;TRIAL_IP_HMAC_SECRET?:string};
const cookieName=(env:TrialEnv)=>authOrigin(env).startsWith('https://')?'__Host-bienvu-trial':'bienvu-trial';
export function trialCookie(request:Request,env:TrialEnv){const name=cookieName(env);return request.headers.get('cookie')?.split(';').map(s=>s.trim()).find(s=>s.startsWith(name+'='))?.slice(name.length+1);}
export const sessionFromRequest=(request:Request,env:TrialEnv)=>anonymousSession(env.DB,trialCookie(request,env));
export async function requireTrial(request:Request,env:TrialEnv){const session=await sessionFromRequest(request,env);if(!session)throw new RequestFailure('NOT_FOUND');return session;}
export async function trialResponse(action:()=>Promise<Response>){try{return await action();}catch(e){if(e instanceof GenerationFailure)throw new RequestFailure(e.code);throw e;}}
function configured(env:TrialEnv){return env.ANONYMOUS_TRIALS_ENABLED==='true'&&env.GENERATIONS_ENABLED==='true'&&Boolean(env.TURNSTILE_SITE_KEY&&env.TURNSTILE_SECRET_KEY&&(env.TRIAL_IP_HMAC_SECRET?.length??0)>=32);}
export async function trialHistoryResponse(request:Request,env:TrialEnv) {
  if(new URL(request.url).origin!==authOrigin(env)||request.headers.get('sec-fetch-site')==='cross-site')throw new RequestFailure('FORBIDDEN');
  const session=await sessionFromRequest(request,env);
  // Reading history creates neither a session nor a generation, even when admissions are paused.
  const page=session?await listAnonymousGenerationPage(env.DB,session,new URL(request.url).searchParams.get('cursor')??undefined):{rows:[],nextCursor:null};
  return Response.json({jobs:page.rows.map(row=>generationView(row,Date.now(),'anonymous')),nextCursor:page.nextCursor});
}
export async function trialSessionResponse(request:Request,env:TrialEnv) {
  if(new URL(request.url).origin!==authOrigin(env)||request.headers.get('sec-fetch-site')==='cross-site')throw new RequestFailure('FORBIDDEN');
  let session=await sessionFromRequest(request,env),cookie:string|undefined;const policy=await trialPolicy(env.DB);
  if(!session&&configured(env)&&policy.enabled===1){
    const created=await createAnonymousSession(env.DB);session=created.session;
    cookie=`${cookieName(env)}=${created.proof}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${policy.session_days*86400}${authOrigin(env).startsWith('https://')?'; Secure':''}`;
  }
  const row=session?await trialForSession(env.DB,session):null;
  const intent=session?await env.DB.prepare('SELECT claim_job_id AS id FROM anonymous_sessions WHERE id=?').bind(session.id).first<{id:string|null}>():null;
  return Response.json({enabled:configured(env)&&policy.enabled===1,siteKey:configured(env)?env.TURNSTILE_SITE_KEY:null,
    hasIntent:Boolean(intent?.id),used:session?session.successes>=policy.successes:false,job:row?generationView(row,Date.now(),'anonymous'):null},
    {headers:cookie?{'Set-Cookie':cookie}:{}});
}
export async function ipFingerprint(request:Request,env:TrialEnv,trustedCloudflare:boolean){
  if((env.TRIAL_IP_HMAC_SECRET?.length??0)<32)throw new RequestFailure('ANONYMOUS_UNAVAILABLE');
  const url=new URL(request.url);
  const local=env.PROBE_MODE==='local'&&url.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(url.hostname);
  const ip=local?'127.0.0.1':trustedCloudflare?request.headers.get('cf-connecting-ip'):null;
  if(!ip||ip.length>64||!/^[:.a-fA-F0-9]+$/.test(ip))throw new RequestFailure('ANONYMOUS_UNAVAILABLE');
  const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(env.TRIAL_IP_HMAC_SECRET),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  return [...new Uint8Array(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(ip)))].map(n=>n.toString(16).padStart(2,'0')).join('');
}
export async function verifyTrialBot(env:TrialEnv,token:unknown,idempotency:string,fetcher:typeof fetch=fetch) {
  if(typeof token!=='string'||!token||token.length>2048||!env.TURNSTILE_SECRET_KEY)throw new RequestFailure('BOT_VERIFICATION_FAILED');
  const hash=await opaqueHash(idempotency),uuid=`${hash.slice(0,8)}-${hash.slice(8,12)}-4${hash.slice(13,16)}-8${hash.slice(17,20)}-${hash.slice(20,32)}`;
  try {
    const response=await fetcher('https://challenges.cloudflare.com/turnstile/v0/siteverify',{method:'POST',signal:AbortSignal.timeout(8000),
      headers:{'Content-Type':'application/json'},body:JSON.stringify({secret:env.TURNSTILE_SECRET_KEY,response:token,idempotency_key:uuid})});
    const result=await response.json() as {success?:boolean;hostname?:string;action?:string;challenge_ts?:string};
    const age=Date.now()-Date.parse(result.challenge_ts??'');
    if(!response.ok||result.success!==true||result.hostname!==new URL(authOrigin(env)).hostname||result.action!=='anonymous_trial'||!Number.isFinite(age)||age< -30_000||age>300_000)throw 0;
    return opaqueHash(token);
  }catch{throw new RequestFailure('BOT_VERIFICATION_FAILED');}
}
export async function startTrial(request:Request,env:TrialEnv,trustedCloudflare:boolean,verify=verifyTrialBot){
  assertSameOrigin(request,env);const session=await requireTrial(request,env),body=await boundedJson(request,8192);
  if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).some(k=>!['url','turnstileToken','subtitlesEnabled'].includes(k))||!('url' in body))throw new RequestFailure('VALIDATION_ERROR');
  const key=request.headers.get('Idempotency-Key')??'',input={url:body.url,...('subtitlesEnabled' in body?{subtitlesEnabled:body.subtitlesEnabled}:{})};
  const prior=await priorTrial(env.DB,session,key,input);
  let row=prior.row;
  if(!row){
    if(!configured(env))throw new RequestFailure('ANONYMOUS_UNAVAILABLE');
    const ipHmac=await ipFingerprint(request,env,trustedCloudflare);
    const turnstileHash=await verify(env,'turnstileToken' in body?body.turnstileToken:undefined,session.id+':'+key);
    row=await admitAnonymous(env.DB,session,key,input,{ipHmac,turnstileHash},env.ANONYMOUS_TRIALS_ENABLED);
  }
  if(row.status==='queued'&&row.launchStatus==='pending'){
    try{await callGeneration(env,row.agencyId,`/generations/${row.jobId}/retry`,{});}catch{/* The durable outbox remains authoritative; cron retries launch. */}
  }
  return Response.json(generationView(row,Date.now(),'anonymous'),{status:202});
}
export async function ownAnonymousJob(request:Request,env:TrialEnv,id:string){
  const session=await requireTrial(request,env),row=await trialForSession(env.DB,session,id);
  if(!row||row.ownerAgencyId)throw new RequestFailure('NOT_FOUND');
  if(row.retention!=='available'||row.expiresAt<=new Date().toISOString())throw new RequestFailure('TRIAL_EXPIRED');return row;
}
export async function trialPreview(request:Request,env:TrialEnv,id:string){
  const row=await ownAnonymousJob(request,env,id);return streamGenerationMedia(request,env,row,'preview');
}
export async function trialLoginIntent(request:Request,env:TrialEnv,id:string){
  assertSameOrigin(request,env);await ownAnonymousJob(request,env,id);const session=await requireTrial(request,env);
  await env.DB.prepare('UPDATE anonymous_sessions SET claim_job_id=? WHERE id=?').bind(id,session.id).run();await generationEvent(env.DB,id,'login');return Response.json({url:'/connexion?trial=1'});
}
