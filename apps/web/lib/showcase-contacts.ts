import {z} from 'zod';
import {ShowcaseContact,ShowcaseAction,type ShowcaseLead,type ShowcasePrivate} from '@bienvu/contracts';
import {showcaseLimit,type ShowcaseRow} from '@bienvu/db';
import {assertSameOrigin,boundedJson,RequestFailure} from './http';
import {verifyBot} from './bot-verification';
import {emailConfigured} from './auth-email';
import {createAuth} from './auth';
import {resolvePublicShowcase,publicShowcaseProperty,type ShowcaseEnv} from './showcases';

export type ShowcaseContactEnv=ShowcaseEnv&Pick<CloudflareEnv,'PROBE_MODE'|'BETTER_AUTH_URL'|'BETTER_AUTH_SECRET'|'GOOGLE_CLIENT_ID'|'GOOGLE_CLIENT_SECRET'> &
  Partial<Pick<CloudflareEnv,'AUTH_EMAIL'|'AUTH_EMAIL_MODE'|'AUTH_EMAIL_FROM'>> &{TURNSTILE_SITE_KEY?:string;TURNSTILE_SECRET_KEY?:string;TRIAL_IP_HMAC_SECRET?:string};
const leadColumns='id,property_id AS propertyId,property_title AS propertyTitle,name,email,phone,message,status,notification,created_at AS createdAt';
async function fingerprint(env:ShowcaseContactEnv,value:string){const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(env.TRIAL_IP_HMAC_SECRET??env.BETTER_AUTH_SECRET),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  return Array.from(new Uint8Array(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode('showcase:'+value))),b=>b.toString(16).padStart(2,'0')).join('');}
function trustedIp(request:Request,env:ShowcaseContactEnv,trusted:boolean){const url=new URL(request.url),local=env.PROBE_MODE==='local'&&url.protocol==='http:'&&['localhost','127.0.0.1'].includes(url.hostname),ip=local?'127.0.0.1':trusted?request.headers.get('cf-connecting-ip'):null;
  if(!ip||ip.length>64||!/^[:.a-f0-9]+$/i.test(ip))throw new RequestFailure('FORBIDDEN');return ip;}
