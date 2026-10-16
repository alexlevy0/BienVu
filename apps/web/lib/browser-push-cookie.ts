import {watchPushGeneration,type Database,type PushPrincipal} from '@bienvu/db';
const cookieName=(request:Request)=>new URL(request.url).protocol==='https:'?'__Host-bienvu-push':'bienvu-push';
export function browserPushCookie(request:Request,token:string|null){return `${cookieName(request)}=${token??''}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${token?90*86400:0}${new URL(request.url).protocol==='https:'?'; Secure':''}`;}
// Invoked before the admission response: closing the tab cannot lose the watch.
export async function watchAcceptedBrowserGeneration(env:{DB:Database;WEB_PUSH_ENABLED?:string},request:Request|undefined,jobId:string,principal:PushPrincipal|undefined){
  if(env.WEB_PUSH_ENABLED!=='true'||!request||!principal)return;
  const token=request.headers.get('cookie')?.split(';').map(s=>s.trim()).find(s=>s.startsWith(cookieName(request)+'='))?.slice(cookieName(request).length+1);
  if(!token||!/^[\w-]{43}$/.test(token))return;
  try{await watchPushGeneration(env.DB,principal,token,jobId);}catch{console.warn(JSON.stringify({event:'browser_push_watch_failed'}));}
}
