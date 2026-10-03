import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import type {Stripe} from '../apps/web/lib/billing';
import {migrateNarrationProbe,seedNarrationFixture} from '../scripts/narration-fixtures';
import {billingStatus,createCheckout,processStripeEvent,stripeClient,stripeWebhook} from '../apps/web/lib/billing';
import {creditBalance,generationRights} from '../packages/db/src/index';
import {commercialSummary} from '../apps/web/lib/commercial';
async function fixture(t:{after(fn:()=>Promise<void>):void},label:string){
 const mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:'export default {fetch(){return new Response("fixture")}}',compatibilityDate:'2026-09-27',d1Databases:['DB']}));t.after(()=>mf.dispose());const {DB}=await mf.getBindings<{DB:D1Database}>();await migrateNarrationProbe(DB);
 const seed=await seedNarrationFixture(DB,label);await DB.exec("UPDATE jobs SET status='failed',error_code='FIXTURE',lease_until=NULL; UPDATE generation_control SET enabled=1; UPDATE trial_policy SET free_enabled=1");
 const env={DB,BILLING_MODE:'test',STRIPE_SECRET_KEY:'sk_test_fixture',STRIPE_WEBHOOK_SECRET:'whsec_fixture'};
 await DB.prepare('INSERT INTO billing_customers VALUES(?,?,?,?)').bind(seed.agencyId,'test','cus_fixture',new Date().toISOString()).run();
 const start=Math.floor(Date.now()/1000)-10,price={id:'price_plus_fixture',currency:'eur',unit_amount:1900,recurring:{interval:'month',interval_count:1}},
 sub={id:'sub_fixture',customer:'cus_fixture',metadata:{agencyId:seed.agencyId,plan:'plus'},items:{data:[{id:'si_fixture',quantity:1,price,current_period_start:start,current_period_end:start+30*86400}]},status:'active',cancel_at_period_end:false},
 invoice={id:'in_fixture',customer:'cus_fixture',status:'paid',currency:'eur',amount_paid:1900,subtotal:1900,subtotal_excluding_tax:1900,billing_reason:'subscription_create',parent:{subscription_details:{subscription:'sub_fixture'}},lines:{has_more:false,data:[{amount:1900,quantity:1,parent:{subscription_item_details:{subscription_item:'si_fixture',proration:false}},pricing:{price_details:{price:price.id}},period:{start,end:start+30*86400}}]}};
 const client=stripeClient(env);client.subscriptions.retrieve=async()=>sub as unknown as Stripe.Response<Stripe.Subscription>;client.invoices.retrieve=async()=>invoice as unknown as Stripe.Response<Stripe.Invoice>;client.invoicePayments.list=(async()=>({data:[],has_more:false})) as unknown as typeof client.invoicePayments.list;
 const event=(id:string,type:Stripe.Event.Type='invoice.paid',created=Math.floor(Date.now()/1000))=>({id,type,created,livemode:false,data:{object:type.startsWith('invoice')?{id:invoice.id}:{id:sub.id}}}) as Stripe.Event;
 return {env,DB,...seed,client,sub,invoice,event};
}
test('Stripe : seule une facture payée accorde les crédits, replay concurrent et signature',async t=>{
 const f=await fixture(t,'bill-paid'),{env,DB,client,agencyId,event}=f;
 await processStripeEvent(env,event('evt_return','checkout.session.completed'),'a'.repeat(64),client);assert.equal((await creditBalance(DB,agencyId)).kind,null);
 const raw=JSON.stringify(event('evt_invoice')),signature=client.webhooks.generateTestHeaderString({payload:raw,secret:env.STRIPE_WEBHOOK_SECRET});
 await assert.rejects(stripeWebhook(env,raw,signature.replace(/v1=(.)/,(_,hex)=>'v1='+(hex==='0'?'1':'0')),client));
 assert.equal((await DB.prepare('SELECT count(*) n FROM billing_invoices').first<{n:number}>())!.n,0);
 await Promise.all([1,2].map(()=>stripeWebhook(env,raw,signature,client)));assert.equal((await creditBalance(DB,agencyId)).available,40);
 await processStripeEvent(env,event('evt_invoice_repeat'),'b'.repeat(64),client);assert.equal((await creditBalance(DB,agencyId)).total,40);
 assert.equal((await DB.prepare("SELECT count(*) n FROM allocations WHERE kind='paid'").first<{n:number}>())!.n,1);
 assert.equal((await generationRights(DB,agencyId,'true')).developmentRemaining,40);
 assert.equal((await DB.prepare('SELECT enabled FROM generation_access WHERE agency_id=?').bind(agencyId).first<{enabled:number}>())!.enabled,1);
 const summary=await commercialSummary(DB);assert.equal(summary.revenue.find(r=>r.mode==='test')!.revenueHtCents,1900);assert.equal(summary.revenue.some(r=>r.mode==='live'),false);
 await assert.rejects(processStripeEvent(env,event('evt_invoice'),'c'.repeat(64),client));
 await assert.rejects(processStripeEvent(env,{...event('evt_live'),livemode:true},'d'.repeat(64),client));
});
test('Stripe : impayé, mauvaise devise, facture proratisée et tenant étranger ne créent aucun droit',async t=>{
 const f=await fixture(t,'bill-invalid');f.invoice.status='open';await processStripeEvent(f.env,f.event('evt_failed','invoice.payment_failed'),'1'.repeat(64),f.client);assert.equal((await creditBalance(f.DB,f.agencyId)).available,0);
 await assert.rejects(processStripeEvent(f.env,f.event('evt_open'),'2'.repeat(64),f.client));
 f.invoice.status='paid';f.invoice.currency='usd';await assert.rejects(processStripeEvent(f.env,f.event('evt_currency'),'3'.repeat(64),f.client));f.invoice.currency='eur';
 f.invoice.lines.data[0].parent.subscription_item_details.proration=true;await assert.rejects(processStripeEvent(f.env,f.event('evt_proration'),'4'.repeat(64),f.client));f.invoice.lines.data[0].parent.subscription_item_details.proration=false;
 f.sub.metadata.agencyId='foreign-agency';await assert.rejects(processStripeEvent(f.env,f.event('evt_foreign'),'5'.repeat(64),f.client));
 assert.equal((await f.DB.prepare('SELECT count(*) n FROM billing_invoices').first<{n:number}>())!.n,0);
});
test('Stripe : renouvellement sans report, annulation et événements désordonnés',async t=>{
 const f=await fixture(t,'bill-renew'),base=f.event('evt_first');await processStripeEvent(f.env,base,'1'.repeat(64),f.client);
 await f.DB.exec("UPDATE allocations SET consumed=4 WHERE kind='paid'");assert.equal((await creditBalance(f.DB,f.agencyId)).available,36);
 const old=f.invoice.lines.data[0].period.start;f.invoice.id='in_next';f.invoice.billing_reason='subscription_cycle';f.invoice.lines.data[0].period={start:old+30*86400,end:old+60*86400};f.sub.items.data[0].current_period_start=old+30*86400;f.sub.items.data[0].current_period_end=old+60*86400;
 await processStripeEvent(f.env,f.event('evt_next','invoice.paid',base.created+1),'2'.repeat(64),f.client);
 const future=await creditBalance(f.DB,f.agencyId,(old+30*86400+20)*1000);assert.equal(future.total,40);assert.equal(future.available,40);
 assert.equal((await creditBalance(f.DB,f.agencyId)).available,36,'Les crédits futurs ne remplacent pas ceux encore valides');
 f.sub.cancel_at_period_end=true;await processStripeEvent(f.env,f.event('evt_cancel','customer.subscription.updated',base.created+3),'3'.repeat(64),f.client);
 await processStripeEvent(f.env,f.event('evt_old','customer.subscription.updated',base.created+2),'4'.repeat(64),f.client);
 const status=await billingStatus(f.env,f.agencyId);assert.equal((status.subscription as {cancelAtPeriodEnd:number}).cancelAtPeriodEnd,1);
});
test('Stripe Checkout : consentement, doublons, prix serveur et paramètres stables',async t=>{
 const f=await fixture(t,'bill-checkout'),sessions=new Map<string,unknown>();let calls=0;
 f.client.checkout.sessions.create=async(params,options)=>{calls++;const key=options!.idempotencyKey!,previous=sessions.get(key);if(previous)assert.deepEqual(params,previous);else sessions.set(key,params);return {id:'cs_fixture',url:'https://checkout.stripe.com/c/pay/cs_fixture'} as Stripe.Response<Stripe.Checkout.Session>;};
 await assert.rejects(createCheckout(f.env,f.agencyId,'fixture@example.com','https://bienvu.online',{plan:'plus',accepted:false},'checkout-fixture-key',f.client));
 const result=await Promise.all([1,2].map(()=>createCheckout(f.env,f.agencyId,'fixture@example.com','https://bienvu.online',{plan:'plus',accepted:true},'checkout-fixture-key',f.client)));assert.equal(result[0].url,result[1].url);
 const params=[...sessions.values()][0] as Stripe.Checkout.SessionCreateParams;assert.equal(params.line_items![0].price_data!.unit_amount,1900);assert.equal('payment_method_types' in params,false);assert.equal(params.automatic_tax!.enabled,false);assert.equal(params.managed_payments!.enabled,false);
 await createCheckout(f.env,f.agencyId,'fixture@example.com','https://bienvu.online',{plan:'plus',accepted:true},'checkout-fixture-key',f.client);assert.ok(calls<=2);
 await assert.rejects(createCheckout(f.env,f.agencyId,'fixture@example.com','https://bienvu.online',{plan:'pro',accepted:true},'checkout-other-key00',f.client));
 assert.equal((await f.DB.prepare('SELECT count(*) n FROM allocations WHERE kind=?').bind('paid').first<{n:number}>())!.n,0);
});