export const showcaseContactConfig=(env:ShowcaseContactEnv)=>({enabled:Boolean(env.TURNSTILE_SITE_KEY&&env.TURNSTILE_SECRET_KEY),siteKey:env.TURNSTILE_SITE_KEY||null});
export async function submitShowcaseContact(request:Request,env:ShowcaseContactEnv,slug:string,trusted:boolean,fetcher:typeof fetch=fetch){
  assertSameOrigin(request,env);const parsed=ShowcaseContact.safeParse(await boundedJson(request,24576)),id=request.headers.get('Idempotency-Key')??'';
  if(!parsed.success||!z.uuid().safeParse(id).success)throw new RequestFailure('VALIDATION_ERROR');if(parsed.data.website)throw new RequestFailure('BOT_VERIFICATION_FAILED');
  const row=await resolvePublicShowcase(env,slug),{turnstileToken:_proof,website:_trap,...data}=parsed.data,hash=await fingerprint(env,JSON.stringify({...data,agency:row.agencyId}));
  const receipt=await env.DB.prepare('SELECT agency_id AS agencyId,request_hash AS hash FROM showcase_contact_intents WHERE id=?').bind(id).first<{agencyId:string;hash:string}>();
  if(receipt){if(receipt.agencyId!==row.agencyId||receipt.hash!==hash)throw new RequestFailure('CONFLICT');return Response.json({received:true});}
  if(!showcaseContactConfig(env).enabled)throw new RequestFailure('BOT_VERIFICATION_FAILED');
  const ip=await fingerprint(env,'ip:'+trustedIp(request,env,trusted));if(!await showcaseLimit(env.DB,'contact:'+ip,6,600000))throw new RequestFailure('RATE_LIMITED');
  if(!await showcaseLimit(env.DB,'contact-email:'+await fingerprint(env,data.email.toLowerCase()),10,86400000))throw new RequestFailure('RATE_LIMITED');
  const property=data.propertyId?await publicShowcaseProperty(env,row,data.propertyId):null;
  const proof=await verifyBot(env,parsed.data.turnstileToken,'showcase:'+id,'showcase_contact',fetcher),at=new Date().toISOString();
  const count=await env.DB.prepare('SELECT count(*) n FROM showcase_leads WHERE agency_id=?').bind(row.agencyId).first<{n:number}>();if((count?.n??0)>=5000)throw new RequestFailure('RATE_LIMITED');
  const email=row.published?.notifications?row.published.email:null,notification=email&&emailConfigured(env)?'pending':'disabled';
  try{await env.DB.batch([
    env.DB.prepare('INSERT INTO showcase_contact_intents(id,agency_id,request_hash,created_at) VALUES(?,?,?,?) ON CONFLICT(id) DO NOTHING').bind(id,row.agencyId,hash,at),
    env.DB.prepare(`INSERT INTO showcase_leads(id,agency_id,property_id,property_title,request_hash,turnstile_hash,name,email,phone,message,notification,notify_email,retry_at,created_at)
      SELECT ?,?,?,?,?,?,?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM showcase_contact_intents WHERE id=? AND agency_id=? AND request_hash=?) ON CONFLICT(id) DO NOTHING`)
      .bind(id,row.agencyId,data.propertyId,property?.fields.title??null,hash,proof,data.name,data.email.toLowerCase(),data.phone,data.message,notification,email,at,at,id,row.agencyId,hash),
  ]);}catch(error){if(error instanceof Error&&/UNIQUE constraint/.test(error.message))throw new RequestFailure('BOT_VERIFICATION_FAILED');throw error;}
  const accepted=await env.DB.prepare('SELECT request_hash AS hash,agency_id AS agencyId FROM showcase_contact_intents WHERE id=?').bind(id).first<{hash:string;agencyId:string}>();
  if(accepted?.hash!==hash||accepted.agencyId!==row.agencyId)throw new RequestFailure('CONFLICT');return Response.json({received:true},{status:201});
}
export async function listShowcaseLeads(env:ShowcaseEnv,agency:string,cursor:string|null){
  if(cursor&&!z.uuid().safeParse(cursor).success)throw new RequestFailure('VALIDATION_ERROR');
  const previous=cursor?await env.DB.prepare('SELECT created_at AS at FROM showcase_leads WHERE agency_id=? AND id=?').bind(agency,cursor).first<{at:string}>():null;
  if(cursor&&!previous)throw new RequestFailure('CONFLICT');const rows=await env.DB.prepare(`SELECT ${leadColumns} FROM showcase_leads WHERE agency_id=?
    AND (? IS NULL OR created_at<? OR (created_at=? AND id<?)) ORDER BY created_at DESC,id DESC LIMIT 51`)
    .bind(agency,previous?.at??null,previous?.at??null,previous?.at??null,cursor).all<ShowcaseLead>();
  return{leads:rows.results.slice(0,50),nextLeadCursor:rows.results.length>50?rows.results[49].id:null};
}
export async function mutateShowcaseLead(env:ShowcaseContactEnv,agency:string,role:string,input:unknown){const parsed=ShowcaseAction.safeParse(input);if(!parsed.success||!['lead','lead-delete','lead-retry'].includes(parsed.data.action)||!('id'in parsed.data))throw new RequestFailure('VALIDATION_ERROR');
  if(role==='viewer'||parsed.data.action==='lead-delete'&&!['owner','admin'].includes(role))throw new RequestFailure('FORBIDDEN');const action=parsed.data;
  const lead=await env.DB.prepare('SELECT id FROM showcase_leads WHERE agency_id=? AND id=?').bind(agency,action.id).first();if(!lead)throw new RequestFailure('NOT_FOUND');
  if(action.action==='lead')await env.DB.prepare('UPDATE showcase_leads SET status=? WHERE agency_id=? AND id=?').bind(action.status,agency,action.id).run();
  else if(action.action==='lead-delete')await env.DB.prepare('DELETE FROM showcase_leads WHERE agency_id=? AND id=?').bind(agency,action.id).run();
  else{if(!emailConfigured(env))throw new RequestFailure('EMAIL_UNAVAILABLE');await env.DB.prepare("UPDATE showcase_leads SET notification='pending',attempts=0,retry_at=? WHERE agency_id=? AND id=? AND notification='failed' AND notify_email IS NOT NULL")
    .bind(new Date().toISOString(),agency,action.id).run();}return{ok:true};
}
export async function showcaseStatistics(env:ShowcaseEnv,agency:string,days:7|30=30,now=Date.now()):Promise<ShowcasePrivate['stats']>{const from=new Date(now-(days-1)*86400000).toISOString().slice(0,10),until=new Date(now).toISOString().slice(0,10);
  const[stats,requests]=await Promise.all([env.DB.prepare('SELECT coalesce(sum(agency_views),0) AS agencyViews,coalesce(sum(property_views),0) AS propertyViews,coalesce(sum(contact_clicks),0) AS contactClicks FROM showcase_daily WHERE agency_id=? AND day BETWEEN ? AND ?').bind(agency,from,until).first<{agencyViews:number;propertyViews:number;contactClicks:number}>(),
    env.DB.prepare('SELECT count(*) n FROM showcase_contact_intents WHERE agency_id=? AND created_at>=? AND created_at<=?').bind(agency,from,new Date(now).toISOString()).first<{n:number}>()]);
  return{days,agencyViews:stats?.agencyViews??0,propertyViews:stats?.propertyViews??0,contactClicks:stats?.contactClicks??0,requests:requests?.n??0};}
