import {z} from 'zod';
import {PartnerApplication,partnerActivities} from '@bienvu/contracts';
import {partnerApplicationReceipt,partnerApplicationAttempt,storePartnerApplication} from '@bienvu/db';
import {authOrigin} from './auth';
import {assertSameOrigin,boundedJson,RequestFailure} from './http';
import {mailboxEnabled,type MailboxEnv} from './mailbox';
import {verifyBot} from './bot-verification';

export type PartnersEnv=MailboxEnv&{TURNSTILE_SITE_KEY?:string;TURNSTILE_SECRET_KEY?:string;TRIAL_IP_HMAC_SECRET?:string};
const applicationBody=PartnerApplication.extend({turnstileToken:z.string().max(2048)}).strict();
const enabled=(env:PartnersEnv)=>mailboxEnabled(env)&&Boolean(env.TURNSTILE_SITE_KEY&&env.TURNSTILE_SECRET_KEY&&(env.TRIAL_IP_HMAC_SECRET?.length??0)>=32);
export function partnerApplicationConfig(env:PartnersEnv) {
  return Response.json({enabled:enabled(env),siteKey:enabled(env)?env.TURNSTILE_SITE_KEY:null});
}
async function fingerprint(env:PartnersEnv,value:string) {
  const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(env.TRIAL_IP_HMAC_SECRET!),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  return Array.from(new Uint8Array(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode('partners:'+value))),n=>n.toString(16).padStart(2,'0')).join('');
}
function fail(error:unknown):never {
  const message=error instanceof Error?error.message:'';
  if(message.includes('PARTNER_RATE_LIMIT'))throw new RequestFailure('RATE_LIMITED');
  if(message.includes('PARTNER_CONFLICT'))throw new RequestFailure('CONFLICT');
  if(message.includes('PARTNER_BOT_REUSED'))throw new RequestFailure('BOT_VERIFICATION_FAILED');
  throw error;
}
export async function submitPartnerApplication(request:Request,env:PartnersEnv,trustedCloudflare:boolean,fetcher:typeof fetch=fetch) {
  assertSameOrigin(request,env);
  const body=applicationBody.safeParse(await boundedJson(request,4096)),id=request.headers.get('Idempotency-Key')??'';
  if(!body.success||!z.uuid().safeParse(id).success)throw new RequestFailure('VALIDATION_ERROR');
  if(!enabled(env))throw new RequestFailure('MAILBOX_UNAVAILABLE');
  const {turnstileToken,...data}=body.data,requestHash=await fingerprint(env,'request:'+JSON.stringify(data));
  const prior=await partnerApplicationReceipt(env.DB,id);
  if(prior){if(prior.request_hash!==requestHash)throw new RequestFailure('CONFLICT');return Response.json({received:true});}
  const url=new URL(request.url),local=env.PROBE_MODE==='local'&&url.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(url.hostname);
  const ip=local?'127.0.0.1':trustedCloudflare?request.headers.get('cf-connecting-ip'):null;
  if(!ip||ip.length>64||!/^[:.a-fA-F0-9]+$/.test(ip))throw new RequestFailure('MAILBOX_UNAVAILABLE');
  const ipHash=await fingerprint(env,'ip:'+ip),at=new Date().toISOString();
  try {await partnerApplicationAttempt(env.DB,ipHash,at);}catch(error){fail(error);}
  const turnstileHash=await verifyBot(env,turnstileToken,'partner:'+id,'partner_application',fetcher);
  const hash=await fingerprint(env,'message:'+id),messageId=`${hash.slice(0,8)}-${hash.slice(8,12)}-4${hash.slice(13,16)}-8${hash.slice(17,20)}-${hash.slice(20,32)}`;
  const activity=partnerActivities.find(activity=>activity.value===data.activity)!.label;
  const subject='Candidature partenaire — '+data.name;
  const text=`Candidature au programme partenaires BienVu\n\nNom : ${data.name}\nE-mail professionnel : ${data.email}\nActivité : ${activity}\n\nEnvoyée depuis ${authOrigin(env)}/partenaires. Adresse e-mail déclarée, non vérifiée.\n\nLa candidature et l’attribution des clients recommandés sont à valider manuellement par notre équipe.\nProgramme présenté : 15 % des paiements HT encaissés pendant 12 mois à partir du premier paiement du client, avec des versements mensuels.`;
  try {await storePartnerApplication(env.DB,{id,requestHash,messageId,ipHash,emailHash:await fingerprint(env,'email:'+data.email),turnstileHash,
    ...data,to:env.MAILBOX_ADDRESS!.toLowerCase(),subject,text,at});}catch(error){fail(error);}
  return Response.json({received:true},{status:201});
}
