import {opaqueHash} from './anonymous';
import type {Database} from './index';

export type PushPrincipal={kind:'user'|'trial';id:string};
export type StoredPushSubscription={endpoint:string;expirationTime:number|null;keys:{p256dh:string;auth:string}};
export type PushDelivery={endpointHash:string;jobId:string;subscription:string};
const iso=(at:number)=>new Date(at).toISOString();
// Rechecked at registration AND dispatch: team revocations and trial claims take effect immediately.
const permitted=`((d.principal_kind='user' AND EXISTS(SELECT 1 FROM agencies a WHERE a.id=g.owner_agency_id
  AND (a.owner_user_id=d.principal_id OR EXISTS(SELECT 1 FROM agency_members m WHERE m.agency_id=a.id AND m.user_id=d.principal_id))))
  OR (d.principal_kind='trial' AND g.owner_agency_id IS NULL AND g.anonymous_session_id=d.principal_id
  AND EXISTS(SELECT 1 FROM anonymous_sessions s WHERE s.id=d.principal_id AND s.expires_at>?)))`;

export async function savePushDevice(db:Database,principal:PushPrincipal,token:string,subscription:StoredPushSubscription,now=Date.now()){
  const hash=await opaqueHash(subscription.endpoint),tokenHash=await opaqueHash(token),at=iso(now);
  const row=await db.prepare(`INSERT INTO browser_push_devices(endpoint_hash,token_hash,principal_kind,principal_id,subscription_json,created_at,updated_at,expires_at)
    SELECT ?,?,?,?,?,?,?,? WHERE (SELECT count(*) FROM browser_push_devices WHERE principal_kind=? AND principal_id=? AND enabled=1 AND expires_at>?)<8
      OR EXISTS(SELECT 1 FROM browser_push_devices WHERE endpoint_hash=? AND token_hash=?)
    ON CONFLICT(endpoint_hash) DO UPDATE SET principal_kind=excluded.principal_kind,principal_id=excluded.principal_id,
      subscription_json=excluded.subscription_json,enabled=1,updated_at=excluded.updated_at,expires_at=excluded.expires_at
      WHERE browser_push_devices.token_hash=excluded.token_hash RETURNING endpoint_hash AS id`)
    .bind(hash,tokenHash,principal.kind,principal.id,JSON.stringify(subscription),at,at,iso(now+90*86400_000),principal.kind,principal.id,at,hash,tokenHash).first<{id:string}>();
  return row?.id??null;
}
export async function disablePushDevice(db:Database,token:string){
  await db.prepare('UPDATE browser_push_devices SET enabled=0 WHERE token_hash=? AND enabled=1').bind(await opaqueHash(token)).run();
}
export async function watchPushGeneration(db:Database,principal:PushPrincipal,token:string,jobId:string,now=Date.now()){
  const at=iso(now);
  const row=await db.prepare(`INSERT INTO browser_push_deliveries(endpoint_hash,job_id,retry_at,created_at,expires_at)
    SELECT d.endpoint_hash,g.job_id,?,?,? FROM browser_push_devices d,generation_runs g JOIN jobs j ON j.id=g.job_id
    WHERE d.token_hash=? AND d.principal_kind=? AND d.principal_id=? AND d.enabled=1 AND d.expires_at>?
      AND g.job_id=? AND g.retention='available' AND (g.expires_at IS NULL OR g.expires_at>?)
      AND j.status!='failed' AND g.created_at>? AND (j.status!='ready' OR j.updated_at>?) AND ${permitted}
    ON CONFLICT(endpoint_hash,job_id) DO NOTHING RETURNING job_id AS id`)
    .bind(at,at,iso(now+86400_000),await opaqueHash(token),principal.kind,principal.id,at,jobId,at,iso(now-86400_000),iso(now-600_000),at).first<{id:string}>();
  return Boolean(row);
}
export async function pendingPushDeliveries(db:Database,now=Date.now(),jobId?:string):Promise<PushDelivery[]>{
  const at=iso(now);
  const row=await db.prepare(`SELECT json_group_array(json_object('endpointHash',endpoint_hash,'jobId',job_id,'subscription',subscription_json)) AS items FROM (
    SELECT p.endpoint_hash,p.job_id,d.subscription_json FROM browser_push_deliveries p JOIN browser_push_devices d USING(endpoint_hash)
      JOIN generation_runs g ON g.job_id=p.job_id JOIN jobs j ON j.id=g.job_id
    WHERE p.status IN ('pending','sending') AND p.attempts<5 AND (p.lease_until IS NULL OR p.lease_until<=?) AND p.retry_at<=?
      AND p.expires_at>? AND d.enabled=1 AND d.expires_at>? AND j.status='ready' AND g.retention='available'
      AND (g.expires_at IS NULL OR g.expires_at>?) AND ${permitted} ${jobId?'AND p.job_id=?':''} ORDER BY p.created_at LIMIT 20)`)
    .bind(at,at,at,at,at,at,...(jobId?[jobId]:[])).first<{items:string}>();
  return JSON.parse(row?.items??'[]');
}
export async function claimPushDelivery(db:Database,delivery:PushDelivery,lease:string,now=Date.now()){
  return db.prepare(`UPDATE browser_push_deliveries SET status='sending',attempts=attempts+1,lease_token=?,lease_until=?
    WHERE endpoint_hash=? AND job_id=? AND status IN ('pending','sending') AND attempts<5 AND retry_at<=?
      AND (lease_until IS NULL OR lease_until<=?)
      AND EXISTS(SELECT 1 FROM browser_push_devices d,generation_runs g JOIN jobs j ON j.id=g.job_id
        WHERE d.endpoint_hash=browser_push_deliveries.endpoint_hash AND g.job_id=browser_push_deliveries.job_id
          AND d.enabled=1 AND d.expires_at>? AND j.status='ready' AND g.retention='available' AND ${permitted}) RETURNING attempts`)
    .bind(lease,iso(now+60_000),delivery.endpointHash,delivery.jobId,iso(now),iso(now),iso(now),iso(now)).first<{attempts:number}>();
}
export async function finishPushDelivery(db:Database,delivery:PushDelivery,lease:string,result:'sent'|'retry'|'failed',attempts:number,now=Date.now()){
  await db.prepare(`UPDATE browser_push_deliveries SET status=?,sent_at=?,lease_token=NULL,lease_until=NULL,retry_at=?
    WHERE endpoint_hash=? AND job_id=? AND lease_token=?`)
    .bind(result==='retry'&&attempts<5?'pending':result==='sent'?'sent':'failed',result==='sent'?iso(now):null,
      iso(now+[15_000,60_000,300_000,900_000,3600_000][Math.min(attempts-1,4)]),delivery.endpointHash,delivery.jobId,lease).run();
}
export async function expirePushEndpoint(db:Database,hash:string){await db.prepare('UPDATE browser_push_devices SET enabled=0 WHERE endpoint_hash=?').bind(hash).run();}
export async function cleanupPushDevices(db:Database,now=Date.now()){
  await db.prepare('DELETE FROM browser_push_deliveries WHERE expires_at<=?').bind(iso(now)).run();
  await db.prepare('DELETE FROM browser_push_devices WHERE expires_at<=? OR (enabled=0 AND updated_at<=?)').bind(iso(now),iso(now-86400_000)).run();
}
