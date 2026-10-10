import {z} from 'zod';
import {creditPlans,PromotionCode,PromotionSettings,promotionCredits,PROMOTION_PERCENT,type PromotionPreview,type PaidCreditPlanCode} from '@bienvu/contracts';
import {assertSameOrigin,boundedJson,RequestFailure,respond} from './http';
import {requireAdmin} from './admin-access';
import type {AuthEnvironment} from './auth';
import type {BillingEnv,Stripe} from './billing';
import {billingMode,stripeClient} from './billing';

type Promotion={id:string;code:string;name:string;active:number;percent:number;plans:string;startsAt:string|null;endsAt:string|null;maxRedemptions:number|null;version:number};
export type PromotionIntent={id:string;code:string;bonusCredits:number;state:'reserved'|'released'|'redeemed'};
const selection='id,code,name,active,percent,plans_json AS plans,starts_at AS startsAt,ends_at AS endsAt,max_redemptions AS maxRedemptions,version';
const rejected=(reason:string)=>new RequestFailure('VALIDATION_ERROR',{promotion:reason});
export async function checkoutPromotion(db:D1Database,agencyId:string,mode:string,key:string) {
  return db.prepare('SELECT id,code,bonus_credits AS bonusCredits,state FROM billing_promotion_intents WHERE agency_id=? AND mode=? AND idempotency_key=?').bind(agencyId,mode,key).first<PromotionIntent>();
}
export async function validatePromotion(db:D1Database,input:string,mode:'test'|'live',agencyId?:string,plan?:PaidCreditPlanCode,now=Date.now()) {
  const parsed=PromotionCode.safeParse(input);if(!parsed.success)throw rejected('invalid');
  const p=await db.prepare(`SELECT ${selection} FROM subscription_promotions WHERE code=?`).bind(parsed.data).first<Promotion>();
  if(!p)throw rejected('invalid');const at=new Date(now).toISOString();
  const existing=agencyId?await db.prepare(`SELECT i.promotion_id promotionId,i.state,i.plan,c.expires_at expires FROM billing_promotion_intents i JOIN billing_checkouts c USING(agency_id,mode,idempotency_key) WHERE i.agency_id=? AND i.mode=? AND i.state!='released'`).bind(agencyId,mode).first<{promotionId:string;state:string;plan:PaidCreditPlanCode;expires:string}>():null;
  if(existing?.state==='redeemed')throw rejected('used');
  // Let an agency resume the offer it already reserved, even if the campaign
  // was disabled or expired while its Checkout response was interrupted.
  const reserved=existing?.state==='reserved'&&existing.promotionId===p.id&&existing.expires>at&&(!plan||plan===existing.plan);
  if(!reserved&&!p.active)throw rejected('invalid');
  if(!reserved&&p.startsAt&&p.startsAt>at)throw rejected('scheduled');if(!reserved&&p.endsAt&&p.endsAt<=at)throw rejected('expired');
  const running=p.active&&(!p.startsAt||p.startsAt<=at)&&(!p.endsAt||p.endsAt>at);
  const current=JSON.parse(p.plans) as PaidCreditPlanCode[];
  const plans=reserved?[...new Set([...(running?current:[]),existing.plan])]:current;if(plan&&!plans.includes(plan))throw rejected('plan');
  // An open checkout can be replaced only after Stripe has confirmed expiry.
  const count=await db.prepare("SELECT count(*) n FROM billing_promotion_intents WHERE promotion_id=? AND mode=? AND state!='released'").bind(p.id,mode).first<{n:number}>();
  if(p.maxRedemptions!==null&&(count?.n??0)>=p.maxRedemptions&&existing?.promotionId!==p.id)throw rejected('exhausted');
  return {promotion:p,preview:{code:p.code,percent:PROMOTION_PERCENT,endsAt:p.endsAt,plans:plans.map(code=>{
    const base=creditPlans.find(v=>v.code===code)!.credits,bonus=promotionCredits(code);return {plan:code,base,bonus,total:base+bonus};
  })} satisfies PromotionPreview};
}
export function promotionReservation(db:D1Database,p:Promotion,agencyId:string,mode:string,key:string,plan:PaidCreditPlanCode,at:string) {
  return db.prepare('INSERT INTO billing_promotion_intents(id,promotion_id,code,agency_id,mode,idempotency_key,plan,bonus_credits,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)')
    .bind(crypto.randomUUID(),p.id,p.code,agencyId,mode,key,plan,promotionCredits(plan),at,at);
}
export function promotionFailure(error:unknown):never {
  const message=String(error);
  if(message.includes('PROMOTION_USED')||message.includes('billing_promotion_intents.agency_id'))throw rejected('pending');
  if(message.includes('PROMOTION_INVALID'))throw rejected('exhausted');
  if(message.includes('PROMOTION_RATE_LIMIT'))throw new RequestFailure('RATE_LIMITED');
  if(message.includes('PROMOTION_CATALOG_LIMIT'))throw new RequestFailure('CONFLICT',{promotion:'Limite de 1 000 campagnes atteinte.'});
  if(message.includes('UNIQUE constraint failed'))throw new RequestFailure('CONFLICT');
  throw error;
}
export async function releasePromotion(db:D1Database,agencyId:string,mode:string,key:string) {
  await db.prepare("UPDATE billing_promotion_intents SET state='released',updated_at=? WHERE agency_id=? AND mode=? AND idempotency_key=? AND state='reserved'").bind(new Date().toISOString(),agencyId,mode,key).run();
}
// Reservations are never released merely because a local clock says they expired:
// a completed session may still be awaiting its invoice or asynchronous payment.
export async function reconcilePromotionReservations(env:BillingEnv,client=stripeClient(env)) {
  const mode=billingMode(env);if(!mode)throw new RequestFailure('BILLING_UNAVAILABLE');
  const at=new Date().toISOString(),rows=await env.DB.prepare(`SELECT i.id intentId,i.agency_id agencyId,i.idempotency_key key,c.session_id sessionId,c.created_at createdAt,b.customer_id customerId
    FROM billing_promotion_intents i JOIN billing_checkouts c USING(agency_id,mode,idempotency_key)
    JOIN billing_customers b USING(agency_id,mode) WHERE i.state='reserved' AND i.mode=? AND c.expires_at<=? ORDER BY c.expires_at LIMIT 20`).bind(mode,at).all<{intentId:string;agencyId:string;key:string;sessionId:string|null;createdAt:string;customerId:string}>();
  let released=0;
  for(const row of rows.results) {
    let session:Stripe.Checkout.Session|undefined;
    if(row.sessionId)session=await client.checkout.sessions.retrieve(row.sessionId);
    else {
      // Recover a response lost after Stripe created the session. Only a fully
      // exhausted provider search can prove that no payment link was created.
      let after:string|undefined,exhausted=false;
      for(let page=0;page<5;page++){
        const list=await client.checkout.sessions.list({customer:row.customerId,created:{gte:Math.floor(Date.parse(row.createdAt)/1000)-120},limit:100,...(after?{starting_after:after}:{})});
        session=list.data.find(s=>s.metadata?.promotionIntentId===row.intentId);if(session)break;
        if(!list.has_more){exhausted=true;break;}after=list.data.at(-1)?.id;if(!after)break;
      }
      if(!session){if(exhausted){await releasePromotion(env.DB,row.agencyId,mode,row.key);released++;}continue;}
    }
    const customer=typeof session.customer==='string'?session.customer:session.customer?.id;
    if(customer!==row.customerId||session.client_reference_id!==row.agencyId||session.livemode!==(mode==='live')||session.mode!=='subscription')throw new RequestFailure('FORBIDDEN');
    if(!row.sessionId)await env.DB.prepare('UPDATE billing_checkouts SET session_id=?,url=? WHERE agency_id=? AND mode=? AND idempotency_key=? AND session_id IS NULL').bind(session.id,session.status==='open'?session.url:null,row.agencyId,mode,row.key).run();
    if(session.status==='expired'){await releasePromotion(env.DB,row.agencyId,mode,row.key);released++;}
  }
  return {checked:rows.results.length,released};
}
export async function promotionInvoiceMutations(env:BillingEnv,client:Stripe,subscription:Stripe.Subscription,invoice:Stripe.Invoice,plan:string,start:string,end:string) {
  if(invoice.billing_reason!=='subscription_create')return [];
  const id=subscription.metadata.promotionIntentId;if(!id)return [];
  const mode=billingMode(env)!,agencyId=subscription.metadata.agencyId;
  const intent=await env.DB.prepare(`SELECT i.*,c.session_id sessionId FROM billing_promotion_intents i JOIN billing_checkouts c USING(agency_id,mode,idempotency_key) WHERE i.id=? AND i.agency_id=? AND i.mode=? AND i.plan=?`).bind(id,agencyId,mode,plan).first<{id:string;state:string;bonus_credits:number;sessionId:string|null}>();
  if(!intent||intent.state==='released')throw new RequestFailure('FORBIDDEN');
  if(intent.state==='redeemed'){
    if(!await env.DB.prepare('SELECT 1 FROM credit_promotion_redemptions WHERE intent_id=? AND receipt_id=? AND subscription_id=?').bind(id,'invoice-'+invoice.id,subscription.id).first())throw new RequestFailure('FORBIDDEN');
    return [];
  }
  // invoice.paid may arrive before our create request saved the returned session.
  const session=intent.sessionId?await client.checkout.sessions.retrieve(intent.sessionId):(await client.checkout.sessions.list({subscription:subscription.id,limit:2})).data.find(s=>s.metadata?.promotionIntentId===id);
  const customer=typeof session?.customer==='string'?session.customer:session?.customer?.id;
  const sub=typeof session?.subscription==='string'?session.subscription:session?.subscription?.id;
  const subscriptionCustomer=typeof subscription.customer==='string'?subscription.customer:subscription.customer.id;
  if(!session||session.status!=='complete'||session.mode!=='subscription'||session.livemode!==(mode==='live')||customer!==subscriptionCustomer||sub!==subscription.id||session.client_reference_id!==agencyId||session.metadata?.promotionIntentId!==id)throw new RequestFailure('FORBIDDEN');
  const at=new Date().toISOString(),allocationId='promotion-'+id;
  return [
    env.DB.prepare('UPDATE billing_checkouts SET session_id=?,url=NULL WHERE agency_id=? AND mode=? AND idempotency_key=(SELECT idempotency_key FROM billing_promotion_intents WHERE id=?) AND (session_id IS NULL OR session_id=?)').bind(session.id,agencyId,mode,id,session.id),
    env.DB.prepare(`INSERT INTO allocations(id,agency_id,kind,period_key,quota_limit,valid_from,valid_until) VALUES(?,?,'paid',?,?,?,?) ON CONFLICT(id) DO NOTHING`).bind(allocationId,agencyId,'promotion:'+mode+':'+id,intent.bonus_credits,start,end),
    env.DB.prepare(`INSERT INTO credit_promotion_redemptions(intent_id,agency_id,mode,allocation_id,receipt_id,subscription_id,created_at) SELECT ?,?,?,?,?,?,? WHERE NOT EXISTS(SELECT 1 FROM credit_promotion_redemptions WHERE intent_id=?)`).bind(id,agencyId,mode,allocationId,'invoice-'+invoice.id,subscription.id,at,id),
  ];
}
export async function promotionValidationAttempt(db:D1Database,secret:string,ip:string) {
  const now=Date.now(),minute=Math.floor(now/60000),key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  const digest=await crypto.subtle.sign('HMAC',key,new TextEncoder().encode('promotion:'+ip+':'+minute));
  const bucket=Array.from(new Uint8Array(digest),v=>v.toString(16).padStart(2,'0')).join('');
  try{await db.batch([
    db.prepare('DELETE FROM promotion_validation_limits WHERE created_at<?').bind(new Date(now-86400_000).toISOString()),
    db.prepare('INSERT INTO promotion_validation_limits VALUES(?,1,?) ON CONFLICT(bucket) DO UPDATE SET attempts=attempts+1').bind(bucket,new Date(now).toISOString()),
  ]);}catch(cause){if(String(cause).includes('CHECK constraint failed'))throw new RequestFailure('RATE_LIMITED');throw cause;}
}
const action=z.discriminatedUnion('action',[
  z.object({action:z.literal('save'),id:z.uuid().optional(),version:z.number().int().positive().optional(),settings:PromotionSettings,reason:z.string().trim().min(5).max(300)}).strict(),
  z.object({action:z.literal('reconcile')}).strict(),
]);
export async function savePromotion(db:D1Database,actor:string,input:unknown) {
  const b=action.safeParse(input);if(!b.success||b.data.action!=='save')throw new RequestFailure('VALIDATION_ERROR');
  const {settings:s,id:providedId,version,reason}=b.data,id=providedId??crypto.randomUUID(),at=new Date().toISOString();
  const previous=providedId?await db.prepare(`SELECT ${selection} FROM subscription_promotions WHERE id=?`).bind(id).first<Promotion>():null;
  if(providedId&&!previous)throw new RequestFailure('NOT_FOUND');
  if(previous&&(version!==previous.version||s.code!==previous.code))throw new RequestFailure('CONFLICT');
  const after=JSON.stringify(s);
  try{
    const mutation=previous?db.prepare('UPDATE subscription_promotions SET name=?,active=?,plans_json=?,starts_at=?,ends_at=?,max_redemptions=?,version=version+1,updated_at=? WHERE id=? AND version=?')
      .bind(s.name,s.active?1:0,JSON.stringify(s.plans),s.startsAt,s.endsAt,s.maxRedemptions,at,id,version!):
      db.prepare('INSERT INTO subscription_promotions(id,code,name,active,plans_json,starts_at,ends_at,max_redemptions,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)')
      .bind(id,s.code,s.name,s.active?1:0,JSON.stringify(s.plans),s.startsAt,s.endsAt,s.maxRedemptions,at,at);
    const results=await db.batch([mutation,db.prepare('INSERT INTO promotion_audit SELECT ?,?,?,?,?,?,? WHERE changes()=1').bind(crypto.randomUUID(),id,actor,previous?JSON.stringify(previous):null,after,reason,at)]);
    if(results[0].meta.changes!==1)throw new RequestFailure('CONFLICT');
  }catch(cause){promotionFailure(cause);}
  return {id};
}
export async function promotionReport(db:D1Database,mode:'test'|'live',query:URLSearchParams) {
  const search=(query.get('q')??'').slice(0,100),status=query.get('status')??'all',target=query.get('id')??'',cursor=query.get('cursor');let before='9999',beforeId='~';
  if(cursor){try{if(cursor.length>256)throw 0;const pair=z.tuple([z.iso.datetime(),z.uuid()]).parse(JSON.parse(atob(cursor)));[before,beforeId]=pair;}catch{throw new RequestFailure('VALIDATION_ERROR');}}
  if(target&&!z.uuid().safeParse(target).success)throw new RequestFailure('VALIDATION_ERROR');
  const rows=await db.prepare(`SELECT ${selection.split(',').map(c=>'p.'+c).join(',')},
    (SELECT count(*) FROM billing_promotion_intents i WHERE i.promotion_id=p.id AND i.mode=? AND i.state='reserved') reserved,
    (SELECT count(*) FROM billing_promotion_intents i WHERE i.promotion_id=p.id AND i.mode=? AND i.state='redeemed') redeemed,
    (SELECT coalesce(sum(i.bonus_credits),0) FROM billing_promotion_intents i WHERE i.promotion_id=p.id AND i.mode=? AND i.state='redeemed') granted
    FROM subscription_promotions p WHERE (?='' OR p.code LIKE ? OR p.name LIKE ?) AND (?='all' OR p.active=?) ORDER BY p.created_at DESC,p.id DESC LIMIT 200`)
    .bind(mode,mode,mode,search,'%'+search+'%','%'+search+'%',status,status==='active'?1:0).all<Promotion&{reserved:number;redeemed:number;granted:number}>();
  const history=target?await db.prepare(`SELECT i.id,i.code,i.plan,i.bonus_credits bonus,i.state,c.session_id sessionId,a.name agency,i.created_at at,r.created_at paidAt,
    f.invoice_id invoiceId,f.gross_cents grossCents,f.refunded_cents refundedCents,f.disputed,coalesce(v.reversed,0) reversed,
    coalesce(allocation.consumed,0) consumed,coalesce(allocation.reserved,0) reserved,allocation.valid_until expiresAt
    FROM billing_promotion_intents i JOIN agencies a ON a.id=i.agency_id JOIN billing_checkouts c USING(agency_id,mode,idempotency_key)
    LEFT JOIN credit_promotion_redemptions r ON r.intent_id=i.id LEFT JOIN financial_receipts f ON f.id=r.receipt_id
    LEFT JOIN allocations allocation ON allocation.id=r.allocation_id LEFT JOIN promotion_reversed_credits v ON v.allocation_id=r.allocation_id
    WHERE i.promotion_id=? AND i.mode=? AND (i.created_at<? OR (i.created_at=? AND i.id<?)) ORDER BY i.created_at DESC,i.id DESC LIMIT 51`).bind(target,mode,before,before,beforeId).all():null;
  const audit=target?await db.prepare('SELECT a.id,u.email actor,a.reason,a.created_at at FROM promotion_audit a JOIN auth_user u ON u.id=a.actor_user_id WHERE a.promotion_id=? ORDER BY a.created_at DESC LIMIT 30').bind(target).all():null;
  const totals=await db.prepare(`SELECT (SELECT count(*) FROM billing_promotion_intents WHERE mode=? AND state='reserved') reserved,
    count(*) redeemed,coalesce(sum(a.quota_limit),0) granted,coalesce(sum(v.reversed),0) reversed
    FROM credit_promotion_redemptions p JOIN allocations a ON a.id=p.allocation_id JOIN promotion_reversed_credits v ON v.allocation_id=a.id WHERE p.mode=?`).bind(mode,mode).first();
  return {mode,percent:PROMOTION_PERCENT,totals,codes:rows.results.map(p=>({...p,active:Boolean(p.active),plans:JSON.parse(p.plans)})),history:history?.results.slice(0,50)??[],nextCursor:history&&history.results.length>50?btoa(JSON.stringify([history.results[49].at,history.results[49].id])):null,audit:audit?.results??[]};
}
export function promotionsRequest(request:Request,env:BillingEnv&AuthEnvironment&{SUPER_ADMIN_EMAIL?:string}) {
  return respond(async()=>{
    const user=await requireAdmin(request,env),mode=billingMode(env);if(!mode)throw new RequestFailure('BILLING_UNAVAILABLE');
    if(request.method==='GET'){const query=new URL(request.url).searchParams,requested=query.get('mode');if(requested&&!['test','live'].includes(requested))throw new RequestFailure('VALIDATION_ERROR');return Response.json({...await promotionReport(env.DB,requested as 'test'|'live'||mode,query),billingMode:mode});}
    if(request.method!=='POST')throw new RequestFailure('FORBIDDEN');assertSameOrigin(request,env);
    const parsed=action.safeParse(await boundedJson(request,4096));if(!parsed.success)throw new RequestFailure('VALIDATION_ERROR');
    return Response.json(parsed.data.action==='save'?await savePromotion(env.DB,user.id,parsed.data):await reconcilePromotionReservations(env));
  });
}
