import {recordPageHit,purgeTraffic,type Database,type PageHit} from '@bienvu/db';
const pages:Record<string,PageHit['page']>={'/':'home','/connexion':'login','/explorer':'explorer','/abonnement':'offers','/sources':'sources'};
// Le pays est fourni exclusivement par request.cf dans le Worker, pas un header.
export function pageHit(request:Request,response:Response,origin:string,trustedCountry?:string,now=Date.now()):PageHit|null{
  const url=new URL(request.url);
  if(url.origin!==origin||request.method!=='GET'||response.status!==200||!response.headers.get('content-type')?.includes('text/html'))return null;
  const page=pages[url.pathname];if(!page)return null;
  if(request.headers.get('rsc')==='1'||request.headers.has('next-router-prefetch')||/prefetch/i.test((request.headers.get('purpose')??'')+' '+(request.headers.get('sec-purpose')??'')))return null;
  if(/bot|crawler|spider|headless|curl|wget|python|undici|node|facebookexternalhit/i.test(request.headers.get('user-agent')??''))return null;
  const country=trustedCountry&&/^[A-Z]{2}$/.test(trustedCountry)&&trustedCountry!=='T1'?trustedCountry:'XX';
  return {day:new Date(now).toISOString().slice(0,10),page,country};
}
export function collectTraffic(request:Request,response:Response,env:{DB:Database;TRAFFIC_ENABLED?:string;BETTER_AUTH_URL:string},ctx:{waitUntil(task:Promise<unknown>):void},country?:string){
  if(env.TRAFFIC_ENABLED!=='true')return;
  const hit=pageHit(request,response,env.BETTER_AUTH_URL,country);if(!hit)return;
  ctx.waitUntil(recordPageHit(env.DB,hit).catch(()=>{console.error(JSON.stringify({event:'traffic_write_failed'}));}));
}
export {purgeTraffic};
