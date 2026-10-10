import {z} from 'zod';
import {creditPacks,EntityId} from '@bienvu/contracts';
import {Stripe,billingMode,stripeClient,type BillingEnv} from './billing';
import {contentHash} from './manual-listings';
import {RequestFailure} from './http';
import {readChargeAccounting,accountingMutations} from './stripe-accounting';

export const stripeId=(value:string|{id:string}|null|undefined)=>typeof value==='string'?value:value?.id??null;
const packet=z.object({pack:z.enum(['pack20v2','pack50v2','pack100v2']),accepted:z.literal(true)}).strict();
export async function createTopupCheckout(env:BillingEnv,agencyId:string,email:string,origin:string,input:unknown,key:string,client=stripeClient(env)){
 const parsed=packet.safeParse(input),mode=billingMode(env);
 if(!parsed.success||!EntityId.safeParse(agencyId).success||!/^[-a-zA-Z0-9_]{16,128}$/.test(key))throw new RequestFailure('VALIDATION_ERROR');
 const policy=await env.DB.prepare('SELECT mode,topup_valid_days AS validDays FROM credit_payment_policy WHERE id=1').first<{mode:string;validDays:number}>();
 if(!mode||!env.STRIPE_WEBHOOK_SECRET||policy?.mode!==mode)throw new RequestFailure('BILLING_UNAVAILABLE');
 const pack=creditPacks.find(p=>p.code===parsed.data.pack)!,at=new Date().toISOString();
 const previous=await env.DB.prepare('SELECT pack,url,expires_at AS expires FROM billing_topup_checkouts WHERE agency_id=? AND mode=? AND idempotency_key=?')
  .bind(agencyId,mode,key).first<{pack:string;url:string|null;expires:string}>();
 if(previous&&(previous.pack!==pack.code||previous.expires<=at))throw new RequestFailure('CONFLICT');if(previous?.url)return {url:previous.url};
 const active=await env.DB.prepare('SELECT idempotency_key AS key,pack,url FROM billing_topup_checkouts WHERE agency_id=? AND mode=? AND expires_at>? ORDER BY created_at DESC LIMIT 1')
  .bind(agencyId,mode,at).first<{key:string;pack:string;url:string|null}>();
 if(active&&active.key!==key){if(active.url&&active.pack===pack.code)return {url:active.url};throw new RequestFailure('CONFLICT');}
 let customer=await env.DB.prepare('SELECT customer_id AS id FROM billing_customers WHERE agency_id=? AND mode=?').bind(agencyId,mode).first<{id:string}>();
 if(!customer){const created=await client.customers.create({email,metadata:{agencyId}},{idempotencyKey:`bienvu:${mode}:customer:${agencyId}`});
  await env.DB.prepare('INSERT OR IGNORE INTO billing_customers VALUES(?,?,?,?)').bind(agencyId,mode,created.id,at).run();
  customer=await env.DB.prepare('SELECT customer_id AS id FROM billing_customers WHERE agency_id=? AND mode=?').bind(agencyId,mode).first<{id:string}>();}
 const expires=previous?.expires??new Date(Date.now()+2700_000).toISOString();
 try{await env.DB.prepare('INSERT OR IGNORE INTO billing_topup_checkouts(agency_id,mode,idempotency_key,pack,credits,price_cents,valid_days,expires_at,created_at) VALUES(?,?,?,?,?,?,?,?,?)')
  .bind(agencyId,mode,key,pack.code,pack.credits,pack.priceCents,policy.validDays,expires,at).run();}
 catch(e){if(e instanceof Error&&e.message.includes('CHECKOUT_IN_PROGRESS'))throw new RequestFailure('CONFLICT');throw e;}
 const journal=await env.DB.prepare('SELECT expires_at AS expires FROM billing_topup_checkouts WHERE agency_id=? AND mode=? AND idempotency_key=?').bind(agencyId,mode,key).first<{expires:string}>();
 const suffix=(await contentHash(new TextEncoder().encode(`${mode}:${agencyId}:${key}`))).slice(0,8).split('').map(c=>String.fromCharCode(97+parseInt(c,16))).join('');
 const metadata={agencyId,pack:pack.code,kind:'credit_topup',creditPolicy:'2'};
 const session=await client.checkout.sessions.create({mode:'payment',managed_payments:{enabled:false},integration_identifier:`bienvu_topup_${suffix}`,customer:customer!.id,client_reference_id:agencyId,locale:'fr',
  success_url:`${origin}/abonnement?recharge=confirmation`,cancel_url:`${origin}/abonnement?recharge=annule`,expires_at:Math.floor(Date.parse(journal!.expires)/1000),
  metadata,payment_intent_data:{metadata},invoice_creation:{enabled:true,invoice_data:{metadata}},
  line_items:[{price_data:{currency:'eur',unit_amount:pack.priceCents,tax_behavior:'exclusive',product_data:{name:`BienVu · Recharge de ${pack.credits} crédits`,metadata:{creditCatalog:'2'}}},quantity:1}],
  billing_address_collection:'required',customer_update:{name:'auto',address:'auto'},tax_id_collection:{enabled:true},automatic_tax:{enabled:false},
  custom_text:{submit:{message:`Achat unique de ${pack.credits} crédits, ${policy.validDays?'valables 12 mois':'sans expiration'}. Les crédits mensuels sont utilisés en premier. Votre abonnement ne change pas.`}}},
  {idempotencyKey:`bienvu:${mode}:topup:${agencyId}:${key}`});
 if(!session.url||new URL(session.url).hostname!=='checkout.stripe.com')throw new RequestFailure('BILLING_UNAVAILABLE');
 await env.DB.prepare('UPDATE billing_topup_checkouts SET session_id=?,url=? WHERE agency_id=? AND mode=? AND idempotency_key=?').bind(session.id,session.url,agencyId,mode,key).run();return {url:session.url};
}

