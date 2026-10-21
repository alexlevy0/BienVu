import {browserPushConfigured,sendOperationalPush,type BrowserPushEnvironment} from '@bienvu/notifications';
import {expirePushEndpoint} from '@bienvu/db';
import {staffEmails} from './admin-audience';
import {AlertRules,defaultAlertRules,workspaceDocument} from './admin-workspace';
import {retryIdempotentD1} from './d1-retry';

type Env=Omit<BrowserPushEnvironment,'DB'>&{DB:D1Database;SUPER_ADMIN_EMAIL?:string;ADMIN_EMAIL?:string};
export async function evaluateAdminAlerts(db:D1Database,now=Date.now()){
 const at=new Date(now).toISOString(),saved=await workspaceDocument(db,'rules:alerts'),rules=AlertRules.parse(saved?.value??defaultAlertRules);
 const conditions:{rule:string;title:string;body:string;href:string}[]=[];
 if(rules.enabled){
  const cutoff=new Date(now-rules.stallMinutes*60000).toISOString();
  const [stalled,queue,recent,balance]=await Promise.all([
   db.prepare("SELECT count(*) AS n FROM jobs WHERE status NOT IN ('ready','failed') AND updated_at<?").bind(cutoff).first<{n:number}>(),
   db.prepare("SELECT count(*) AS n FROM generation_queue WHERE state='waiting' AND created_at<?").bind(cutoff).first<{n:number}>(),
   db.prepare("SELECT count(*) AS n,sum(status='failed') AS failed FROM jobs WHERE created_at>=? AND status IN ('ready','failed')").bind(new Date(now-30*60000).toISOString()).first<{n:number;failed:number}>(),
   db.prepare("SELECT available_credits AS credits FROM runway_available_balance").first<{credits:number|null}>(),
  ]);
  if(stalled?.n)conditions.push({rule:'stalled',title:'Générations à vérifier',body:`${stalled.n} génération(s) sans changement depuis ${rules.stallMinutes} minutes.`,href:'/admin?view=overview'});
  if(queue?.n)conditions.push({rule:'queue',title:'Attente inhabituelle',body:`${queue.n} entrée(s) en file depuis plus de ${rules.stallMinutes} minutes.`,href:'/admin?view=providers'});
  if(recent&&recent.n>=rules.minimumJobs&&recent.failed/recent.n*100>=rules.failurePercent)conditions.push({rule:'failures',title:'Hausse des échecs',body:`${recent.failed} échecs sur ${recent.n} générations terminées, créées dans les 30 dernières minutes.`,href:'/admin?view=incidents'});
  if(balance?.credits!==null&&balance?.credits!==undefined&&balance.credits<rules.runwayCredits)conditions.push({rule:'runway',title:'Réserve Runway faible',body:`Dernière réserve utilisable connue : ${balance.credits} crédits API. Vérifiez le solde avant de recharger.`,href:'/admin?view=providers'});
  if(!balance){
   // A stale/missing measurement is not evidence that the balance recovered.
   const open=await db.prepare("SELECT 1 FROM admin_alerts WHERE rule='runway' AND resolved_at IS NULL").first();
   if(open)conditions.push({rule:'runway',title:'Solde Runway à revérifier',body:'La dernière réserve était faible et aucune mesure récente ne permet de confirmer son rétablissement.',href:'/admin?view=providers'});
  }
 }
 // Conditional writes remain safe if scheduled invocations overlap.
 const statements=[
  ...conditions.map(c=>db.prepare(`INSERT INTO admin_alerts(id,rule,title,body,href,opened_at,last_seen_at) VALUES(?,?,?,?,?,?,?)
   ON CONFLICT(rule) WHERE resolved_at IS NULL DO UPDATE SET title=excluded.title,body=excluded.body,last_seen_at=excluded.last_seen_at`).bind(crypto.randomUUID(),c.rule,c.title,c.body,c.href,at,at)),
  db.prepare('UPDATE admin_alerts SET resolved_at=? WHERE resolved_at IS NULL AND rule NOT IN (SELECT value FROM json_each(?))').bind(at,JSON.stringify(conditions.map(c=>c.rule))),
 ];
 // Reuse the same IDs and timestamp if D1 committed but lost its response.
 await retryIdempotentD1(()=>db.batch(statements));
 return rules;
}
export async function runAdminAlerts(env:Env,now=Date.now(),fetcher:typeof fetch=fetch){
 const rules=await evaluateAdminAlerts(env.DB,now);if(!rules.enabled||!browserPushConfigured(env))return;
 const db=env.DB,at=new Date(now).toISOString(),cooldown=new Date(now-rules.cooldownMinutes*60000).toISOString(),staff=JSON.stringify(staffEmails(env));
 await db.prepare(`INSERT INTO admin_alert_deliveries(alert_id,endpoint_hash,retry_at)
  SELECT a.id,d.endpoint_hash,? FROM admin_alerts a JOIN browser_push_devices d ON d.principal_kind='user' AND d.enabled=1 AND d.expires_at>?
  JOIN auth_user u ON u.id=d.principal_id AND u.emailVerified=1
  JOIN admin_workspace_documents p ON p.key='preferences:'||u.id AND json_extract(p.body_json,'$.alerts')=1
  WHERE lower(u.email) IN (SELECT value FROM json_each(?)) AND a.resolved_at IS NULL
  AND NOT EXISTS(SELECT 1 FROM admin_alert_deliveries old JOIN admin_alerts previous ON previous.id=old.alert_id
    WHERE old.endpoint_hash=d.endpoint_hash AND old.state='sent' AND previous.rule=a.rule AND old.sent_at>?)
  ON CONFLICT(alert_id,endpoint_hash) DO NOTHING`).bind(at,at,staff,cooldown).run();
 const deliveries=(await db.prepare(`SELECT a.id,a.title,a.body,a.href,d.endpoint_hash AS endpoint,s.subscription_json AS subscription FROM admin_alert_deliveries d
  JOIN admin_alerts a ON a.id=d.alert_id AND a.resolved_at IS NULL JOIN browser_push_devices s ON s.endpoint_hash=d.endpoint_hash AND s.enabled=1 AND s.expires_at>?
  JOIN auth_user u ON u.id=s.principal_id AND u.emailVerified=1 AND s.principal_kind='user' AND lower(u.email) IN (SELECT value FROM json_each(?))
  JOIN admin_workspace_documents p ON p.key='preferences:'||u.id AND json_extract(p.body_json,'$.alerts')=1
  WHERE d.attempts<3 AND d.retry_at<=? AND (d.state='pending' OR (d.state='sending' AND d.lease_until<?)) ORDER BY a.opened_at LIMIT 8`).bind(at,staff,at,at).all<{id:string;title:string;body:string;href:string;endpoint:string;subscription:string}>()).results;
 for(const d of deliveries){
  const lease=crypto.randomUUID(),claim=await db.prepare("UPDATE admin_alert_deliveries SET state='sending',lease=?,lease_until=?,attempts=attempts+1 WHERE alert_id=? AND endpoint_hash=? AND attempts<3 AND (state='pending' OR (state='sending' AND lease_until<?)) RETURNING attempts")
   .bind(lease,new Date(now+60000).toISOString(),d.id,d.endpoint,at).first<{attempts:number}>();if(!claim)continue;
  let status:number|null=null;try{status=await sendOperationalPush(env,d.subscription,d,fetcher);}catch{/* Durable retry, never a generation error. */}
  if(status===404||status===410){await expirePushEndpoint(db,d.endpoint);continue;}
  const state=status!==null&&status>=200&&status<300?'sent':claim.attempts>=3||status!==null&&status>=400&&status<500&&status!==429?'failed':'pending';
  await db.prepare("UPDATE admin_alert_deliveries SET state=?,sent_at=CASE WHEN ?='sent' THEN ? ELSE sent_at END,lease=NULL,lease_until=NULL,retry_at=? WHERE alert_id=? AND endpoint_hash=? AND lease=?")
   .bind(state,state,at,new Date(now+5*60000).toISOString(),d.id,d.endpoint,lease).run();
 }
}
