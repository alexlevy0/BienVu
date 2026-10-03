import type {Database} from './index';
import {CreditHistory,CreditEntry,EntityId,Timestamp} from '@bienvu/contracts';

// Anchor every boundary to signup, rather than the previous (possibly clamped)
// month: January 31 -> February 28/29 -> March 31, at the same UTC time.
export function creditPeriod(signup:number|string,now=Date.now()) {
  // Better Auth writes ISO dates to D1; older direct fixtures use epoch milliseconds.
  const signupMs=typeof signup==='number'?signup:Date.parse(signup);
  if(!Number.isFinite(signupMs)||signupMs>now)throw new Error('INVALID_CREDIT_ANCHOR');
  const anchor=new Date(signupMs),date=new Date(now);
  const boundary=(n:number)=>{
    const m=anchor.getUTCMonth()+n,y=anchor.getUTCFullYear();
    const last=new Date(Date.UTC(y,m+1,0)).getUTCDate();
    return Date.UTC(y,m,Math.min(anchor.getUTCDate(),last),anchor.getUTCHours(),anchor.getUTCMinutes(),anchor.getUTCSeconds(),anchor.getUTCMilliseconds());
  };
  let n=(date.getUTCFullYear()-anchor.getUTCFullYear())*12+date.getUTCMonth()-anchor.getUTCMonth();
  if(boundary(n)>now)n--;
  return {from:new Date(boundary(n)).toISOString(),until:new Date(boundary(n+1)).toISOString()};
}
export async function creditBalance(db:Database,agencyId:string,now=Date.now()){
  EntityId.parse(agencyId);const grant=await monthlyCreditGrant(db,agencyId,now),at=new Date(now).toISOString();
  const usage=grant?await db.prepare('SELECT quota_limit AS total,reserved,consumed FROM allocations WHERE id=? AND agency_id=?')
    .bind(grant.id,agencyId).first<{total:number;reserved:number;consumed:number}>():null;
  const sources=await db.prepare(`SELECT coalesce(sum(IIF(purchased=1,available,0)),0) purchased,
    coalesce(sum(IIF(purchased=0,available,0)),0) monthly FROM spendable_credit_sources
    WHERE agency_id=? AND enabled=1 AND valid_from<=? AND valid_until>? AND (purchased=1 OR id=?)`)
    .bind(agencyId,at,at,grant?.id??'none').first<{purchased:number;monthly:number}>();
  const wallet=await db.prepare(`SELECT coalesce(sum(a.quota_limit),0) total,coalesce(sum(a.reserved),0) reserved,coalesce(sum(a.consumed),0) consumed
    FROM allocations a JOIN credit_topups t ON t.allocation_id=a.id AND t.agency_id=a.agency_id
    WHERE a.agency_id=? AND t.mode=(SELECT mode FROM credit_payment_policy WHERE id=1) AND a.valid_from<=? AND a.valid_until>?`)
    .bind(agencyId,at,at).first<{total:number;reserved:number;consumed:number}>();
  return {available:(sources?.monthly??0)+(sources?.purchased??0),reserved:(usage?.reserved??0)+(wallet?.reserved??0),
    consumed:(usage?.consumed??0)+(wallet?.consumed??0),total:(usage?.total??0)+(wallet?.total??0),
    renewalAt:grant?.renewalAt??null,kind:grant?.kind??(wallet?.total?'paid':null),purchasedAvailable:sources?.purchased??0,monthlyAvailable:sources?.monthly??0};
}
export async function creditHistory(db:Database,agencyId:string,cursor?:string,now=Date.now()){
  EntityId.parse(agencyId);let time='9999',id='~';
  if(cursor){try{if(cursor.length>512)throw 0;const parts=JSON.parse(atob(cursor));if(!Array.isArray(parts)||parts.length!==2)throw 0;
    time=Timestamp.parse(parts[0]);id=EntityId.parse(parts[1]);}catch{throw Error('INVALID_CREDIT_CURSOR');}}
  const result=await db.prepare(`SELECT json_group_array(json(record)) AS data FROM
    (SELECT json_object('id',g.job_id,'title',coalesce(json_extract(i.result_json,'$.facts.title.value'),'Votre annonce'),
      'at',g.created_at,'status',j.status,'reserved',r.credit_amount,
      'used',IIF(g.credit_version=1 AND g.anonymous_session_id IS NOT NULL,IIF(j.status='ready',1,0),r.credit_used),
      'refunded',IIF(j.status IN ('ready','failed'),r.credit_amount-IIF(g.credit_version=1 AND g.anonymous_session_id IS NOT NULL,IIF(j.status='ready',1,0),r.credit_used),0),
      'animations',IIF(g.reuse_pricing=1 AND j.status='failed',r.credit_used,max(0,r.credit_used-1)),'gift',IIF(g.credit_version=1 AND g.anonymous_session_id IS NOT NULL,json('true'),json('false'))) AS record
      FROM generation_runs g JOIN jobs j ON j.id=g.job_id JOIN reservations r ON r.job_id=g.job_id
      LEFT JOIN listing_imports i ON i.id=j.listing_id AND i.agency_id=g.agency_id
      WHERE g.owner_agency_id=? AND (g.created_at<? OR (g.created_at=? AND g.job_id<?)) ORDER BY g.created_at DESC,g.job_id DESC LIMIT 21)`)
    .bind(agencyId,time,time,id).first<{data:string}>();
  // SQLite IIF strips JSON's subtype; normalize the explicit gift scalar here.
  const data=(JSON.parse(result?.data??'[]') as Record<string,unknown>[]).map(row=>CreditEntry.parse({...row,gift:row.gift===true||row.gift==='true'||row.gift===1}));
  const page=data.slice(0,20),last=page.at(-1);
  return CreditHistory.parse({balance:await creditBalance(db,agencyId,now),entries:page,nextCursor:data.length>20&&last?btoa(JSON.stringify([last.at,last.id])):null});
}
export type CreditGrant={id:string;kind:'trial'|'paid'|'free';remaining:number;renewalAt:string|null;enabled:number};
export async function creditGrant(db:Database,agencyId:string,now=Date.now()):Promise<CreditGrant|null> {
  const monthly=await monthlyCreditGrant(db,agencyId,now),at=new Date(now).toISOString();
  const sources=await db.prepare(`SELECT coalesce(sum(available),0) remaining,(SELECT id FROM spendable_credit_sources
      WHERE agency_id=? AND enabled=1 AND available>0 AND valid_from<=? AND valid_until>? AND (purchased=1 OR id=?)
      ORDER BY purchased,valid_from,id LIMIT 1) id
    FROM spendable_credit_sources WHERE agency_id=? AND enabled=1 AND valid_from<=? AND valid_until>? AND (purchased=1 OR id=?)`)
    .bind(agencyId,at,at,monthly?.id??'none',agencyId,at,at,monthly?.id??'none').first<{id:string|null;remaining:number}>();
  if(sources?.id)return {id:sources.id,kind:monthly?.kind??'paid',remaining:sources.remaining,renewalAt:monthly?.renewalAt??null,enabled:1};
  return monthly?{...monthly,remaining:0}:null;
}
async function monthlyCreditGrant(db:Database,agencyId:string,now=Date.now()):Promise<CreditGrant|null> {
  const at=new Date(now).toISOString();
  const paid=await db.prepare(`SELECT a.id,a.kind,max(0,a.quota_limit-a.reserved-a.consumed) AS remaining,a.valid_until AS renewalAt,1 AS enabled FROM allocations a JOIN billing_invoices i ON i.allocation_id=a.id WHERE a.agency_id=? AND a.valid_from<=? AND a.valid_until>? AND i.mode=(SELECT mode FROM credit_payment_policy WHERE id=1) ORDER BY a.valid_from DESC LIMIT 1`).bind(agencyId,at,at).first<CreditGrant>();
  if(paid)return paid;
  const legacy=await db.prepare(`SELECT a.id,a.kind,max(0,a.quota_limit-a.reserved-a.consumed) AS remaining,a.valid_until AS renewalAt,g.enabled
    FROM generation_access g JOIN allocations a ON a.id=g.allocation_id AND a.agency_id=g.agency_id
    WHERE g.agency_id=? AND a.valid_from<=? AND a.valid_until>? AND NOT EXISTS(SELECT 1 FROM credit_topups t WHERE t.allocation_id=a.id)`).bind(agencyId,at,at).first<CreditGrant>();
  if(legacy)return legacy;
  // Never hand out a free fallback around an existing subscription, even unpaid
  // or paused. Paid period/allocation management stays with the existing ledger.
  if(await db.prepare("SELECT 1 FROM subscriptions WHERE agency_id=? AND status NOT IN ('canceled','incomplete_expired')").bind(agencyId).first())return null;
  const user=await db.prepare(`SELECT u.createdAt FROM auth_user u JOIN agencies a ON a.owner_user_id=u.id
    WHERE a.id=? AND u.emailVerified=1`).bind(agencyId).first<{createdAt:number|string}>();
  if(!user)return null;
  const period=creditPeriod(user.createdAt,now);
  await db.prepare(`INSERT INTO allocations(id,agency_id,kind,period_key,quota_limit,valid_from,valid_until)
    SELECT ?,?,'free',?,free_monthly,?,? FROM trial_policy WHERE id=1 ON CONFLICT(agency_id,kind,period_key) DO NOTHING`)
    .bind(crypto.randomUUID(),agencyId,period.from,period.from,period.until).run();
  return db.prepare(`SELECT a.id,a.kind,max(0,a.quota_limit-a.reserved-a.consumed) AS remaining,a.valid_until AS renewalAt,p.free_enabled AS enabled
    FROM allocations a,trial_policy p WHERE a.agency_id=? AND a.kind='free' AND a.period_key=? AND p.id=1`)
    .bind(agencyId,period.from).first<CreditGrant>();
}
