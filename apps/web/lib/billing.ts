import Stripe from 'stripe';
export {Stripe};
import {z} from 'zod';
import {creditPlans,legacyCreditPlans,EntityId} from '@bienvu/contracts';
import {RequestFailure} from './http';
import {contentHash} from './manual-listings';
import {topupMutations} from './credit-purchases';
import {financialEventMutations,invoiceAccountingMutations} from './stripe-accounting';
export type BillingEnv=Pick<CloudflareEnv,'DB'>&{BILLING_MODE?:string;STRIPE_SECRET_KEY?:string;STRIPE_WEBHOOK_SECRET?:string;STRIPE_PRICE_PLUS?:string;STRIPE_PRICE_PRO?:string;STRIPE_PORTAL_CONFIGURATION?:string;STRIPE_TOPUP_PRICE_10?:string;STRIPE_TOPUP_PRICE_30?:string;STRIPE_TOPUP_PRICE_100?:string};
export function billingMode(env:BillingEnv):'test'|'live'|null{return env.BILLING_MODE==='test'&&env.STRIPE_SECRET_KEY?.startsWith('sk_test_')?'test':env.BILLING_MODE==='live'&&env.STRIPE_SECRET_KEY?.startsWith('sk_live_')?'live':null;}
export function billingAvailability(env:BillingEnv){const mode=billingMode(env);return {enabled:Boolean(mode&&env.STRIPE_WEBHOOK_SECRET),mode};}
export type BillingAvailability=ReturnType<typeof billingAvailability>;
export function stripeClient(env:BillingEnv){if(!billingMode(env))throw new RequestFailure('BILLING_UNAVAILABLE');return new Stripe(env.STRIPE_SECRET_KEY!,{httpClient:Stripe.createFetchHttpClient(),maxNetworkRetries:1,timeout:15000});}
export async function billingStatus(env:BillingEnv,agencyId:string){
 const subscription=await env.DB.prepare('SELECT plan_code AS plan,status,period_end AS periodEnd,cancel_at_period_end AS cancelAtPeriodEnd,stripe_mode AS mode FROM subscriptions WHERE agency_id=?').bind(agencyId).first();
 const policy=await env.DB.prepare('SELECT topup_valid_days AS validDays FROM credit_payment_policy WHERE id=1').first<{validDays:number}>();
 return {...billingAvailability(env),subscription,topupValidDays:policy?.validDays??0};
}
export async function createCheckout(env:BillingEnv,agencyId:string,email:string,origin:string,input:unknown,key:string,client=stripeClient(env)){
 const parsed=z.object({plan:z.enum(['solo','agence','equipe','reseau']),accepted:z.literal(true)}).strict().safeParse(input);if(!parsed.success||!EntityId.safeParse(agencyId).success||!/^[-a-zA-Z0-9_]{16,128}$/.test(key))throw new RequestFailure('VALIDATION_ERROR');
 const mode=billingMode(env);if(!mode||!env.STRIPE_WEBHOOK_SECRET)throw new RequestFailure('BILLING_UNAVAILABLE');
 const plan=creditPlans.find(p=>p.code===parsed.data.plan)!,at=new Date().toISOString();
 if(await env.DB.prepare("SELECT 1 FROM subscriptions WHERE agency_id=? AND stripe_mode=? AND status NOT IN ('canceled','incomplete_expired')").bind(agencyId,mode).first())throw new RequestFailure('CONFLICT');
 const previous=await env.DB.prepare('SELECT plan,url,expires_at AS expires FROM billing_checkouts WHERE agency_id=? AND mode=? AND idempotency_key=?').bind(agencyId,mode,key).first<{plan:string;url:string|null;expires:string}>();
 if(previous&&(previous.plan!==plan.code||previous.expires<=at))throw new RequestFailure('CONFLICT');if(previous?.url)return {url:previous.url};
 const active=await env.DB.prepare('SELECT idempotency_key AS key,plan,url FROM billing_checkouts WHERE agency_id=? AND mode=? AND expires_at>? ORDER BY created_at DESC LIMIT 1').bind(agencyId,mode,at).first<{key:string;plan:string;url:string|null}>();
 if(active&&active.key!==key){if(active.url&&active.plan===plan.code)return {url:active.url};throw new RequestFailure('CONFLICT');}
 let customer=await env.DB.prepare('SELECT customer_id AS id FROM billing_customers WHERE agency_id=? AND mode=?').bind(agencyId,mode).first<{id:string}>();
 if(!customer){const created=await client.customers.create({email,metadata:{agencyId}},{idempotencyKey:`bienvu:${mode}:customer:${agencyId}`});
  await env.DB.prepare('INSERT OR IGNORE INTO billing_customers VALUES(?,?,?,?)').bind(agencyId,mode,created.id,at).run();customer=await env.DB.prepare('SELECT customer_id AS id FROM billing_customers WHERE agency_id=? AND mode=?').bind(agencyId,mode).first<{id:string}>();}
 const expiresAt=previous?.expires??new Date(Date.now()+2700_000).toISOString();
 try{await env.DB.prepare('INSERT OR IGNORE INTO billing_checkouts(agency_id,idempotency_key,plan,mode,expires_at,created_at) VALUES(?,?,?,?,?,?)').bind(agencyId,key,plan.code,mode,expiresAt,at).run();}catch(e){if(e instanceof Error&&e.message.includes('CHECKOUT_IN_PROGRESS'))throw new RequestFailure('CONFLICT');throw e;}
 const journal=await env.DB.prepare('SELECT expires_at AS expires FROM billing_checkouts WHERE agency_id=? AND mode=? AND idempotency_key=?').bind(agencyId,mode,key).first<{expires:string}>();
 const stableSuffix=(await contentHash(new TextEncoder().encode(`${mode}:${agencyId}:${key}`))).slice(0,8).split('').map(c=>String.fromCharCode(97+parseInt(c,16))).join('');
 const session=await client.checkout.sessions.create({mode:'subscription',managed_payments:{enabled:false},integration_identifier:`bienvu_checkout_${stableSuffix}`,customer:customer!.id,client_reference_id:agencyId,locale:'fr',
  success_url:`${origin}/abonnement?paiement=confirmation`,cancel_url:`${origin}/abonnement?paiement=annule`,expires_at:Math.floor(Date.parse(journal!.expires)/1000),
  metadata:{agencyId,plan:plan.code,creditCatalog:'2'},subscription_data:{metadata:{agencyId,plan:plan.code,creditCatalog:'2'}},
  line_items:[{price_data:{currency:'eur',unit_amount:plan.price*100,tax_behavior:'exclusive',recurring:{interval:'month'},product_data:{name:`BienVu ${plan.name} · ${plan.credits} crédits par mois`,metadata:{bienvuPlan:plan.code,creditCatalog:'2'}}},quantity:1}],
  billing_address_collection:'required',customer_update:{name:'auto',address:'auto'},tax_id_collection:{enabled:true},automatic_tax:{enabled:false},
  custom_text:{submit:{message:`${plan.credits} crédits par mois. Crédits inutilisés reportés un mois, dans la limite de ${plan.credits} crédits, après renouvellement payé. Résiliation à la fin de la période payée.`}}},
  {idempotencyKey:`bienvu:${mode}:checkout:${agencyId}:${key}`});
 if(!session.url||new URL(session.url).hostname!=='checkout.stripe.com')throw new RequestFailure('BILLING_UNAVAILABLE');
 await env.DB.prepare('UPDATE billing_checkouts SET session_id=?,url=? WHERE agency_id=? AND mode=? AND idempotency_key=?').bind(session.id,session.url,agencyId,mode,key).run();return {url:session.url};
}
export async function createPortal(env:BillingEnv,agencyId:string,origin:string,client=stripeClient(env)){
 const customer=await env.DB.prepare('SELECT customer_id AS id FROM billing_customers WHERE agency_id=? AND mode=?').bind(agencyId,billingMode(env)).first<{id:string}>();if(!customer)throw new RequestFailure('NOT_FOUND');
 const session=await client.billingPortal.sessions.create({customer:customer.id,return_url:`${origin}/abonnement`,...(env.STRIPE_PORTAL_CONFIGURATION?{configuration:env.STRIPE_PORTAL_CONFIGURATION}:{})});if(new URL(session.url).hostname!=='billing.stripe.com')throw new RequestFailure('BILLING_UNAVAILABLE');return {url:session.url};
}
const stripeId=(value:string|{id:string}|null|undefined)=>typeof value==='string'?value:value?.id??null;
function approvedPlan(env:BillingEnv,price:Stripe.Price){return [...creditPlans,...legacyCreditPlans].find(p=>{
 const configured=p.code==='plus'?env.STRIPE_PRICE_PLUS:p.code==='pro'?env.STRIPE_PRICE_PRO:undefined;
 return p.price>0&&price.currency==='eur'&&price.unit_amount===p.price*100&&price.recurring?.interval==='month'&&price.recurring.interval_count===1&&(!configured||price.id===configured);
});}
export async function processStripeEvent(env:BillingEnv,event:Stripe.Event,payloadHash:string,client=stripeClient(env)){
 const mode=billingMode(env);if(!mode||event.livemode!==(mode==='live'))throw new RequestFailure('FORBIDDEN');
 const previous=await env.DB.prepare('SELECT payload_hash AS hash FROM stripe_webhook_events WHERE id=?').bind(event.id).first<{hash:string}>();
 if(previous){if(previous.hash!==payloadHash)throw new RequestFailure('CONFLICT');return {received:true};}
 let subscriptionId:string|null=null,invoice:Stripe.Invoice|null=null;
 if(event.type==='invoice.paid'||event.type==='invoice.payment_failed'){invoice=await client.invoices.retrieve((event.data.object as Stripe.Invoice).id);subscriptionId=stripeId(invoice.parent?.subscription_details?.subscription);if(event.type==='invoice.payment_failed')invoice=null;}
 else if(['customer.subscription.created','customer.subscription.updated','customer.subscription.deleted'].includes(event.type))subscriptionId=(event.data.object as Stripe.Subscription).id;
 // Subscription Checkout still grants nothing. A one-time pack is independently
 // proved by the retrieved paid Checkout, PaymentIntent and server price journal.
 const mutations:D1PreparedStatement[]=[];
 if(['checkout.session.completed','checkout.session.async_payment_succeeded'].includes(event.type)){
  const object=event.data.object as Stripe.Checkout.Session;
  if(object.mode==='payment'&&object.metadata?.kind==='credit_topup')mutations.push(...await topupMutations(env,object.id,client));
 }
 mutations.push(...await financialEventMutations(env,event,client));
 if(subscriptionId){
  const subscription=await client.subscriptions.retrieve(subscriptionId),customerId=stripeId(subscription.customer),agencyId=subscription.metadata.agencyId,
   item=subscription.items.data[0],plan=item?approvedPlan(env,item.price):null;
  if(!EntityId.safeParse(agencyId).success||!plan||subscription.items.data.length!==1||item.quantity!==1)throw new RequestFailure('VALIDATION_ERROR');
  if(!await env.DB.prepare('SELECT 1 FROM billing_customers WHERE agency_id=? AND mode=? AND customer_id=?').bind(agencyId,mode,customerId).first())throw new RequestFailure('FORBIDDEN');
  const from=new Date(item.current_period_start*1000).toISOString(),until=new Date(item.current_period_end*1000).toISOString(),at=new Date().toISOString();
  mutations.push(env.DB.prepare(`INSERT INTO subscriptions(agency_id,stripe_customer_id,stripe_subscription_id,plan_code,status,period_start,period_end,cancel_at_period_end,sync_version,updated_at,stripe_mode)
   VALUES(?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(agency_id) DO UPDATE SET stripe_customer_id=excluded.stripe_customer_id,stripe_subscription_id=excluded.stripe_subscription_id,plan_code=excluded.plan_code,status=excluded.status,period_start=excluded.period_start,period_end=excluded.period_end,cancel_at_period_end=excluded.cancel_at_period_end,sync_version=excluded.sync_version,updated_at=excluded.updated_at,stripe_mode=excluded.stripe_mode WHERE subscriptions.sync_version<=excluded.sync_version AND subscriptions.stripe_mode=excluded.stripe_mode`)
   .bind(agencyId,customerId,subscription.id,plan.code,subscription.status,from,until,subscription.cancel_at_period_end?1:0,event.created,at,mode));
  if(invoice){
   const line=invoice.lines.data.find(l=>l.parent?.subscription_item_details?.subscription_item===item.id&&!l.parent.subscription_item_details.proration),period=line?.period,priceId=stripeId(line?.pricing?.price_details?.price);
   const invoicePlan=priceId?approvedPlan(env,priceId===item.price.id?item.price:await client.prices.retrieve(priceId)):null;
   if(!invoicePlan||invoice.status!=='paid'||invoice.currency!=='eur'||stripeId(invoice.customer)!==customerId||invoice.amount_paid<invoicePlan.price*100||line?.amount!==invoicePlan.price*100||line.quantity!==1||invoice.billing_reason!=='subscription_create'&&invoice.billing_reason!=='subscription_cycle'||!period||invoice.lines.has_more)throw new RequestFailure('VALIDATION_ERROR');
   const start=new Date(period.start*1000).toISOString(),end=new Date(period.end*1000).toISOString(),allocationId=`stripe-${invoice.id}`;
   if(end<=start||period.end-period.start>32*86400||period.end-period.start<27*86400)throw new RequestFailure('VALIDATION_ERROR');
   const periodKey=`stripe:${mode}:${subscription.id}:${period.start}`;
   mutations.push(env.DB.prepare(`INSERT INTO allocations(id,agency_id,kind,period_key,quota_limit,valid_from,valid_until) VALUES(?,?,'paid',?,?,?,?) ON CONFLICT(agency_id,kind,period_key) DO NOTHING`).bind(allocationId,agencyId,periodKey,invoicePlan.credits,start,end));
   // The ledger points to the unique period allocation even for duplicate invoice events.
   mutations.push(env.DB.prepare(`INSERT INTO billing_invoices(id,agency_id,mode,subscription_id,plan,amount_paid,subtotal_excluding_tax,currency,period_start,period_end,allocation_id,created_at)
    SELECT ?,?,?,?,?,?,?,'eur',?,?,id,? FROM allocations WHERE agency_id=? AND kind='paid' AND period_key=? ON CONFLICT(id) DO NOTHING`)
    .bind(invoice.id,agencyId,mode,subscription.id,invoicePlan.code,invoice.amount_paid,invoice.subtotal_excluding_tax??invoice.subtotal,start,end,at,agencyId,periodKey));
   mutations.push(env.DB.prepare(`INSERT INTO generation_access(agency_id,allocation_id,enabled) SELECT agency_id,id,1 FROM allocations WHERE agency_id=? AND kind='paid' AND period_key=? AND valid_from<=? AND valid_until>? ON CONFLICT(agency_id) DO UPDATE SET allocation_id=excluded.allocation_id,enabled=1`).bind(agencyId,periodKey,at,at));
   mutations.push(env.DB.prepare(`INSERT INTO financial_receipts(id,agency_id,mode,kind,allocation_id,credits,gross_cents,revenue_ht_cents,currency,customer_id,invoice_id,paid_at)
    SELECT ?,?,?,'subscription',id,?,?,?,'eur',?,?,? FROM allocations WHERE agency_id=? AND kind='paid' AND period_key=? ON CONFLICT(id) DO NOTHING`)
    .bind('invoice-'+invoice.id,agencyId,mode,invoicePlan.credits,invoice.amount_paid,invoice.total_excluding_tax??invoice.subtotal_excluding_tax??invoice.subtotal,customerId,invoice.id,at,agencyId,periodKey));
   mutations.push(...await invoiceAccountingMutations(env,invoice,'invoice-'+invoice.id,client));
  }
 }
 mutations.push(env.DB.prepare('INSERT OR IGNORE INTO stripe_webhook_events VALUES(?,?,?,?,?,?)').bind(event.id,mode,event.type,payloadHash,event.created,new Date().toISOString()));
 await env.DB.batch(mutations);return {received:true};
}
export async function stripeWebhook(env:BillingEnv,raw:string,signature:string|null,client=stripeClient(env)){
 if(!signature||!env.STRIPE_WEBHOOK_SECRET)throw new RequestFailure('FORBIDDEN');let event:Stripe.Event;
 try{event=await client.webhooks.constructEventAsync(raw,signature,env.STRIPE_WEBHOOK_SECRET,300,Stripe.createSubtleCryptoProvider());}catch{throw new RequestFailure('FORBIDDEN');}
 return processStripeEvent(env,event,await contentHash(new TextEncoder().encode(raw)),client);
}
