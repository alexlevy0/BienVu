import type {GenerationView} from '@bienvu/contracts';
export const browserNotificationEvent='bienvu:generation-started';
export const browserNotificationSettingsEvent='bienvu:notification-settings';
export const notificationPreferenceKey='bienvu:browser-notifications:v1';
const tokenKey='bienvu:push-device:v1',jobsKey='bienvu:push-pending:v1';
export type NotificationPreference='enabled'|'later'|'disabled';
export type NotificationCapability='supported'|'install-required'|'unavailable';
export type PushConfiguration={enabled:boolean;publicKey:string|null};
const validId=(id:unknown):id is string=>typeof id==='string'&&/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/.test(id);
export function notificationCapability():NotificationCapability{
  if(typeof window==='undefined'||!window.isSecureContext)return 'unavailable';
  const ios=/iPad|iPhone|iPod/.test(navigator.userAgent)||navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1;
  const standalone=matchMedia('(display-mode: standalone)').matches||('standalone' in navigator&&navigator.standalone===true);
  if(ios&&!standalone)return 'install-required';
  return 'Notification' in window&&'serviceWorker' in navigator&&'PushManager' in window?'supported':'unavailable';
}
export function notificationPreference():NotificationPreference|null{
  try{const value=localStorage.getItem(notificationPreferenceKey);return value==='enabled'||value==='later'||value==='disabled'?value:null;}catch{return null;}
}
export function saveNotificationPreference(value:NotificationPreference){try{localStorage.setItem(notificationPreferenceKey,value);}catch{}}
function notificationJobs():{id:string;at:number}[]{
  try{const items=JSON.parse(sessionStorage.getItem(jobsKey)??'[]') as {id:string;at:number}[];
    return Array.isArray(items)?items.filter(item=>item&&validId(item.id)&&Number.isFinite(item.at)&&item.at>Date.now()-86400_000).slice(-12):[];
  }catch{return [];}
}
export function pendingNotificationJobs():string[]{return notificationJobs().map(item=>item.id);}
export function announceGenerationStarted(job:Pick<GenerationView,'id'|'status'>){
  if(typeof window==='undefined'||!validId(job.id)||['ready','failed'].includes(job.status))return;
  const jobs=notificationJobs().filter(item=>item.id!==job.id);jobs.push({id:job.id,at:Date.now()});
  try{sessionStorage.setItem(jobsKey,JSON.stringify(jobs.slice(-12)));}catch{}
  window.dispatchEvent(new CustomEvent(browserNotificationEvent));
}
function deviceToken(){
  const old=localStorage.getItem(tokenKey);if(old&&/^[\w-]{43}$/.test(old))return old;
  const value=btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32)))).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');
  localStorage.setItem(tokenKey,value);return value;
}
function applicationKey(value:string){return Uint8Array.from(atob(value.replaceAll('-','+').replaceAll('_','/')),c=>c.charCodeAt(0));}
export async function prepareBrowserNotifications(){
  const response=await fetch('/api/notifications',{signal:AbortSignal.timeout(10_000),cache:'no-store'});
  if(!response.ok)throw new Error('Les notifications sont momentanément indisponibles.');
  const config=await response.json() as PushConfiguration;
  if(!config.enabled||!config.publicKey||!/^[\w-]{87}$/.test(config.publicKey))throw new Error('Les notifications sont momentanément indisponibles.');
  const registration=await navigator.serviceWorker.register('/notifications-sw.js',{scope:'/',updateViaCache:'none'});
  // This worker has no fetch handler and never caches private application pages.
  await Promise.race([navigator.serviceWorker.ready,new Promise<never>((_,reject)=>setTimeout(()=>reject(new Error('Réessayez dans quelques instants.')),10_000))]);
  return {registration,applicationKey:applicationKey(config.publicKey)};
}
export async function saveBrowserSubscription(subscription:PushSubscription){
  const response=await fetch('/api/notifications',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'subscribe',token:deviceToken(),subscription:subscription.toJSON(),jobs:pendingNotificationJobs()}),keepalive:true,signal:AbortSignal.timeout(10_000)});
  if(!response.ok)throw new Error('L’activation n’a pas abouti. Votre vidéo continue de se préparer.');
  saveNotificationPreference('enabled');
}
export async function watchBrowserGenerations(){
  if(notificationPreference()!=='enabled')return;
  const jobs=pendingNotificationJobs();if(!jobs.length)return;
  const registration=await navigator.serviceWorker.getRegistration('/notifications-sw.js'),subscription=await registration?.pushManager.getSubscription();
  if(!subscription)throw new Error('Réactivez les notifications pour ce navigateur.');
  // Renew the device and its current account binding before watching new work.
  await saveBrowserSubscription(subscription);
}
export async function disableBrowserNotifications(){
  saveNotificationPreference('disabled');
  try{sessionStorage.removeItem(jobsKey);}catch{}
  let token:string|null=null;try{token=localStorage.getItem(tokenKey);}catch{}
  const local=async()=>{if('serviceWorker' in navigator){const registration=await navigator.serviceWorker.getRegistration('/notifications-sw.js');const subscription=await registration?.pushManager.getSubscription();await subscription?.unsubscribe();}};
  await Promise.allSettled([local(),...(token?[fetch('/api/notifications',{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({token}),keepalive:true,signal:AbortSignal.timeout(5000)})]:[])]);
}
