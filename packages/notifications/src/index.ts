import {buildPushPayload} from '@block65/webcrypto-web-push';
import {claimPushDelivery,finishPushDelivery,pendingPushDeliveries,expirePushEndpoint,type Database,type StoredPushSubscription} from '@bienvu/db';

export type BrowserPushEnvironment={DB:Database;WEB_PUSH_ENABLED?:string;WEB_PUSH_PUBLIC_KEY?:string;WEB_PUSH_PRIVATE_KEY?:string;WEB_PUSH_SUBJECT?:string};
export function browserPushConfigured(env:BrowserPushEnvironment){return env.WEB_PUSH_ENABLED==='true'&&/^[\w-]{87}$/.test(env.WEB_PUSH_PUBLIC_KEY??'')&&/^[\w-]{43}$/.test(env.WEB_PUSH_PRIVATE_KEY??'')&&/^mailto:[^\s@]+@[^\s@]+$/.test(env.WEB_PUSH_SUBJECT??'');}
// Only known browser push services are accepted. Arbitrary HTTPS endpoints are SSRF.
export function validPushEndpoint(endpoint:string){
  try{const url=new URL(endpoint);if(url.protocol!=='https:'||url.port||url.username||url.password||url.hash||endpoint.length>2048)return false;
    return url.hostname==='fcm.googleapis.com'&&/^\/(?:fcm\/send|wp)\//.test(url.pathname)
      ||url.hostname==='updates.push.services.mozilla.com'&&url.pathname.startsWith('/wpush/')
      ||url.hostname==='web.push.apple.com'&&url.pathname.startsWith('/')&&url.pathname.length>1
      ||/^[a-z0-9-]+\.notify\.windows\.com$/.test(url.hostname)&&url.pathname.startsWith('/');
  }catch{return false;}
}
export async function validatePushSubscription(value:unknown):Promise<StoredPushSubscription|null>{
  if(!value||typeof value!=='object'||Array.isArray(value))return null;
  const s=value as Partial<StoredPushSubscription>;
  if(typeof s.endpoint!=='string'||!validPushEndpoint(s.endpoint)||!s.keys||typeof s.keys.p256dh!=='string'||typeof s.keys.auth!=='string'
    ||!/^B[\w-]{86}$/.test(s.keys.p256dh))return null;
  if(!/^[\w-]{22}$/.test(s.keys.auth)||s.expirationTime!=null&&(!Number.isFinite(s.expirationTime)||s.expirationTime<=Date.now()))return null;
  try{const bytes=Uint8Array.from(atob(s.keys.p256dh.replaceAll('-','+').replaceAll('_','/')),c=>c.charCodeAt(0));
    await crypto.subtle.importKey('raw',bytes,{name:'ECDH',namedCurve:'P-256'},false,[]);
  }catch{return null;}
  return {endpoint:s.endpoint,expirationTime:s.expirationTime??null,keys:{p256dh:s.keys.p256dh,auth:s.keys.auth}};
}
export async function sendGenerationNotifications(env:BrowserPushEnvironment,jobId?:string,now=Date.now(),fetcher:typeof fetch=fetch){
  if(!browserPushConfigured(env))return;
  const pending=await pendingPushDeliveries(env.DB,now,jobId);
  // A small bounded batch also fits request waitUntil; the minute cron recovers interruptions.
  for(let start=0;start<pending.length;start+=4)await Promise.all(pending.slice(start,start+4).map(async delivery=>{
    const lease=crypto.randomUUID(),claimed=await claimPushDelivery(env.DB,delivery,lease,now);if(!claimed)return;
    try{
      const subscription=await validatePushSubscription(JSON.parse(delivery.subscription));
      if(!subscription){await expirePushEndpoint(env.DB,delivery.endpointHash);return;}
      const payload=await buildPushPayload({data:{type:'generation-ready',jobId:delivery.jobId,title:'Votre vidéo est prête 🎬',body:'Votre création BienVu vous attend. Cliquez pour découvrir le résultat.',url:`/historique/${delivery.jobId}`},options:{ttl:3600,urgency:'normal',topic:delivery.jobId.replaceAll('-','').slice(0,32)}},subscription,
        {subject:env.WEB_PUSH_SUBJECT!,publicKey:env.WEB_PUSH_PUBLIC_KEY!,privateKey:env.WEB_PUSH_PRIVATE_KEY!});
      const reply=await fetcher(subscription.endpoint,{...payload,redirect:'error',signal:AbortSignal.timeout(5000)});await reply.body?.cancel();
      if(reply.status===404||reply.status===410){await expirePushEndpoint(env.DB,delivery.endpointHash);return;}
      await finishPushDelivery(env.DB,delivery,lease,reply.ok?'sent':reply.status===429||reply.status>=500?'retry':'failed',claimed.attempts,now);
    }catch{await finishPushDelivery(env.DB,delivery,lease,'retry',claimed.attempts,now);}
  }));
}
