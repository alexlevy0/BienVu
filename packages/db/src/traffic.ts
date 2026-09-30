import type {AdminTraffic} from '@bienvu/contracts';
import type {Database} from './index';
export type PageHit={day:string;page:'home'|'login'|'explorer'|'offers'|'sources';country:string};
export async function recordPageHit(db:Database,hit:PageHit){
  await db.prepare(`INSERT INTO admin_traffic_daily(day,page,country,views) VALUES(?,?,?,1)
    ON CONFLICT(day,page,country) DO UPDATE SET views=min(1000000,views+1)`).bind(hit.day,hit.page,hit.country).run();
}
export async function purgeTraffic(db:Database,now=Date.now()){
  // 31 jours calendaires UTC : fenêtre de 30 jours + marge jusqu'au cron suivant.
  const cutoff=new Date(now-30*86400_000).toISOString().slice(0,10);
  await db.prepare('DELETE FROM admin_traffic_daily WHERE day<?').bind(cutoff).run();
}
export async function adminTraffic(db:Database,days:7|30,enabled:boolean,now=Date.now()):Promise<AdminTraffic>{
  const at=new Date(now).toISOString(),start=new Date(now-(days-1)*86400_000).toISOString().slice(0,10),end=at.slice(0,10);
  const stored=await db.prepare(`SELECT json_group_array(json_object('day',day,'page',page,'country',country,'views',views)) AS data
    FROM (SELECT day,page,country,views FROM admin_traffic_daily WHERE day>=? AND day<=? ORDER BY day,page,country)`).bind(start,end).first<{data:string}>();
  const all=JSON.parse(stored?.data??'[]') as {day:string;page:string;country:string;views:number}[];
  const daily=new Map<string,number>(),countries=new Map<string,number>(),pages=new Map<string,number>();
  for(let i=0;i<days;i++)daily.set(new Date(Date.parse(start)+i*86400_000).toISOString().slice(0,10),0);
  let total=0;for(const r of all){total+=r.views;daily.set(r.day,(daily.get(r.day)??0)+r.views);countries.set(r.country,(countries.get(r.country)??0)+r.views);pages.set(r.page,(pages.get(r.page)??0)+r.views);}
  const first=await db.prepare('SELECT min(day) AS day FROM admin_traffic_daily').first<{day:string|null}>();
  const sorted=(m:Map<string,number>)=>[...m].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0]));
  return {at,days,enabled,firstDay:first?.day??null,total,daily:[...daily].map(([day,views])=>({day,views})),countries:sorted(countries).map(([country,views])=>({country,views})),pages:sorted(pages).map(([page,views])=>({page,views}))};
}
