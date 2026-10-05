import {z} from 'zod';
import {seoPage} from './seo-paths';
import {boundedJson,RequestFailure,respond} from './http';

type Channel='direct'|'google'|'bing'|'search'|'social'|'internal'|'other';
type Vital='LCP'|'CLS'|'INP';
const bots=/bot|crawler|spider|headless|curl|wget|python|undici|node|facebookexternalhit/i;
export function sourceChannel(referrer:string|null,origin:string):Channel {
  if(!referrer)return 'direct';
  let url:URL;try{url=new URL(referrer);if(!['https:','http:'].includes(url.protocol))return 'other';}catch{return 'other';}
  if(url.origin===origin)return 'internal';
  const host=url.hostname.toLowerCase();
  if(/^(?:[a-z0-9-]+\.)?google\.(?:com|fr|co\.uk|de|es|it|be|ch|ca)$/.test(host))return 'google';
  if(host==='bing.com'||host.endsWith('.bing.com'))return 'bing';
  if(/(^|\.)(yahoo\.com|duckduckgo\.com|qwant\.com|ecosia\.org)$/.test(host))return 'search';
  if(/(^|\.)(instagram\.com|facebook\.com|tiktok\.com|linkedin\.com|t\.co|x\.com|pinterest\.com)$/.test(host))return 'social';
  return 'other';
}
function privateQuery(url:URL) {return [...url.searchParams.keys()].some(key=>['draft','homePreview','token','code','socialError','socialConnected','checkout','session_id'].includes(key));}
export function seoHit(request:Request,response:Response,origin:string,now=Date.now()) {
  const url=new URL(request.url),page=seoPage(url.pathname);
  if(!page||privateQuery(url)||url.origin!==origin||request.method!=='GET'||response.status!==200||!response.headers.get('content-type')?.includes('text/html'))return null;
  if(request.headers.get('rsc')==='1'||request.headers.has('next-router-prefetch')||/prefetch/i.test((request.headers.get('purpose')??'')+' '+(request.headers.get('sec-purpose')??''))||bots.test(request.headers.get('user-agent')??''))return null;
  return {day:new Date(now).toISOString().slice(0,10),page,channel:sourceChannel(request.headers.get('referer'),origin)};
}
export function collectSeo(request:Request,response:Response,env:{DB:D1Database;TRAFFIC_ENABLED?:string;BETTER_AUTH_URL:string},ctx:{waitUntil(task:Promise<unknown>):void}) {
  if(env.TRAFFIC_ENABLED!=='true')return;
  const hit=seoHit(request,response,env.BETTER_AUTH_URL);if(!hit)return;
  ctx.waitUntil(env.DB.prepare(`INSERT INTO seo_views_daily(day,page,channel,views) VALUES(?,?,?,1)
    ON CONFLICT(day,page,channel) DO UPDATE SET views=min(1000000,views+1)`).bind(hit.day,hit.page,hit.channel).run().catch(()=>console.error(JSON.stringify({event:'seo_views_write_failed'}))));
}
export function vitalBucket(metric:Vital,value:number) {
  const [good,poor]=metric==='CLS'?[.1,.25]:metric==='LCP'?[2500,4000]:[200,500];
  return value<=good?'good':value<=poor?'needs-improvement':'poor';
}
const payload=z.object({page:z.string().max(100),metric:z.enum(['LCP','CLS','INP']),value:z.number().finite().nonnegative().max(3600000)}).strict();
export async function webVitalRequest(request:Request,env:{DB:D1Database;TRAFFIC_ENABLED?:string;BETTER_AUTH_URL:string}) {return respond(async()=>{
  if(request.method!=='POST'||request.headers.get('origin')!==env.BETTER_AUTH_URL||request.headers.get('sec-fetch-site')==='cross-site')throw new RequestFailure('FORBIDDEN');
  if(env.TRAFFIC_ENABLED!=='true'||bots.test(request.headers.get('user-agent')??''))return new Response(null,{status:204});
  const value=payload.safeParse(await boundedJson(request,512));
  if(!value.success)throw new RequestFailure('VALIDATION_ERROR');
  if(!seoPage(value.data.page)&&value.data.page!=='/explorer/video'||value.data.metric==='CLS'&&value.data.value>100)throw new RequestFailure('VALIDATION_ERROR');
  const {page,metric,value:amount}=value.data,day=new Date().toISOString().slice(0,10);
  await env.DB.prepare(`INSERT INTO seo_vitals_daily(day,page,metric,bucket,samples) VALUES(?,?,?,?,1)
    ON CONFLICT(day,page,metric,bucket) DO UPDATE SET samples=min(1000000,samples+1)`).bind(day,seoPage(page)??page,metric,vitalBucket(metric,amount)).run();
  return new Response(null,{status:204});
});}
export async function seoSummary(db:D1Database,enabled:boolean,now=Date.now()) {
  const from=new Date(now-29*86400_000).toISOString().slice(0,10),until=new Date(now).toISOString().slice(0,10);
  const [pages,channels,vitals,first]=await Promise.all([
    db.prepare('SELECT page,sum(views) AS views FROM seo_views_daily WHERE day BETWEEN ? AND ? GROUP BY page ORDER BY views DESC,page').bind(from,until).all<{page:string;views:number}>(),
    db.prepare('SELECT channel,sum(views) AS views FROM seo_views_daily WHERE day BETWEEN ? AND ? GROUP BY channel ORDER BY views DESC,channel').bind(from,until).all<{channel:Channel;views:number}>(),
    db.prepare('SELECT page,metric,bucket,sum(samples) AS samples FROM seo_vitals_daily WHERE day BETWEEN ? AND ? GROUP BY page,metric,bucket ORDER BY page,metric,bucket').bind(from,until).all<{page:string;metric:Vital;bucket:string;samples:number}>(),
    db.prepare('SELECT min(day) AS day FROM seo_views_daily').first<{day:string|null}>(),
  ]);
  return {from,until,enabled,firstDay:first?.day??null,pages:pages.results,channels:channels.results,vitals:vitals.results};
}
export type SeoSummary=Awaited<ReturnType<typeof seoSummary>>;
export async function purgeSeo(db:D1Database,now=Date.now()) {
  const cutoff=new Date(now-30*86400_000).toISOString().slice(0,10);
  await db.batch([db.prepare('DELETE FROM seo_views_daily WHERE day<?').bind(cutoff),db.prepare('DELETE FROM seo_vitals_daily WHERE day<?').bind(cutoff)]);
}
