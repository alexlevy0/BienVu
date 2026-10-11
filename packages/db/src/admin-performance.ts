import {AdminPerformanceQuery,type AdminPerformanceDay,type AdminPerformanceTimeline} from '@bienvu/contracts';
import type {Database} from './index';

// Match the overview: creation to the original ready event, never updated_at.
export const readySecondsSql=`CASE WHEN j.status='ready' AND julianday(e.created_at)>=julianday(j.created_at)
  THEN round((julianday(e.created_at)-julianday(j.created_at))*86400,3) END`;

export async function adminPerformance(db:Database,days:7|30|90=30,now=Date.now()):Promise<AdminPerformanceTimeline>{
  AdminPerformanceQuery.parse({section:'performance',days:String(days)});
  const at=new Date(now).toISOString(),from=new Date(now-(days-1)*86400_000).toISOString().slice(0,10),until=at.slice(0,10);
  const stored=await db.prepare(`SELECT json_group_array(json_object('day',day,'ready',ready,'measuredReady',measuredReady,
    'averageSeconds',averageSeconds,'minSeconds',minSeconds,'maxSeconds',maxSeconds)) AS data FROM (
    SELECT day,count(*) AS ready,count(seconds) AS measuredReady,avg(seconds) AS averageSeconds,min(seconds) AS minSeconds,max(seconds) AS maxSeconds
    FROM (SELECT substr(j.created_at,1,10) AS day,${readySecondsSql} AS seconds FROM jobs j
      LEFT JOIN generation_events e ON e.job_id=j.id AND e.event='ready'
      WHERE j.status='ready' AND j.created_at>=? AND j.created_at<=?) GROUP BY day ORDER BY day)`)
    .bind(from,at).first<{data:string}>();
  const measured=new Map((JSON.parse(stored?.data??'[]') as AdminPerformanceDay[]).map(row=>[row.day,row]));
  const daily=Array.from({length:days},(_,i)=>{
    const day=new Date(Date.parse(from+'T00:00:00Z')+i*86400_000).toISOString().slice(0,10);
    return measured.get(day)??{day,ready:0,measuredReady:0,averageSeconds:null,minSeconds:null,maxSeconds:null};
  });
  const ready=daily.reduce((sum,row)=>sum+row.ready,0),measuredReady=daily.reduce((sum,row)=>sum+row.measuredReady,0);
  const totalSeconds=daily.reduce((sum,row)=>sum+(row.averageSeconds??0)*row.measuredReady,0);
  return {at,from,until,days,ready,measuredReady,averageSeconds:measuredReady?totalSeconds/measuredReady:null,daily};
}
