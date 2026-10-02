import {AdminQuery,AdminAction,EntityId,type AdminRow,type AdminPage,type AdminOverview,type AdminVideoDetail,type AdminNarrationCall,type AdminSection} from '@bienvu/contracts';
import type {Database} from './index';

// Queries project explicit fields only. Auth tokens, passwords, IPs and storage
// credentials are never selected. Authorization is required by the web adapter.
async function rows(db:Database,sql:string,bindings:(string|number|null)[]=[]):Promise<AdminRow[]>{
  const fields=await db.prepare(`SELECT json_group_array(json(row)) AS data FROM (SELECT json_object(${sql.split('/*fields*/')[0]}) AS row ${sql.split('/*fields*/')[1]})`)
    .bind(...bindings).first<{data:string}>();
  return JSON.parse(fields?.data??'[]') as AdminRow[];
}
// Wrap an arbitrary fixed SELECT, preserving its field names through SQLite's
// JSON object builder. Columns are defined here, never supplied by the browser.
async function selectRows(db:Database,select:string,fields:string[],bindings:(string|number|null)[]=[]){
  return rows(db,fields.map(key=>`'${key}',${key}`).join(',')+'/*fields*/FROM ('+select+')',bindings);
}
const videoFields=['id','sortKey','createdAt','updatedAt','agencyId','agency','email','audience','status','stage','progress','attempt','error','title','locality','sourceUrl','sourceKind','retention','expiresAt','credit','creditsReserved','creditsUsed','creditsRefunded','creditGift','animationsRequested','public','duration','master','preview'];
const videos=`SELECT j.id,j.created_at AS sortKey,j.created_at AS createdAt,j.updated_at AS updatedAt,
  coalesce(g.owner_agency_id,j.agency_id) AS agencyId,coalesce(a.name,'Espace interne') AS agency,u.email,
  CASE WHEN g.anonymous_session_id IS NOT NULL AND g.owner_agency_id IS NULL THEN 'anonymous' WHEN u.id IS NOT NULL THEN 'account' ELSE 'internal' END AS audience,
  j.status,j.stage,j.progress_percent AS progress,j.attempt,j.error_code AS error,
  coalesce(json_extract(l.facts_json,'$.title.value'),json_extract(i.result_json,'$.facts.title.value'),'Vidéo archivée') AS title,
  coalesce(json_extract(l.facts_json,'$.locality.value'),json_extract(i.result_json,'$.facts.locality.value')) AS locality,
  j.source_url AS sourceUrl,coalesce(i.source_kind,l.source_kind,'url') AS sourceKind,g.retention,g.expires_at AS expiresAt,r.status AS credit,
  r.credit_amount AS creditsReserved,
  IIF(g.credit_version=1 AND g.anonymous_session_id IS NOT NULL,IIF(j.status='ready',1,0),r.credit_used) AS creditsUsed,
  IIF(j.status IN ('ready','failed'),r.credit_amount-IIF(g.credit_version=1 AND g.anonymous_session_id IS NOT NULL,IIF(j.status='ready',1,0),r.credit_used),0) AS creditsRefunded,
  (g.credit_version=1 AND g.anonymous_session_id IS NOT NULL) AS creditGift,g.animations_requested AS animationsRequested,
  EXISTS(SELECT 1 FROM generation_shares s WHERE s.job_id=j.id AND s.revoked_at IS NULL) AS public,
  json_extract(v.report_json,'$.durationSeconds') AS duration,
  IIF(j.status='ready' AND g.retention='available' AND g.expires_at>strftime('%Y-%m-%dT%H:%M:%fZ','now') AND v.object_key IS NOT NULL AND g.owner_agency_id IS NOT NULL AND (r.status='consumed' OR g.credit_version=1 AND g.anonymous_session_id IS NOT NULL),1,0) AS master,
  IIF(j.status='ready' AND g.retention='available' AND g.expires_at>strftime('%Y-%m-%dT%H:%M:%fZ','now') AND p.object_key IS NOT NULL,1,0) AS preview
  FROM jobs j LEFT JOIN generation_runs g ON g.job_id=j.id LEFT JOIN agencies a ON a.id=coalesce(g.owner_agency_id,j.agency_id)
  LEFT JOIN auth_user u ON u.id=a.owner_user_id LEFT JOIN reservations r ON r.job_id=j.id
  LEFT JOIN listings l ON l.id=j.listing_id AND l.agency_id=j.agency_id LEFT JOIN listing_imports i ON i.id=j.listing_id AND i.agency_id=j.agency_id
  LEFT JOIN generation_artifacts v ON v.job_id=j.id LEFT JOIN generation_previews p ON p.job_id=j.id`;
