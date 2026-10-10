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
 const checkoutSessions=new Map<string,Stripe.Checkout.Session>();
 client.checkout.sessions.retrieve=async id=>{let session=checkoutSessions.get(id);if(!session){const row=await DB.prepare('SELECT url,expires_at AS expires FROM billing_checkouts WHERE session_id=?').bind(id).first<{url:string;expires:string}>();assert.ok(row);session={id,status:'open',url:row.url,expires_at:Math.floor(Date.parse(row.expires)/1000),customer:'cus_fixture',client_reference_id:seed.agencyId,mode:'subscription',livemode:false,subscription:null} as Stripe.Checkout.Session;checkoutSessions.set(id,session);}return session as Stripe.Response<Stripe.Checkout.Session>;};
 client.checkout.sessions.expire=async id=>{const session=await client.checkout.sessions.retrieve(id);if(session.status!=='open')throw Error('Not expirable');session.status='expired';session.url=null;return session;};
 const event=(id:string,type:Stripe.Event.Type='invoice.paid',created=Math.floor(Date.now()/1000))=>({id,type,created,livemode:false,data:{object:type.startsWith('invoice')?{id:invoice.id}:{id:sub.id}}}) as Stripe.Event;
 return {env,DB,...seed,client,sub,invoice,event,checkoutSessions};
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
test('Stripe Checkout : achat direct, reprise, doublons et prix serveur',async t=>{
 const f=await fixture(t,'bill-checkout'),sessions=new Map<string,unknown>();let calls=0;
 f.client.checkout.sessions.create=async(params,options)=>{calls++;const key=options!.idempotencyKey!,previous=sessions.get(key);if(previous)assert.deepEqual(params,previous);else sessions.set(key,params);if(calls===1)throw Error('Temporary Stripe transport failure');return {id:'cs_fixture_'+sessions.size,url:'https://checkout.stripe.com/c/pay/cs_fixture_'+sessions.size} as Stripe.Response<Stripe.Checkout.Session>;};
 await assert.rejects(createCheckout(f.env,f.agencyId,'fixture@example.com','https://bienvu.online',{plan:'solo',accepted:false},'checkout-fixture-key',f.client));
 await assert.rejects(createCheckout(f.env,f.agencyId,'fixture@example.com','https://bienvu.online',{plan:'solo',price:1},'checkout-fixture-key',f.client));
 await assert.rejects(createCheckout(f.env,f.agencyId,'fixture@example.com','https://bienvu.online',{plan:'solo'},'bad-key',f.client));
 assert.equal(calls,0,'Les données incohérentes sont refusées avant Stripe');
 await assert.rejects(createCheckout(f.env,f.agencyId,'fixture@example.com','https://bienvu.online',{plan:'solo'},'checkout-fixture-key',f.client),/Temporary Stripe/);
 const result=await Promise.all([1,2].map(()=>createCheckout(f.env,f.agencyId,'fixture@example.com','https://bienvu.online',{plan:'solo'},'checkout-fixture-key',f.client)));assert.equal(result[0].url,result[1].url);
 const params=[...sessions.values()][0] as Stripe.Checkout.SessionCreateParams;assert.equal(params.line_items![0].price_data!.unit_amount,5000);assert.equal('payment_method_types' in params,false);assert.equal(params.automatic_tax!.enabled,false);assert.equal(params.managed_payments!.enabled,false);
 assert.equal(params.consent_collection?.terms_of_service??'none','none');
 const submit=params.custom_text?.submit;assert.ok(submit&&typeof submit==='object');assert.match(submit.message,/Résiliation à la fin de la période payée/);
 await createCheckout(f.env,f.agencyId,'fixture@example.com','https://bienvu.online',{plan:'solo',accepted:true},'checkout-fixture-key',f.client);assert.ok(calls<=3,'Une ancienne page ouverte reprend la même session');
 await createCheckout(f.env,f.agencyId,'fixture@example.com','https://bienvu.online',{plan:'equipe'},'checkout-other-key00',f.client);
 assert.equal(f.checkoutSessions.get('cs_fixture_1')!.status,'expired');
 assert.equal((await f.DB.prepare('SELECT count(*) n FROM billing_checkouts WHERE expires_at>?').bind(new Date().toISOString()).first<{n:number}>())!.n,1);
 assert.equal((await f.DB.prepare('SELECT count(*) n FROM allocations WHERE kind=?').bind('paid').first<{n:number}>())!.n,0);
});
test('Checkout : changement d’offre, retour vers une ancienne clé et session expirée chez Stripe',async t=>{
 const f=await fixture(t,'checkout-switch');let calls=0;
 f.client.checkout.sessions.create=async()=>{const id='cs_switch_'+(++calls);return {id,url:'https://checkout.stripe.com/c/pay/'+id} as Stripe.Response<Stripe.Checkout.Session>;};
 const open=(plan:string,key:string)=>createCheckout(f.env,f.agencyId,'fixture@example.com','https://bienvu.online',{plan},key,f.client);
 const solo=await open('solo','switch-solo-key-first'),resumed=await open('solo','switch-solo-new-tab-key');assert.equal(resumed.url,solo.url);assert.equal(calls,1);
 await open('agence','switch-agence-key-first');assert.equal(f.checkoutSessions.get('cs_switch_1')!.status,'expired');
 await assert.rejects(open('solo','switch-solo-key-first'),{code:'CONFLICT',fields:{checkout:'expired'}});
 await open('solo','switch-solo-key-second');assert.equal(f.checkoutSessions.get('cs_switch_2')!.status,'expired');assert.equal(calls,3);
 const session=await f.client.checkout.sessions.retrieve('cs_switch_3');session.status='expired';session.url=null;
 await assert.rejects(open('solo','switch-solo-key-second'),{code:'CONFLICT',fields:{checkout:'expired'}});
 await open('equipe','switch-equip-key-first');assert.equal(calls,4);
 assert.equal((await f.DB.prepare('SELECT count(*) n FROM billing_checkouts WHERE expires_at>?').bind(new Date().toISOString()).first<{n:number}>())!.n,1);
 assert.equal((await creditBalance(f.DB,f.agencyId)).available,0);
});
test('Checkout : création incertaine reprise depuis un autre onglet avec la clé Stripe d’origine',async t=>{
 const f=await fixture(t,'checkout-uncertain'),params:unknown[]=[];const keys:string[]=[];
 f.client.checkout.sessions.create=async(input,options)=>{params.push(input);keys.push(options!.idempotencyKey!);if(keys.length===1)throw Error('Network uncertain');return {id:'cs_recovered',url:'https://checkout.stripe.com/c/pay/cs_recovered'} as Stripe.Response<Stripe.Checkout.Session>;};
 const open=(plan:string,key:string)=>createCheckout(f.env,f.agencyId,'fixture@example.com','https://bienvu.online',{plan},key,f.client);
 await assert.rejects(open('solo','uncertain-first-key00'),/Network uncertain/);
 await assert.rejects(open('agence','uncertain-second-key00'),{code:'CONFLICT',fields:{checkout:'busy'}});assert.equal(keys.length,1);
 await open('solo','uncertain-new-tab-key00');assert.equal(keys.length,2);assert.equal(keys[0],keys[1]);assert.deepEqual(params[0],params[1]);
 const session=await f.client.checkout.sessions.retrieve('cs_recovered');session.customer='cus_foreign';
 await assert.rejects(open('solo','uncertain-foreign-key00'),{code:'FORBIDDEN'});assert.equal(keys.length,2);
});
test('Checkout : échec d’expiration et paiement concomitant ne libèrent pas un deuxième paiement',async t=>{
 const f=await fixture(t,'checkout-payment-race');let calls=0;
 f.client.checkout.sessions.create=async()=>{const id='cs_race_'+(++calls);return {id,url:'https://checkout.stripe.com/c/pay/'+id} as Stripe.Response<Stripe.Checkout.Session>;};
 const open=(plan:string,key:string)=>createCheckout(f.env,f.agencyId,'fixture@example.com','https://bienvu.online',{plan},key,f.client);
 await open('solo','race-solo-key-first');const session=await f.client.checkout.sessions.retrieve('cs_race_1');
 f.client.checkout.sessions.expire=async()=>{throw Error('Expiration failed');};
 await assert.rejects(open('agence','race-agence-key-first'),{code:'BILLING_UNAVAILABLE'});assert.equal(calls,1);assert.equal(session.status,'open');
 assert.equal((await f.DB.prepare('SELECT count(*) n FROM billing_checkouts WHERE expires_at>?').bind(new Date().toISOString()).first<{n:number}>())!.n,1);
 f.client.checkout.sessions.expire=async()=>{session.status='complete';session.subscription='sub_race';session.url=null;throw Error('Completed during expiry');};
 await assert.rejects(open('agence','race-agence-key-first'),{code:'CONFLICT',fields:{checkout:'confirmed'}});assert.equal(calls,1);
 await f.DB.prepare('UPDATE billing_checkouts SET expires_at=?').bind(new Date(Date.now()-1000).toISOString()).run();
 await assert.rejects(open('equipe','race-equip-key-first'),{code:'CONFLICT',fields:{checkout:'confirmed'}});assert.equal(calls,1,'Une attente de webhook reste sûre après la date d’expiration');
 await f.DB.prepare("INSERT INTO subscriptions(agency_id,stripe_customer_id,stripe_subscription_id,plan_code,status,stripe_mode,updated_at) VALUES(?,?,?,'solo','canceled','test',?)").bind(f.agencyId,'cus_fixture','sub_race',new Date().toISOString()).run();
 await open('agence','race-agence-key-first');assert.equal(calls,2,'Un abonnement déjà synchronisé et terminé permet une nouvelle souscription');
});
