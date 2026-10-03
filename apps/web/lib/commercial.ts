type Revenue={mode:'test'|'live';invoices:number;payingAgencies:number;revenueHtCents:number;collectedCents:number};
type Trial=Record<'requested'|'ready'|'claimed'|'downloaded',number|null>;
type Accounts=Record<'signedUp'|'verified'|'createdVideo'|'paid',number|null>;
type Cost={currency:string;kind:string;events:number;amountMicros:number};
type Animations=Record<'requested'|'reused'|'newReady'|'uncertain',number>;
type Agency={id:string;name:string;members:number;projects:number;revenueHtCents:number;ready:number};
export async function commercialSummary(db:D1Database,now=Date.now()){
 const until=new Date(now).toISOString(),since=new Date(now-30*86400_000).toISOString();
 const [revenue,trial,accounts,costs,animations,agencies]=await Promise.all([
 db.prepare("SELECT mode,count(*) invoices,count(DISTINCT agency_id) payingAgencies,coalesce(sum(CAST(revenue_ht_cents*(max(0,gross_cents-refunded_cents-lost_cents))/gross_cents AS INTEGER)),0) revenueHtCents,coalesce(sum(max(0,gross_cents-refunded_cents-lost_cents)),0) collectedCents FROM financial_receipts WHERE paid_at>=? AND paid_at<=? GROUP BY mode").bind(since,until).all<Revenue>(),
 db.prepare("SELECT count(*) requested,sum(j.status='ready') ready,sum(j.status='ready' AND g.claimed_at IS NOT NULL) claimed,sum(j.status='ready' AND EXISTS(SELECT 1 FROM generation_events e WHERE e.job_id=j.id AND e.event='download')) downloaded FROM generation_runs g JOIN jobs j ON j.id=g.job_id WHERE g.anonymous_session_id IS NOT NULL AND g.created_at>=? AND g.created_at<=?").bind(since,until).first<Trial>(),
 db.prepare("SELECT count(*) signedUp,sum(u.emailVerified=1) verified,sum(EXISTS(SELECT 1 FROM generation_runs g JOIN jobs j ON j.id=g.job_id WHERE g.owner_agency_id=a.id AND j.status='ready')) createdVideo,sum(EXISTS(SELECT 1 FROM financial_receipts i WHERE i.agency_id=a.id AND i.mode='live')) paid FROM agencies a JOIN auth_user u ON u.id=a.owner_user_id WHERE u.createdAt>=? AND u.createdAt<=?").bind(since,until).first<Accounts>(),
 db.prepare("SELECT currency,kind,count(*) events,sum(amount_micros) amountMicros FROM cost_events WHERE created_at>=? AND created_at<=? GROUP BY currency,kind").bind(since,until).all<Cost>(),
 db.prepare("SELECT coalesce(sum(g.animations_requested),0) requested,coalesce(sum(g.animations_reused),0) reused,(SELECT count(*) FROM photo_animations WHERE mode='real' AND state='ready' AND created_at>=? AND created_at<=?) newReady,(SELECT count(*) FROM photo_animations WHERE mode='real' AND state='uncertain' AND created_at>=? AND created_at<=?) uncertain FROM generation_runs g WHERE g.created_at>=? AND g.created_at<=?").bind(since,until,since,until,since,until).first<Animations>(),
 db.prepare("SELECT a.id,a.name,(SELECT count(*) FROM agency_members m WHERE m.agency_id=a.id) members,(SELECT count(*) FROM property_projects p WHERE p.agency_id=a.id) projects,(SELECT coalesce(sum(CAST(i.revenue_ht_cents*(max(0,i.gross_cents-i.refunded_cents-i.lost_cents))/i.gross_cents AS INTEGER)),0) FROM financial_receipts i WHERE i.agency_id=a.id AND i.mode='live' AND i.paid_at>=? AND i.paid_at<=?) revenueHtCents,(SELECT count(*) FROM generation_runs g JOIN jobs j ON j.id=g.job_id WHERE g.owner_agency_id=a.id AND j.status='ready' AND g.created_at>=? AND g.created_at<=?) ready FROM agencies a JOIN auth_user u ON u.id=a.owner_user_id ORDER BY revenueHtCents DESC,ready DESC,a.id LIMIT 100").bind(since,until,since,until).all<Agency>()
 ]);
 return {since,until,revenue:revenue.results,trial,accounts,costs:costs.results,animations,agencies:agencies.results};
}
export type CommercialSummary=Awaited<ReturnType<typeof commercialSummary>>;