const sections:Record<AdminSection,{sql:string;fields:string[];search:string[];statuses:string[]}>= {
  videos:{sql:videos,fields:videoFields,search:['title','locality','email','agency','id','sourceUrl'],statuses:['ready','failed','active','account','anonymous','internal']},
  agencies:{sql:`SELECT a.id,a.created_at AS sortKey,a.created_at AS createdAt,a.updated_at AS updatedAt,a.id AS agencyId,a.name AS agency,u.email,u.name AS owner,a.city,a.email AS contactEmail,a.phone,a.website,a.brand_version AS brandVersion,
    coalesce(s.status,'none') AS status,s.plan_code AS plan,
    (SELECT count(*) FROM jobs j LEFT JOIN generation_runs g ON g.job_id=j.id WHERE coalesce(g.owner_agency_id,j.agency_id)=a.id) AS videos,
    (SELECT count(*) FROM jobs j LEFT JOIN generation_runs g ON g.job_id=j.id WHERE coalesce(g.owner_agency_id,j.agency_id)=a.id AND j.status='ready') AS ready,
    (SELECT max(j.created_at) FROM jobs j LEFT JOIN generation_runs g ON g.job_id=j.id WHERE coalesce(g.owner_agency_id,j.agency_id)=a.id) AS lastVideo
    FROM agencies a JOIN auth_user u ON u.id=a.owner_user_id LEFT JOIN subscriptions s ON s.agency_id=a.id`,
    fields:['id','sortKey','createdAt','updatedAt','agencyId','agency','email','owner','city','contactEmail','phone','website','brandVersion','status','plan','videos','ready','lastVideo'],search:['agency','email','owner','city','id'],statuses:['none','active','trialing','past_due','canceled','unpaid','paused','incomplete','incomplete_expired']},
  users:{sql:`SELECT u.id,CASE WHEN typeof(u.createdAt)='integer' THEN strftime('%Y-%m-%dT%H:%M:%fZ',u.createdAt/1000.0,'unixepoch') ELSE u.createdAt END AS sortKey,
    u.name,u.email,IIF(u.emailVerified=1,'verified','unverified') AS status,a.id AS agencyId,a.name AS agency,
    (SELECT group_concat(DISTINCT providerId) FROM auth_account WHERE userId=u.id) AS providers,
    (SELECT count(*) FROM auth_session WHERE userId=u.id AND CASE WHEN typeof(expiresAt)='integer' THEN expiresAt>? ELSE expiresAt>? END) AS sessions
    FROM auth_user u LEFT JOIN agencies a ON a.owner_user_id=u.id`,fields:['id','sortKey','name','email','status','agencyId','agency','providers','sessions'],search:['name','email','agency','id'],statuses:['verified','unverified']},
  quotas:{sql:`SELECT a.id,a.valid_from AS sortKey,a.agency_id AS agencyId,g.name AS agency,u.email,a.kind AS status,a.period_key AS period,a.quota_limit AS quota,a.consumed,a.reserved,
    max(0,a.quota_limit-a.consumed-a.reserved) AS remaining,a.valid_from AS start,a.valid_until AS end,
    s.plan_code AS plan,s.status AS subscriptionStatus,s.cancel_at_period_end AS cancelAtEnd
    FROM allocations a JOIN agencies g ON g.id=a.agency_id JOIN auth_user u ON u.id=g.owner_user_id LEFT JOIN subscriptions s ON s.agency_id=g.id`,
    fields:['id','sortKey','agencyId','agency','email','status','period','quota','consumed','reserved','remaining','start','end','plan','subscriptionStatus','cancelAtEnd'],search:['agency','email','plan','id'],statuses:['paid','free','trial','current']},
  subscriptions:{sql:`SELECT s.agency_id AS id,s.updated_at AS sortKey,s.agency_id AS agencyId,a.name AS agency,u.email,s.plan_code AS plan,s.status,
    s.period_start AS start,s.period_end AS end,s.cancel_at_period_end AS cancelAtEnd,s.sync_version AS syncVersion
    FROM subscriptions s JOIN agencies a ON a.id=s.agency_id JOIN auth_user u ON u.id=a.owner_user_id`,
    fields:['id','sortKey','agencyId','agency','email','plan','status','start','end','cancelAtEnd','syncVersion'],search:['agency','email','plan','id'],statuses:['active','trialing','past_due','unpaid','canceled','paused','incomplete','incomplete_expired']},
  imports:{sql:`SELECT i.id,i.created_at AS sortKey,i.agency_id AS agencyId,a.name AS agency,u.email,i.source_kind AS sourceKind,i.source_url AS sourceUrl,
    IIF(i.draft_pending=1 AND i.status='importing','draft',i.status) AS status,i.error_code AS error,i.expires_at AS expiresAt,
    coalesce(json_extract(i.result_json,'$.facts.title.value'),json_extract(d.data_json,'$.fields.title'),'Votre annonce') AS title,
    (SELECT count(*) FROM import_objects WHERE import_id=i.id) AS photos
    FROM listing_imports i JOIN agencies a ON a.id=i.agency_id LEFT JOIN auth_user u ON u.id=a.owner_user_id LEFT JOIN creation_drafts d ON d.id=i.id`,
    fields:['id','sortKey','agencyId','agency','email','sourceKind','sourceUrl','status','error','expiresAt','title','photos'],search:['agency','email','title','sourceUrl','id'],statuses:['draft','ready','failed','importing','deleting']},
  reports:{sql:`SELECT r.id,r.created_at AS sortKey,r.job_id AS jobId,coalesce(g.owner_agency_id,j.agency_id) AS agencyId,a.name AS agency,r.category,r.comment,r.status,j.status AS videoStatus
    FROM generation_reports r JOIN jobs j ON j.id=r.job_id LEFT JOIN generation_runs g ON g.job_id=j.id LEFT JOIN agencies a ON a.id=coalesce(g.owner_agency_id,j.agency_id)`,
    fields:['id','sortKey','jobId','agencyId','agency','category','comment','status','videoStatus'],search:['agency','comment','jobId','id'],statuses:['new','reviewing','closed']},
  audit:{sql:`SELECT h.id,h.created_at AS sortKey,h.actor_user_id AS actorId,u.email AS actor,h.action AS status,h.target_id AS target,h.before_value AS before,h.after_value AS after,h.reason
    FROM admin_audit h LEFT JOIN auth_user u ON u.id=h.actor_user_id`,fields:['id','sortKey','actorId','actor','status','target','before','after','reason'],search:['actor','target','reason','id'],statuses:['generation_gate','report_status','quota','monthly_budget']},
};
export async function adminPage(db:Database,input:AdminQuery,now=Date.now()):Promise<AdminPage>{
  const query=AdminQuery.parse(input),def=sections[query.section];
  if(query.status&&!def.statuses.includes(query.status))throw new Error('ADMIN_INVALID_QUERY');
  const params:(string|number|null)[]=query.section==='users'?[now,new Date(now).toISOString()]:[],where=['1=1'];
  if(query.q){where.push('('+def.search.map(key=>`coalesce(${key},'') LIKE ? ESCAPE '\\'`).join(' OR ')+')');
    const pattern='%'+query.q.replace(/[\\%_]/g,'\\$&')+'%';params.push(...def.search.map(()=>pattern));}
  if(query.agency){if(query.section==='audit')throw new Error('ADMIN_INVALID_QUERY');where.push('agencyId=?');params.push(query.agency);}
  if(query.from){where.push('sortKey>=?');params.push(query.from+'T00:00:00.000Z');}
  if(query.to){where.push('sortKey<?');params.push(new Date(Date.parse(query.to+'T00:00:00Z')+86400_000).toISOString());}
  if(query.status){
    if(query.section==='videos'&&query.status==='active')where.push("status NOT IN ('ready','failed')");
    else if(query.section==='videos'&&['account','anonymous','internal'].includes(query.status)){where.push('audience=?');params.push(query.status);}
    else if(query.section==='quotas'&&query.status==='current'){where.push('start<=? AND end>?');params.push(new Date(now).toISOString(),new Date(now).toISOString());}
    else{where.push('status=?');params.push(query.status);}
  }
  const fingerprint=JSON.stringify({...query,cursor:undefined}),base=`FROM (${def.sql}) WHERE ${where.join(' AND ')}`;
  const count=await db.prepare(`SELECT count(*) AS total ${base}`).bind(...params).first<{total:number}>();
  let seek='';
  if(query.cursor){try{const cursor=JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(query.cursor),c=>c.charCodeAt(0)))) as unknown;
    if(!Array.isArray(cursor)||cursor.length!==3||cursor[0]!==fingerprint||typeof cursor[1]!=='string'||cursor[1].length>40||!EntityId.safeParse(cursor[2]).success)throw 0;
    seek=' AND (sortKey<? OR (sortKey=? AND id<?))';params.push(cursor[1],cursor[1],cursor[2]);
  }catch{throw new Error('ADMIN_INVALID_QUERY');}}
  const page=await selectRows(db,`SELECT * ${base}${seek} ORDER BY sortKey DESC,id DESC LIMIT 31`,def.fields,params),last=page[29];
  return {rows:page.slice(0,30),total:count?.total??0,nextCursor:page.length>30&&last?btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify([fingerprint,last.sortKey,last.id])))):null};
}
// Metrics are explicitly projected, never the provider payload, prompt or assets.
// Old/failed calls with missing metrics remain unknown, rather than free.
const metricNumber=(path:string)=>`CASE WHEN json_type(result_json,'${path}')='integer' AND json_extract(result_json,'${path}') BETWEEN 0 AND 9007199254740991 THEN json_extract(result_json,'${path}') END`;
const callFields=['id','provider','mode','state','error','reservedCents','at','step','model','voice','requestId','providerRequestId','responseId','requestDurationMs','inputTokens','outputTokens','cachedInputTokens','inputCharacters','inputUtf8Bytes','currency','priceDate','estimatedMicros'];
const callMetrics=`SELECT id,provider,provider_mode AS mode,state,error_code AS error,reservation_cents AS reservedCents,created_at AS at,step_key AS step,
  coalesce(json_extract(result_json,'$.metrics.model'),json_extract(result_json,'$.metrics.config.model')) AS model,json_extract(result_json,'$.metrics.config.voice') AS voice,
  json_extract(result_json,'$.metrics.requestId') AS requestId,json_extract(result_json,'$.metrics.providerRequestId') AS providerRequestId,
  json_extract(result_json,'$.metrics.responseId') AS responseId,${metricNumber('$.metrics.requestDurationMs')} AS requestDurationMs,
  ${metricNumber('$.metrics.usage.inputTokens')} AS inputTokens,${metricNumber('$.metrics.usage.outputTokens')} AS outputTokens,
  ${metricNumber('$.metrics.usage.cachedInputTokens')} AS cachedInputTokens,${metricNumber('$.metrics.usage.inputCharacters')} AS inputCharacters,${metricNumber('$.metrics.usage.inputUtf8Bytes')} AS inputUtf8Bytes,
  CASE WHEN json_extract(result_json,'$.metrics.cost.currency')='USD' THEN 'USD' END AS currency,
  json_extract(result_json,'$.metrics.cost.priceDate') AS priceDate,
  CASE WHEN provider_mode='real' AND json_extract(result_json,'$.metrics.cost.currency')='USD' THEN
    CASE WHEN provider='openai' THEN ${metricNumber('$.metrics.cost.estimatedMicrosBeforeCacheDiscount')}
      WHEN provider IN ('google','fish') THEN ${metricNumber('$.metrics.cost.estimatedMicrosBeforeFreeTier')} END END AS estimatedMicros
  FROM narration_calls`;