const eventBody=z.object({event:z.enum(['agency_view','property_view','contact_click']),propertyId:z.uuid().nullable(),intent:z.uuid(),consent:z.literal(true)}).strict();
export async function recordShowcaseEvent(request:Request,env:ShowcaseContactEnv,slug:string,trusted:boolean){assertSameOrigin(request,env);
  const parsed=eventBody.safeParse(await boundedJson(request,512));if(!parsed.success)throw new RequestFailure('VALIDATION_ERROR');
  const row=await resolvePublicShowcase(env,slug),body=parsed.data;
  if(/bot|crawler|spider|headless|curl|wget|python|undici|node|facebookexternalhit/i.test(request.headers.get('user-agent')??''))return new Response(null,{status:204});
  if(body.event==='property_view'&&!body.propertyId)throw new RequestFailure('VALIDATION_ERROR');if(body.propertyId)await publicShowcaseProperty(env,row,body.propertyId);
  const session=await createAuth(env).api.getSession({headers:request.headers});if(session?.user){const member=await env.DB.prepare('SELECT 1 FROM agency_members WHERE agency_id=? AND user_id=? UNION SELECT 1 FROM agencies WHERE id=? AND owner_user_id=?').bind(row.agencyId,session.user.id,row.agencyId,session.user.id).first();if(member)return new Response(null,{status:204});}
  const ip=await fingerprint(env,'event-ip:'+trustedIp(request,env,trusted));if(!await showcaseLimit(env.DB,'events:'+ip,100,60000))return new Response(null,{status:204});
  const now=Date.now(),id=await fingerprint(env,JSON.stringify([row.agencyId,body.event,body.propertyId,body.intent]));await env.DB.prepare('INSERT INTO showcase_event_keys(id,agency_id,day,event,expires_at) VALUES(?,?,?,?,?) ON CONFLICT(id) DO NOTHING')
    .bind(id,row.agencyId,new Date(now).toISOString().slice(0,10),body.event,now+172800000).run();return new Response(null,{status:204});}
export async function sendShowcaseNotifications(env:ShowcaseContactEnv,now=Date.now()){
  if(!emailConfigured(env))return;const at=new Date(now).toISOString();await env.DB.prepare("UPDATE showcase_leads SET notification='failed',lease_until=NULL WHERE notification='sending' AND lease_until<=? AND attempts>=5").bind(at).run();const rows=await env.DB.prepare(`SELECT id,agency_id AS agencyId FROM showcase_leads
    WHERE (notification='pending' OR notification='sending' AND lease_until<=?) AND retry_at<=? AND attempts<5 ORDER BY created_at LIMIT 10`).bind(at,at).all<{id:string;agencyId:string}>();
  for(const candidate of rows.results){const row=await env.DB.prepare(`UPDATE showcase_leads SET notification='sending',attempts=attempts+1,lease_until=?
      WHERE id=? AND (notification='pending' OR notification='sending' AND lease_until<=?) AND retry_at<=? AND attempts<5
      RETURNING ${leadColumns},notify_email AS notifyEmail,attempts`).bind(new Date(now+120000).toISOString(),candidate.id,at,at).first<ShowcaseLead&{notifyEmail:string|null;attempts:number}>();if(!row)continue;
    if(!await showcaseLimit(env.DB,'notice-day',100,86400000,now)){await env.DB.prepare("UPDATE showcase_leads SET notification='pending',attempts=attempts-1,retry_at=?,lease_until=NULL WHERE id=? AND notification='sending'").bind(new Date(now+3600000).toISOString(),row.id).run();continue;}
    try{if(!row.notifyEmail)throw new Error('RECIPIENT_MISSING');await env.AUTH_EMAIL!.send({from:env.AUTH_EMAIL_FROM!,to:row.notifyEmail,subject:'Nouvelle demande depuis votre vitrine — BienVu',
      text:`Une demande a été enregistrée dans votre espace BienVu.\n\n${row.propertyTitle?'Bien : '+row.propertyTitle+'\n':''}Nom : ${row.name}\nE-mail : ${row.email}\nTéléphone : ${row.phone||'Non renseigné'}\n\n${row.message}\n\nConsultez et traitez la demande : ${env.BETTER_AUTH_URL}/ma-vitrine#demandes\n\nCette demande ne confirme pas un rendez-vous et n’inscrit pas le prospect à des communications commerciales.`});
      await env.DB.prepare("UPDATE showcase_leads SET notification='sent',lease_until=NULL WHERE id=? AND notification='sending'").bind(row.id).run();
    }catch{await env.DB.prepare('UPDATE showcase_leads SET notification=?,retry_at=?,lease_until=NULL WHERE id=? AND notification=\'sending\'')
      .bind(row.attempts>=5?'failed':'pending',new Date(now+[60000,300000,900000,3600000,3600000][row.attempts-1]).toISOString(),row.id).run();console.warn(JSON.stringify({event:'showcase_notification_failed'}));}}
}
