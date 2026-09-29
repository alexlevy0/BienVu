import type {Database} from './index';

// Anchor every boundary to signup, rather than the previous (possibly clamped)
// month: January 31 -> February 28/29 -> March 31, at the same UTC time.
export function creditPeriod(signup:number,now=Date.now()) {
  const anchor=new Date(signup),date=new Date(now);
  if(!Number.isFinite(signup)||signup>now)throw new Error('INVALID_CREDIT_ANCHOR');
  const boundary=(n:number)=>{
    const m=anchor.getUTCMonth()+n,y=anchor.getUTCFullYear();
    const last=new Date(Date.UTC(y,m+1,0)).getUTCDate();
    return Date.UTC(y,m,Math.min(anchor.getUTCDate(),last),anchor.getUTCHours(),anchor.getUTCMinutes(),anchor.getUTCSeconds(),anchor.getUTCMilliseconds());
  };
  let n=(date.getUTCFullYear()-anchor.getUTCFullYear())*12+date.getUTCMonth()-anchor.getUTCMonth();
  if(boundary(n)>now)n--;
  return {from:new Date(boundary(n)).toISOString(),until:new Date(boundary(n+1)).toISOString()};
}
export type CreditGrant={id:string;kind:'trial'|'paid'|'free';remaining:number;renewalAt:string;enabled:number};
export async function creditGrant(db:Database,agencyId:string,now=Date.now()):Promise<CreditGrant|null> {
  const at=new Date(now).toISOString();
  const legacy=await db.prepare(`SELECT a.id,a.kind,max(0,a.quota_limit-a.reserved-a.consumed) AS remaining,a.valid_until AS renewalAt,g.enabled
    FROM generation_access g JOIN allocations a ON a.id=g.allocation_id AND a.agency_id=g.agency_id
    WHERE g.agency_id=? AND a.valid_from<=? AND a.valid_until>?`).bind(agencyId,at,at).first<CreditGrant>();
  if(legacy)return legacy;
  // Never hand out a free fallback around an existing subscription, even unpaid
  // or paused. Paid period/allocation management stays with the existing ledger.
  if(await db.prepare("SELECT 1 FROM subscriptions WHERE agency_id=? AND status NOT IN ('canceled','incomplete_expired')").bind(agencyId).first())return null;
  const user=await db.prepare(`SELECT u.createdAt FROM auth_user u JOIN agencies a ON a.owner_user_id=u.id
    WHERE a.id=? AND u.emailVerified=1`).bind(agencyId).first<{createdAt:number}>();
  if(!user)return null;
  const period=creditPeriod(user.createdAt,now);
  await db.prepare(`INSERT INTO allocations(id,agency_id,kind,period_key,quota_limit,valid_from,valid_until)
    SELECT ?,?,'free',?,free_monthly,?,? FROM trial_policy WHERE id=1 ON CONFLICT(agency_id,kind,period_key) DO NOTHING`)
    .bind(crypto.randomUUID(),agencyId,period.from,period.from,period.until).run();
  return db.prepare(`SELECT a.id,a.kind,max(0,a.quota_limit-a.reserved-a.consumed) AS remaining,a.valid_until AS renewalAt,p.free_enabled AS enabled
    FROM allocations a,trial_policy p WHERE a.agency_id=? AND a.kind='free' AND a.period_key=? AND p.id=1`)
    .bind(agencyId,period.from).first<CreditGrant>();
}