export async function adminVideoDetail(db:Database,id:string):Promise<AdminVideoDetail|null>{
  EntityId.parse(id);
  const video=(await selectRows(db,`SELECT * FROM (${videos}) WHERE id=?`,videoFields,[id]))[0];if(!video)return null;
  const [events,reports,calls,animations]=await Promise.all([
    selectRows(db,'SELECT event,created_at AS at FROM generation_events WHERE job_id=? ORDER BY created_at LIMIT 30',['event','at'],[id]),
    selectRows(db,'SELECT id,category,comment,status,created_at AS at FROM generation_reports WHERE job_id=? ORDER BY created_at DESC LIMIT 30',['id','category','comment','status','at'],[id]),
    selectRows(db,callMetrics+' WHERE job_id=? ORDER BY created_at,id',callFields,[id]),
    selectRows(db,`SELECT id,photo_id AS photoId,mode,model,state,task_id AS taskId,error_code AS error,
      credits,reserved_cents AS reservedCents,created_at AS at FROM photo_animations WHERE job_id=? ORDER BY slot`,
      ['id','photoId','mode','model','state','taskId','error','credits','reservedCents','at'],[id]),
  ]);return {video,events,reports,calls:calls as AdminNarrationCall[],animations};
}
export async function adminOverview(db:Database,config:AdminOverview['config'],now=Date.now()):Promise<AdminOverview>{
  const at=new Date(now).toISOString(),month=at.slice(0,7);
  const [counts,statuses,daily,errors,providers,budget,narrationBudget,costs,storage,control,policy,performance,monthlyCosts]=await Promise.all([
    db.prepare(`SELECT (SELECT count(*) FROM auth_user) AS users,(SELECT count(*) FROM auth_user WHERE emailVerified=1) AS verifiedUsers,
      (SELECT count(*) FROM auth_user WHERE emailVerified=0) AS unverifiedUsers,
      (SELECT count(*) FROM agencies a JOIN auth_user u ON u.id=a.owner_user_id) AS agencies,
      (SELECT count(*) FROM anonymous_sessions) AS anonymousSessions,(SELECT count(*) FROM jobs) AS videos,
      (SELECT count(*) FROM jobs WHERE status='ready') AS ready,(SELECT count(*) FROM jobs WHERE status='failed') AS failed,
      (SELECT count(*) FROM jobs WHERE status NOT IN ('ready','failed')) AS active,
      (SELECT count(*) FROM subscriptions WHERE status='active') AS activeSubscriptions,
      (SELECT count(*) FROM subscriptions WHERE status IN ('past_due','unpaid')) AS delinquentSubscriptions,
      (SELECT count(*) FROM generation_shares WHERE revoked_at IS NULL) AS publicVideos,
      (SELECT count(*) FROM generation_reports WHERE status!='closed') AS openReports,
      (SELECT count(*) FROM creation_drafts WHERE state='needs_input') AS drafts,
      (SELECT count(*) FROM generation_runs WHERE retention='expired') AS expired,
      (SELECT count(*) FROM jobs WHERE status NOT IN ('ready','failed') AND lease_until<?) AS overdue,
      (SELECT count(*) FROM jobs WHERE created_at>=?) AS today,
      (SELECT count(*) FROM jobs WHERE status='failed' AND created_at>=?) AS failedToday,
      (SELECT count(*) FROM import_usage WHERE day=?) AS importDays,
      (SELECT coalesce(sum(attempts),0) FROM import_usage WHERE day=?) AS importsToday,
      (SELECT coalesce(sum(attempts),0) FROM import_usage WHERE substr(day,1,7)=?) AS importsMonth`).bind(at,at.slice(0,10),at.slice(0,10),at.slice(0,10),at.slice(0,10),month).first<Record<string,number>>(),
    selectRows(db,'SELECT status,count(*) AS count FROM jobs GROUP BY status ORDER BY count DESC',['status','count']),
    selectRows(db,`SELECT substr(created_at,1,10) AS day,count(*) AS total,sum(status='ready') AS ready,sum(status='failed') AS failed FROM jobs WHERE created_at>=? GROUP BY day ORDER BY day`,['day','total','ready','failed'],[new Date(now-13*86400_000).toISOString().slice(0,10)]),
    selectRows(db,`SELECT code,stage,sum(n) AS count FROM (SELECT error_code AS code,stage,count(*) AS n FROM jobs WHERE error_code IS NOT NULL GROUP BY error_code,stage UNION ALL SELECT error_code,'importing',count(*) FROM listing_imports WHERE error_code IS NOT NULL GROUP BY error_code) GROUP BY code,stage ORDER BY count DESC LIMIT 20`,['code','stage','count']),
    selectRows(db,'SELECT provider,provider_mode AS mode,state,count(*) AS calls,sum(reservation_cents) AS reservedCents FROM narration_calls WHERE month=? GROUP BY provider,provider_mode,state',['provider','mode','state','calls','reservedCents'],[month]),
    db.prepare(`SELECT b.month,b.baseline_cents AS baselineCents,b.ceiling_cents AS ceilingCents,b.paused,
      coalesce(s.envelope_cents,b.ceiling_cents+500) AS envelopeCents,coalesce(s.revision,0) AS revision,
      (SELECT coalesce(sum(reserved_cents),0) FROM hosted_import_costs WHERE month=b.month) AS importsCents
      FROM hosted_import_budget b LEFT JOIN monthly_budget_settings s ON s.month=b.month WHERE b.month=?`).bind(month).first<NonNullable<AdminOverview['budget']>>(),
    db.prepare(`SELECT month,envelope_cents AS envelopeCents,paused,(SELECT coalesce(sum(reservation_cents),0) FROM narration_calls WHERE month=b.month AND provider_mode='real') AS reservedCents FROM narration_budget b WHERE month=?`).bind(month).first<NonNullable<AdminOverview['narrationBudget']>>(),
    selectRows(db,'SELECT currency,kind,sum(amount_micros) AS amountMicros,count(*) AS events FROM cost_events WHERE substr(created_at,1,7)=? GROUP BY currency,kind',['currency','kind','amountMicros','events'],[month]),
    selectRows(db,`SELECT kind,sum(bytes) AS bytes,sum(objects) AS objects FROM (SELECT kind,sum(size_bytes) AS bytes,count(*) AS objects FROM media_assets GROUP BY kind UNION ALL SELECT 'photo',sum(json_extract(photo_json,'$.sizeBytes')),count(*) FROM import_objects) GROUP BY kind`,['kind','bytes','objects']),
    db.prepare("SELECT enabled,updated_at AS updatedAt FROM generation_control WHERE id='generations'").first<AdminOverview['control']>(),
    db.prepare('SELECT enabled,free_enabled,free_monthly,global_daily,global_monthly,session_daily,ip_daily,render_concurrency,retention_hours,budget_ceiling_cents FROM trial_policy WHERE id=1').first<AdminOverview['policy']>(),
    db.prepare(`SELECT 30 AS days,count(*) AS total,coalesce(sum(status='ready'),0) AS ready,coalesce(sum(status='failed'),0) AS failed,
      coalesce(sum(status NOT IN ('ready','failed')),0) AS active,count(seconds) AS measuredReady,avg(seconds) AS averageSeconds FROM (
        SELECT j.status,CASE WHEN j.status='ready' AND julianday(e.created_at)>=julianday(j.created_at) THEN round((julianday(e.created_at)-julianday(j.created_at))*86400,3) END AS seconds
        FROM jobs j LEFT JOIN generation_events e ON e.job_id=j.id AND e.event='ready' WHERE j.created_at>=? AND j.created_at<=?)`)
      .bind(new Date(now-29*86400_000).toISOString().slice(0,10),at).first<AdminOverview['performance']>(),
    selectRows(db,`SELECT provider,sum(mode='real') AS realCalls,sum(mode='real' AND estimatedMicros IS NOT NULL) AS measuredCalls,
      sum(mode='mock') AS mockCalls,sum(mode='real' AND state='failed') AS failedCalls,
      sum(CASE WHEN mode='real' THEN estimatedMicros END) AS amountMicros
      FROM (${callMetrics}) WHERE substr(at,1,7)=? GROUP BY provider ORDER BY provider`,['provider','realCalls','measuredCalls','mockCalls','failedCalls','amountMicros'],[month]),
  ]);
  // Fixed SELECT projections above define these shapes, not provider JSON.
  return {at,counts:counts??{},statuses:statuses as AdminOverview['statuses'],daily:daily as AdminOverview['daily'],errors:errors as AdminOverview['errors'],providers:providers as AdminOverview['providers'],budget,narrationBudget,costs:costs as AdminOverview['costs'],storage:storage as AdminOverview['storage'],control,policy,config,
    performance:performance??{days:30,total:0,ready:0,failed:0,active:0,measuredReady:0,averageSeconds:null},monthlyCosts:monthlyCosts as AdminOverview['monthlyCosts']};
}
export async function adminAction(db:Database,actorId:string,input:AdminAction,now=Date.now()){
  const action=AdminAction.parse(input),id=crypto.randomUUID();
  const target=action.action==='generation_gate'?'generations':action.action==='monthly_budget'?action.month:action.id;
  let before=String(action.action==='generation_gate'?Number(action.expected):action.expected);
  if(action.action==='monthly_budget'&&action.expected!==null){
    const previous=await db.prepare(`SELECT b.baseline_cents AS baselineCents,b.ceiling_cents AS ceilingCents,b.paused,
      coalesce(s.envelope_cents,b.ceiling_cents+500) AS envelopeCents FROM hosted_import_budget b
      LEFT JOIN monthly_budget_settings s ON s.month=b.month WHERE b.month=?`).bind(action.month).first<Record<string,number>>();
    before=JSON.stringify({...previous,revision:action.expected});
  }
  const after=action.action==='monthly_budget'?JSON.stringify({envelopeCents:action.envelopeCents,ceilingCents:action.ceilingCents,openingCents:action.openingCents,paused:Number(action.paused)}):String(action.action==='generation_gate'?Number(action.enabled):action.action==='quota'?action.limit:action.status);
  await db.prepare('INSERT INTO admin_audit(id,actor_user_id,action,target_id,before_value,after_value,reason,created_at) VALUES(?,?,?,?,?,?,?,?)')
    .bind(id,actorId,action.action,target,before,after,action.reason,new Date(now).toISOString()).run();
  return {id};
}