// Retrieving the Checkout and its line item is mandatory; metadata or a redirect
// alone cannot mint credits. The journal is the server-approved price snapshot.
export async function topupMutations(env:BillingEnv,sessionId:string,client:Stripe):Promise<D1PreparedStatement[]>{
 const session=await client.checkout.sessions.retrieve(sessionId,{expand:['line_items.data.price','payment_intent']}),mode=billingMode(env);
 if(session.mode!=='payment'||session.metadata?.kind!=='credit_topup')return [];
 if(!mode||session.livemode!==(mode==='live'))throw new RequestFailure('FORBIDDEN');
 const order=await env.DB.prepare('SELECT agency_id AS agencyId,pack,credits,price_cents AS priceCents,valid_days AS validDays FROM billing_topup_checkouts WHERE session_id=? AND mode=?')
  .bind(session.id,mode).first<{agencyId:string;pack:string;credits:number;priceCents:number;validDays:number}>();
 if(!order||session.client_reference_id!==order.agencyId||session.metadata.agencyId!==order.agencyId||session.metadata.pack!==order.pack)throw new RequestFailure('FORBIDDEN');
 const customerId=stripeId(session.customer);
 if(!await env.DB.prepare('SELECT 1 FROM billing_customers WHERE agency_id=? AND mode=? AND customer_id=?').bind(order.agencyId,mode,customerId).first())throw new RequestFailure('FORBIDDEN');
 if(session.payment_status==='unpaid'||session.status!=='complete')return [];
 const item=session.line_items?.data[0],intent=typeof session.payment_intent==='object'?session.payment_intent:null;
 if(session.payment_status!=='paid'||!intent||intent.status!=='succeeded'||intent.livemode!==(mode==='live')||stripeId(intent.customer)!==customerId||intent.currency!=='eur'
  ||intent.amount_received!==session.amount_total||session.currency!=='eur'||session.amount_subtotal!==order.priceCents||session.amount_total!==order.priceCents+(session.total_details?.amount_tax??0)
  ||session.line_items?.has_more||session.line_items?.data.length!==1||item?.quantity!==1||item.price?.unit_amount!==order.priceCents||item.price.recurring||item.price.currency!=='eur'
  ||item.amount_subtotal!==order.priceCents||session.total_details?.amount_discount)throw new RequestFailure('VALIDATION_ERROR');
 const expected=order.pack==='pack10'?env.STRIPE_TOPUP_PRICE_10:order.pack==='pack30'?env.STRIPE_TOPUP_PRICE_30:order.pack==='pack100'?env.STRIPE_TOPUP_PRICE_100:undefined;
 if(expected&&item.price.id!==expected)throw new RequestFailure('VALIDATION_ERROR');
 const policy=await env.DB.prepare('SELECT mode,topup_valid_days AS days FROM credit_payment_policy WHERE id=1').first<{mode:string;days:number}>();
 if(policy?.mode!==mode)throw new RequestFailure('BILLING_UNAVAILABLE');
 const allocationId='topup-'+(await contentHash(new TextEncoder().encode(session.id))).slice(0,32),receiptId='topup-'+session.id,at=new Date().toISOString();
 const end=order.validDays?new Date(Date.now()+order.validDays*86400_000).toISOString():'9999-12-31T23:59:59.999Z';
 const chargeId=stripeId(intent.latest_charge);if(!chargeId)throw new RequestFailure('BILLING_UNAVAILABLE');
 const charge=await readChargeAccounting(env,chargeId,customerId!,client);
 if(charge.intentId!==intent.id||charge.amount!==session.amount_total)throw new RequestFailure('FORBIDDEN');
 return [
  env.DB.prepare(`INSERT INTO allocations(id,agency_id,kind,period_key,quota_limit,valid_from,valid_until) VALUES(?,?,'paid',?,?,?,?) ON CONFLICT(agency_id,kind,period_key) DO NOTHING`)
   .bind(allocationId,order.agencyId,`topup:${mode}:${session.id}`,order.credits,at,end),
  env.DB.prepare(`INSERT INTO financial_receipts(id,agency_id,mode,kind,allocation_id,credits,gross_cents,revenue_ht_cents,currency,customer_id,payment_intent_id,invoice_id,checkout_session_id,paid_at)
   VALUES(?,?,?,'topup',?,?,?,?,'eur',?,?,?,?,?) ON CONFLICT(id) DO NOTHING`)
   .bind(receiptId,order.agencyId,mode,allocationId,order.credits,session.amount_total,order.priceCents,customerId,intent.id,stripeId(session.invoice),session.id,at),
  env.DB.prepare('INSERT INTO credit_topups VALUES(?,?,?,?,?,?,?) ON CONFLICT(session_id) DO NOTHING').bind(session.id,order.agencyId,mode,order.pack,allocationId,receiptId,at),
  env.DB.prepare('UPDATE billing_topup_checkouts SET expires_at=min(expires_at,?) WHERE session_id=?').bind(at,session.id),
  ...accountingMutations(env,receiptId,[charge],session.amount_total),
 ];
}
export async function topupHistory(env:BillingEnv,agencyId:string){
 const rows=await env.DB.prepare(`SELECT t.session_id AS id,t.pack,f.credits,f.revenue_ht_cents AS priceCents,f.mode,t.created_at AS at,
  IIF(f.disputed=1 OR a.valid_until<=strftime('%Y-%m-%dT%H:%M:%fZ','now'),0,max(0,a.quota_limit-a.reserved-a.consumed-f.reversed_credits)) AS remaining,f.reversed_credits AS reversed,f.disputed,a.valid_until AS validUntil
  FROM credit_topups t JOIN financial_receipts f ON f.id=t.receipt_id JOIN allocations a ON a.id=t.allocation_id
  WHERE t.agency_id=? AND t.mode=? ORDER BY t.created_at DESC,t.session_id DESC LIMIT 50`).bind(agencyId,billingMode(env)).all();
 return rows.results;
}
