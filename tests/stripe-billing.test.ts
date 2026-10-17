import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import type {Stripe} from '../apps/web/lib/billing';
import {migrateNarrationProbe,seedNarrationFixture} from '../scripts/narration-fixtures';
import {billingStatus,createCheckout,createPortal,processStripeEvent,stripeClient,stripeWebhook} from '../apps/web/lib/billing';
import {creditBalance,creditHistory,generationRights,admitGeneration,failGeneration} from '../packages/db/src/index';
import {savePromotion,validatePromotion,checkoutPromotion,reconcilePromotionReservations,promotionReport,promotionValidationAttempt} from '../apps/web/lib/subscription-promotions';
import {commercialSummary} from '../apps/web/lib/commercial';
import {defaultVideoCustomization} from '../packages/contracts/src/index';
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
test('Portail Stripe : factures sans abonnement, même si les nouveaux paiements sont suspendus',async t=>{
 const f=await fixture(t,'portal-topup');let params:Stripe.BillingPortal.SessionCreateParams|undefined;
 f.client.billingPortal.sessions.create=async input=>{params=input;return {url:'https://billing.stripe.com/p/session/fixture'} as Stripe.Response<Stripe.BillingPortal.Session>;};
 const env={...f.env,STRIPE_WEBHOOK_SECRET:undefined};
 const status=await billingStatus(env,f.agencyId);assert.equal(status.subscription,null);assert.equal(status.enabled,false);assert.equal(status.portalAvailable,true);
 const before=await creditBalance(f.DB,f.agencyId);
 assert.deepEqual(await createPortal(env,f.agencyId,'https://bienvu.online',f.client),{url:'https://billing.stripe.com/p/session/fixture'});
 assert.equal(params?.customer,'cus_fixture');assert.equal(params?.return_url,'https://bienvu.online/abonnement#facturation');
 assert.deepEqual(await creditBalance(f.DB,f.agencyId),before,'Consulter les factures ne modifie aucun crédit');
 assert.equal((await f.DB.prepare('SELECT count(*) n FROM subscriptions').first<{n:number}>())!.n,0);
});
test('Portail Stripe : ni compte d’une autre agence, ni client d’un autre mode',async t=>{
 const f=await fixture(t,'portal-scope'),other=await seedNarrationFixture(f.DB,'portal-other');let calls=0;
 await f.DB.prepare('DELETE FROM billing_customers WHERE agency_id=?').bind(f.agencyId).run();
 await f.DB.prepare('INSERT INTO billing_customers VALUES(?,?,?,?)').bind(f.agencyId,'live','cus_live_fixture',new Date().toISOString()).run();
 await f.DB.prepare('INSERT INTO billing_customers VALUES(?,?,?,?)').bind(other.agencyId,'test','cus_other_fixture',new Date().toISOString()).run();
 f.client.billingPortal.sessions.create=async()=>{calls++;throw Error('Unexpected Stripe call');};
 assert.equal((await billingStatus(f.env,f.agencyId)).portalAvailable,false);
 await assert.rejects(createPortal(f.env,f.agencyId,'https://bienvu.online',f.client),{code:'NOT_FOUND'});
 await assert.rejects(createPortal({...f.env,BILLING_MODE:'live'},f.agencyId,'https://bienvu.online',f.client),{code:'BILLING_UNAVAILABLE'});
 assert.equal((await billingStatus({...f.env,BILLING_MODE:'live'},f.agencyId)).portalAvailable,false);
 assert.equal(calls,0,'Aucun compte Stripe créé ni mauvais portail ouvert');
});
test('Portail Stripe : accessible après résiliation, liens limités à HTTPS sur Stripe',async t=>{
 const f=await fixture(t,'portal-ended');f.sub.status='canceled';
 await processStripeEvent(f.env,f.event('evt_ended','customer.subscription.deleted'),'b'.repeat(64),f.client);
 assert.equal((await billingStatus(f.env,f.agencyId)).portalAvailable,true);
 let url='https://billing.stripe.com/p/session/fixture';
 f.client.billingPortal.sessions.create=async()=>({url}) as Stripe.Response<Stripe.BillingPortal.Session>;
 assert.equal((await createPortal(f.env,f.agencyId,'https://bienvu.online',f.client)).url,url);
 for(const unsafe of ['http://billing.stripe.com/p/session/fixture','https://example.com/p/session/fixture']){
  url=unsafe;await assert.rejects(createPortal(f.env,f.agencyId,'https://bienvu.online',f.client),{code:'BILLING_UNAVAILABLE'});
 }
});
async function promotionFixture(t:Parameters<typeof fixture>[0],label:string,maxRedemptions:number|null=null){
 const f=await fixture(t,label),at=new Date().toISOString(),actor='promo-admin-'+label;
 await f.DB.prepare('INSERT INTO auth_user(id,name,email,emailVerified,createdAt,updatedAt) VALUES(?,?,?,1,?,?)').bind(actor,'Admin',actor+'@example.com',at,at).run();
 const settings={code:'BIENVU20',name:'Campagne de test',active:true,startsAt:null,endsAt:null,maxRedemptions,plans:['solo','agence','equipe','reseau']};
 const {id}=await savePromotion(f.DB,actor,{action:'save',settings,reason:'Création de la campagne de test'});
 f.sub.metadata.plan='solo';f.sub.items.data[0].price.unit_amount=5000;f.invoice.amount_paid=5000;f.invoice.subtotal=5000;f.invoice.subtotal_excluding_tax=5000;f.invoice.lines.data[0].amount=5000;
 let calls=0;
 f.client.checkout.sessions.create=async params=>{
  const session={id:`cs_${label}_${++calls}`,url:'https://checkout.stripe.com/c/pay/promotion',status:'open',customer:params!.customer,client_reference_id:params!.client_reference_id,
    metadata:params!.metadata,mode:'subscription',livemode:false,subscription:null} as unknown as Stripe.Checkout.Session;
  f.checkoutSessions.set(session.id,session);return session as Stripe.Response<Stripe.Checkout.Session>;
 };
 async function open(key='promotion-checkout-key-001',code='BIENVU20',agency=f.agencyId){
  await createCheckout(f.env,agency,'fixture@example.com','https://bienvu.online',{plan:'solo',promotionCode:code},key,f.client);
  const intent=(await checkoutPromotion(f.DB,agency,'test',key))!;
  const row=await f.DB.prepare('SELECT session_id id FROM billing_checkouts WHERE agency_id=? AND idempotency_key=?').bind(agency,key).first<{id:string}>()??await f.DB.prepare('SELECT session_id id FROM billing_checkouts WHERE agency_id=? ORDER BY created_at DESC LIMIT 1').bind(agency).first<{id:string}>();return {intent,session:f.checkoutSessions.get(row!.id)!};
 }
 async function pay(){const result=await open();result.session.status='complete';result.session.subscription=f.sub.id;(f.sub.metadata as Record<string,string>).promotionIntentId=result.intent.id;
  await processStripeEvent(f.env,f.event('evt_promo_paid'),'a'.repeat(64),f.client);return result;}
 return {...f,actor,promotionId:id,settings,open,pay};
}
test('Codes bonus : validation, première facture seulement, replay parallèle et crédits consommés en priorité',async t=>{
 const f=await promotionFixture(t,'promo-paid'),preview=await validatePromotion(f.DB,'  bienvu20 ','test',f.agencyId);
 assert.deepEqual(preview.preview.plans.map(p=>p.total),[60,120,240,600]);
 const {intent,session}=await f.open();assert.equal((await creditBalance(f.DB,f.agencyId)).available,0,'Un Checkout ouvert ne donne aucun droit');
 session.status='complete';session.subscription=f.sub.id;(f.sub.metadata as Record<string,string>).promotionIntentId=intent.id;
 await Promise.all([1,2].map(n=>processStripeEvent(f.env,f.event('evt_promo_'+n),String(n).repeat(64),f.client)));
 await processStripeEvent(f.env,f.event('evt_promo_again'),'3'.repeat(64),f.client);
 const balance=await creditBalance(f.DB,f.agencyId);assert.equal(balance.available,60);assert.equal(balance.total,60);assert.equal(balance.bonusAvailable,10);assert.equal(balance.purchasedAvailable,0);
 assert.equal((await f.DB.prepare('SELECT count(*) n FROM credit_promotion_redemptions').first<{n:number}>())!.n,1);
 const history=await creditHistory(f.DB,f.agencyId);assert.equal(history.bonuses![0].credits,10);assert.equal(history.bonuses![0].code,'BIENVU20');
 await f.DB.prepare('INSERT INTO hosted_import_budget VALUES(?,0,9000,0)').bind(new Date().toISOString().slice(0,7)).run();
 const run=await admitGeneration(f.DB,f.agencyId,'promo-generation-key-001',{listingId:'listing-promo-paid'},'true');
 assert.equal((await f.DB.prepare('SELECT allocation_id id FROM generation_credit_parts WHERE job_id=?').bind(run.jobId).first<{id:string}>())!.id,'promotion-'+intent.id);
 await failGeneration(f.DB,run,'FIXTURE');assert.equal((await creditBalance(f.DB,f.agencyId)).available,60);
 await assert.rejects(validatePromotion(f.DB,'BIENVU20','test',f.agencyId),{code:'VALIDATION_ERROR',fields:{promotion:'used'}});
 const old=f.invoice.lines.data[0].period.start;f.invoice.id='in_promo_next';f.invoice.billing_reason='subscription_cycle';f.invoice.lines.data[0].period={start:old+30*86400,end:old+60*86400};f.sub.items.data[0].current_period_start=old+30*86400;f.sub.items.data[0].current_period_end=old+60*86400;
 await processStripeEvent(f.env,f.event('evt_promo_renew'),'4'.repeat(64),f.client);
 const next=await creditBalance(f.DB,f.agencyId,(old+30*86400+20)*1000);assert.equal(next.available,100,'50 nouveaux + 50 reportés, sans reporter le bonus');assert.equal(next.bonusAvailable,undefined);
 assert.equal((await f.DB.prepare('SELECT count(*) n FROM credit_promotion_redemptions').first<{n:number}>())!.n,1);
 const real=await promotionReport(f.DB,'live',new URLSearchParams());assert.equal((real.totals as {redeemed:number}).redeemed,0);
});
test('Codes bonus : dernière place atomique, remplacement du code et réservation conservée malgré une modification admin',async t=>{
 const f=await promotionFixture(t,'promo-race',1),second=await seedNarrationFixture(f.DB,'promo-second');
 await f.DB.prepare('INSERT INTO billing_customers VALUES(?,?,?,?)').bind(second.agencyId,'test','cus_second',new Date().toISOString()).run();
 const attempts=await Promise.allSettled([f.open('promotion-agency-one'),f.open('promotion-agency-two','BIENVU20',second.agencyId)]);
 assert.equal(attempts.filter(a=>a.status==='fulfilled').length,1);assert.equal((await f.DB.prepare("SELECT count(*) n FROM billing_promotion_intents WHERE state='reserved'").first<{n:number}>())!.n,1);
 const winner=attempts.find(a=>a.status==='fulfilled') as PromiseFulfilledResult<Awaited<ReturnType<typeof f.open>>>;
 await savePromotion(f.DB,f.actor,{action:'save',id:f.promotionId,version:1,settings:{...f.settings,active:false},reason:'Fin anticipée de la campagne'});
 winner.value.session.status='complete';winner.value.session.subscription=f.sub.id;f.sub.metadata.agencyId=winner.value.session.client_reference_id!;f.sub.customer=winner.value.session.customer as string;f.invoice.customer=f.sub.customer;(f.sub.metadata as Record<string,string>).promotionIntentId=winner.value.intent.id;
 await processStripeEvent(f.env,f.event('evt_reserved_paid'),'b'.repeat(64),f.client);assert.equal((await creditBalance(f.DB,f.sub.metadata.agencyId)).available,60,'Une désactivation ne retire pas un bonus déjà réservé');
 await assert.rejects(savePromotion(f.DB,f.actor,{action:'save',id:f.promotionId,version:1,settings:f.settings,reason:'Écriture obsolète du formulaire'}),{code:'CONFLICT'});
});
test('Codes bonus : paiement incertain récupéré, changement de code et expiration confirmée par Stripe',async t=>{
 const f=await promotionFixture(t,'promo-recovery'),original=f.client.checkout.sessions.create;let first=true;
 f.client.checkout.sessions.create=async(...args)=>{if(first){first=false;throw Error('Network uncertain');}return original(...args);};
 await assert.rejects(f.open(),/Network uncertain/);const intent=await checkoutPromotion(f.DB,f.agencyId,'test','promotion-checkout-key-001');
 await assert.rejects(createCheckout(f.env,f.agencyId,'fixture@example.com','https://bienvu.online',{plan:'solo'},'promotion-no-code-key',f.client),{code:'CONFLICT',fields:{checkout:'busy'}});
 await savePromotion(f.DB,f.actor,{action:'save',id:f.promotionId,version:1,settings:{...f.settings,active:false},reason:'Désactivation de la campagne'});
 assert.deepEqual((await validatePromotion(f.DB,'BIENVU20','test',f.agencyId)).preview.plans.map(p=>p.plan),['solo'],'Le code déjà réservé reste visible après sa désactivation');
 const recovered=await f.open('promotion-checkout-key-002');assert.equal(recovered.intent,null,'La reprise utilise la clé de la première tentative');
 const row=await f.DB.prepare('SELECT session_id id FROM billing_checkouts WHERE idempotency_key=?').bind('promotion-checkout-key-001').first<{id:string}>();assert.ok(row?.id);
 await createCheckout(f.env,f.agencyId,'fixture@example.com','https://bienvu.online',{plan:'solo'},'promotion-without-code',f.client);
 assert.equal((await checkoutPromotion(f.DB,f.agencyId,'test','promotion-checkout-key-001'))!.state,'released');assert.equal(f.checkoutSessions.get(row.id)!.status,'expired');
 assert.equal(intent!.bonusCredits,10);
});
test('Codes bonus : remboursement proportionnel, litige et dette sur un bonus déjà utilisé',async t=>{
 const f=await promotionFixture(t,'promo-refund');await f.pay();
 await f.DB.prepare('UPDATE financial_receipts SET refunded_cents=2500,reversed_credits=25 WHERE invoice_id=?').bind(f.invoice.id).run();
 assert.equal((await creditBalance(f.DB,f.agencyId)).available,30);assert.equal((await creditHistory(f.DB,f.agencyId)).bonuses![0].reversed,5);
 await f.DB.prepare('UPDATE financial_receipts SET disputed=1 WHERE invoice_id=?').bind(f.invoice.id).run();assert.equal((await creditBalance(f.DB,f.agencyId)).available,0);
 await f.DB.prepare('UPDATE financial_receipts SET disputed=0 WHERE invoice_id=?').bind(f.invoice.id).run();assert.equal((await creditBalance(f.DB,f.agencyId)).available,30);
 await f.DB.prepare("UPDATE allocations SET consumed=6 WHERE period_key LIKE 'promotion:%'").run();assert.equal((await creditBalance(f.DB,f.agencyId)).available,0,'Une dette de bonus bloque aussi les autres sources');
});
test('Codes bonus : calendrier, plans et aucune attribution via des métadonnées étrangères',async t=>{
 const f=await promotionFixture(t,'promo-validation');await assert.rejects(validatePromotion(f.DB,'INCONNU','test'),{code:'VALIDATION_ERROR',fields:{promotion:'invalid'}});
 await f.DB.prepare('UPDATE subscription_promotions SET starts_at=?').bind(new Date(Date.now()+3600000).toISOString()).run();await assert.rejects(validatePromotion(f.DB,'BIENVU20','test'),{fields:{promotion:'scheduled'}});
 await f.DB.prepare('UPDATE subscription_promotions SET starts_at=NULL,ends_at=?').bind(new Date(Date.now()-1000).toISOString()).run();await assert.rejects(validatePromotion(f.DB,'BIENVU20','test'),{fields:{promotion:'expired'}});
 await f.DB.prepare('UPDATE subscription_promotions SET ends_at=NULL,plans_json=?').bind('["agence"]').run();await assert.rejects(validatePromotion(f.DB,'BIENVU20','test',f.agencyId,'solo'),{fields:{promotion:'plan'}});
 await f.DB.prepare('UPDATE subscription_promotions SET plans_json=?').bind('["solo"]').run();const {intent,session}=await f.open();session.status='complete';session.subscription='sub_foreign';(f.sub.metadata as Record<string,string>).promotionIntentId=intent.id;
 await assert.rejects(processStripeEvent(f.env,f.event('evt_foreign_promo'),'e'.repeat(64),f.client),{code:'FORBIDDEN'});assert.equal((await creditBalance(f.DB,f.agencyId)).available,0);
});
test('Codes bonus : 15 validations par minute, changement de minute et confidentialité des compteurs',async t=>{
 const f=await fixture(t,'promo-rate-limit'),secret='private-validation-secret',ip='127.0.0.1';
 // Keep every request in its intended window, even if CI crosses a real minute.
 let now=Date.UTC(2026,9,13,23,59,59,999);t.mock.method(Date,'now',()=>now);
 const attempt=(address=ip)=>promotionValidationAttempt(f.DB,secret,address);
 for(let n=0;n<15;n++)await attempt();
 await assert.rejects(attempt(),{code:'RATE_LIMITED'});
 assert.deepEqual((await f.DB.prepare('SELECT attempts FROM promotion_validation_limits').all()).results,[{attempts:15}]);
 now+=1;
 for(let n=0;n<15;n++)await attempt();
 await assert.rejects(attempt(),{code:'RATE_LIMITED'});
 await attempt('127.0.0.2');
 const rows=(await f.DB.prepare('SELECT bucket,attempts FROM promotion_validation_limits ORDER BY attempts').all<{bucket:string;attempts:number}>()).results;
 assert.deepEqual(rows.map(row=>row.attempts),[1,15,15]);
 for(const row of rows)assert.match(row.bucket,/^[a-f0-9]{64}$/);
 assert.doesNotMatch(JSON.stringify(rows),/127\.0\.0\.[12]|private-validation-secret/);
});
test('Codes bonus : places abandonnées libérées seulement si Stripe confirme une expiration',async t=>{
 const f=await promotionFixture(t,'promo-expiration',1),{session}=await f.open();await f.DB.prepare('UPDATE billing_checkouts SET expires_at=?').bind(new Date(Date.now()-1000).toISOString()).run();
 session.status='complete';assert.equal((await reconcilePromotionReservations(f.env,f.client)).released,0);
 session.status='expired';assert.equal((await reconcilePromotionReservations(f.env,f.client)).released,1);
 assert.equal((await checkoutPromotion(f.DB,f.agencyId,'test','promotion-checkout-key-001'))!.state,'released');
 await validatePromotion(f.DB,'BIENVU20','test',f.agencyId);
});
test('Codes bonus : reprise d’une facture arrivée avant la réponse Checkout et restitution partielle dans le bon lot',async t=>{
 const f=await promotionFixture(t,'promo-partial'),{intent,session}=await f.open();session.status='complete';session.subscription=f.sub.id;(f.sub.metadata as Record<string,string>).promotionIntentId=intent.id;
 await f.DB.prepare('UPDATE billing_checkouts SET session_id=NULL,url=NULL').run();
 f.client.checkout.sessions.list=(async()=>({data:[session],has_more:false})) as unknown as typeof f.client.checkout.sessions.list;
 await processStripeEvent(f.env,f.event('evt_early_invoice'),'7'.repeat(64),f.client);
 assert.equal((await f.DB.prepare('SELECT session_id id FROM billing_checkouts').first<{id:string}>())!.id,session.id);
 await f.DB.prepare('UPDATE allocations SET consumed=8 WHERE id=?').bind('promotion-'+intent.id).run();
 await f.DB.prepare('INSERT INTO hosted_import_budget VALUES(?,0,9000,0)').bind(new Date().toISOString().slice(0,7)).run();
 const run=await admitGeneration(f.DB,f.agencyId,'promo-partial-run-key01',{listingId:'listing-promo-partial',customization:{...defaultVideoCustomization(),runwayPhotos:[0,1,2]}},'true');
 const parts=await f.DB.prepare('SELECT allocation_id id,amount FROM generation_credit_parts WHERE job_id=? ORDER BY allocation_id').bind(run.jobId).all<{id:string;amount:number}>();assert.equal(parts.results.length,2);assert.ok(parts.results.every(p=>p.amount===2));
 const raw=await f.DB.prepare('SELECT result_json data FROM listing_imports WHERE id=?').bind('listing-promo-partial').first<{data:string}>(),photo=JSON.parse(raw!.data).photos[0],at=new Date().toISOString();
 await f.DB.prepare("INSERT INTO photo_animations(id,agency_id,job_id,photo_id,source_sha256,slot,month,mode,model,credits,reserved_cents,state,created_at,updated_at) VALUES(?,?,?,?,?,0,?,'mock','gen4_turbo',25,0,'ready',?,?)").bind('promo-animation',f.agencyId,run.jobId,photo.id,photo.contentHash,at.slice(0,7),at,at).run();
 await failGeneration(f.DB,run,'FIXTURE');
 const paid=await f.DB.prepare('SELECT allocation_id id,consumed FROM generation_credit_parts WHERE job_id=? ORDER BY consumed DESC').bind(run.jobId).all<{id:string;consumed:number}>();assert.equal(paid.results[0].id,'promotion-'+intent.id);assert.equal(paid.results[0].consumed,1);assert.equal(paid.results[1].consumed,0);
 const revenue=await f.DB.prepare('SELECT used,revenue_micros amount FROM finance_credit_attribution WHERE job_id=?').bind(run.jobId).first<{used:number;amount:number}>();assert.deepEqual(revenue,{used:1,amount:Math.floor(50e6/60)},'La recette répartit les 50 € sur les 60 crédits, sans ajouter de revenu fictif');
});
test('Codes bonus : création incertaine expirée, recherche Stripe bornée et absence de libération sur recherche incomplète',async t=>{
 const f=await promotionFixture(t,'promo-uncertain-expired',1);f.client.checkout.sessions.create=async()=>{throw Error('Network uncertain');};
 await assert.rejects(f.open(),/Network uncertain/);await f.DB.prepare('UPDATE billing_checkouts SET expires_at=?').bind(new Date(Date.now()-1000).toISOString()).run();
 f.client.checkout.sessions.list=(async()=>({data:[{id:'unrelated',metadata:{}}],has_more:true})) as unknown as typeof f.client.checkout.sessions.list;
 assert.equal((await reconcilePromotionReservations(f.env,f.client)).released,0,'Aucune libération après les cinq pages si la recherche reste incomplète');
 f.client.checkout.sessions.list=(async()=>({data:[],has_more:false})) as unknown as typeof f.client.checkout.sessions.list;
 assert.equal((await reconcilePromotionReservations(f.env,f.client)).released,1);
 assert.equal((await checkoutPromotion(f.DB,f.agencyId,'test','promotion-checkout-key-001'))!.state,'released');
});
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

// Annual payment must fund monthly periods, never expose the entire year at once.
import {subscriptionCreditPeriods} from '../apps/web/lib/subscription-periods';
import {subscriptionPricing,creditPlans} from '../packages/contracts/src/credits';
function annual(f:Awaited<ReturnType<typeof fixture>>,start=Math.floor(Date.now()/1000)-10){
 const end=(()=>{const d=new Date(start*1000);d.setUTCFullYear(d.getUTCFullYear()+1);return Math.floor(d.getTime()/1000);})();
 f.sub.metadata.plan='solo';Object.assign(f.sub.items.data[0].price,{unit_amount:54000,recurring:{interval:'year',interval_count:1}});
 Object.assign(f.sub.items.data[0],{current_period_start:start,current_period_end:end});
 Object.assign(f.invoice,{amount_paid:54000,subtotal:54000,subtotal_excluding_tax:54000});
 Object.assign(f.invoice.lines.data[0],{amount:54000,period:{start,end}});
 return subscriptionCreditPeriods('year',start,end);
}
test('Annuel : remise exacte sur les quatre offres et calendrier ancré aux fins de mois',()=>{
 assert.deepEqual(creditPlans.filter(p=>p.price).map(p=>subscriptionPricing(p.price,'year').amountCents),[54000,108000,216000,540000]);
 const periods=subscriptionCreditPeriods('year',Date.parse('2028-01-31T15:22:13Z')/1000,Date.parse('2029-01-31T15:22:13Z')/1000);
 assert.equal(periods.length,12);assert.equal(periods[0].end,'2028-02-29T15:22:13.000Z');assert.equal(periods[1].end,'2028-03-31T15:22:13.000Z');
 const leap=subscriptionCreditPeriods('year',Date.parse('2028-02-29T10:00:00Z')/1000,Date.parse('2029-02-28T10:00:00Z')/1000);assert.equal(leap.at(-1)!.end,'2029-02-28T10:00:00.000Z');
 assert.throws(()=>subscriptionCreditPeriods('year',1,1+30*86400),/INVALID/);
});
test('Annuel Checkout : montant serveur, changement de cadence et idempotence sans reprendre le mauvais prix',async t=>{
 const f=await fixture(t,'annual-checkout'),seen:Stripe.Checkout.SessionCreateParams[]=[];
 f.client.checkout.sessions.create=async params=>{seen.push(params!);const id='cs_annual_'+seen.length;return {id,url:'https://checkout.stripe.com/c/pay/'+id} as Stripe.Response<Stripe.Checkout.Session>;};
 const open=(billingInterval:string,key:string)=>createCheckout(f.env,f.agencyId,'fixture@example.com','https://bienvu.online',{plan:'solo',billingInterval},key,f.client);
 await open('month','annual-month-key-001');
 await assert.rejects(open('year','annual-month-key-001'),{fields:{checkout:'invalid_intent'}});
 await open('year','annual-year-key-0001');assert.equal(f.checkoutSessions.get('cs_annual_1')!.status,'expired');
 assert.equal(seen[1].line_items![0].price_data!.unit_amount,54000);assert.equal(seen[1].line_items![0].price_data!.recurring!.interval,'year');
 const submit=seen[1].custom_text!.submit;assert.ok(submit&&typeof submit==='object');assert.match(submit.message,/540 € HT facturés pour un an/);assert.equal(seen[1].subscription_data!.metadata!.billingInterval,'year');
 await open('year','annual-year-other-tab');assert.equal(seen.length,2);
 await assert.rejects(open('week','annual-invalid-key01'),{code:'VALIDATION_ERROR'});
 await open('month','annual-new-month-key');assert.equal(f.checkoutSessions.get('cs_annual_2')!.status,'expired');assert.equal(seen[2].line_items![0].price_data!.unit_amount,5000);
 assert.equal((await f.DB.prepare('SELECT count(*) n FROM financial_receipts').first<{n:number}>())!.n,0);
});
test('Annuel : paiement vérifié, replay concurrent, 12 quotas bornés, report limité à un mois et fin des droits',async t=>{
 const f=await fixture(t,'annual-periods'),periods=annual(f);
 await Promise.all([1,2].map(n=>processStripeEvent(f.env,f.event('evt_annual_'+n),String(n).repeat(64),f.client)));
 assert.equal((await billingStatus(f.env,f.agencyId)).subscription!.billingInterval,'year');
 assert.equal((await creditBalance(f.DB,f.agencyId)).available,50);assert.equal((await generationRights(f.DB,f.agencyId,'true')).developmentRemaining,50);
 const rows=await f.DB.prepare('SELECT a.id,a.valid_from start,a.valid_until end FROM annual_credit_periods p JOIN allocations a ON a.id=p.allocation_id ORDER BY ordinal').all<{id:string;start:string;end:string}>();
 assert.deepEqual(rows.results.map(({start,end})=>({start,end})),periods);assert.equal(rows.results.length,12);
 await f.DB.prepare('UPDATE allocations SET consumed=12 WHERE id=?').bind(rows.results[0].id).run();
 const second=await creditBalance(f.DB,f.agencyId,Date.parse(periods[1].start));assert.equal(second.available,88);assert.equal(second.rolloverAvailable,38);
 const third=await creditBalance(f.DB,f.agencyId,Date.parse(periods[2].start));assert.equal(third.available,100,'Les 38 crédits déjà reportés ne sont pas reportés de nouveau');
 assert.equal((await f.DB.prepare('SELECT count(*) n FROM billing_invoices').first<{n:number}>())!.n,1);
 assert.deepEqual(await f.DB.prepare('SELECT credits,gross_cents gross FROM financial_receipts').first(),{credits:600,gross:54000});
 f.sub.cancel_at_period_end=true;await processStripeEvent(f.env,f.event('evt_annual_cancel','customer.subscription.updated'),'c'.repeat(64),f.client);
 assert.equal((await creditBalance(f.DB,f.agencyId,Date.parse(periods[11].start))).available,100,'La résiliation conserve l’année payée');
 assert.equal((await creditBalance(f.DB,f.agencyId,Date.parse(periods[11].end))).available,0);
 const renewalStart=f.invoice.lines.data[0].period.end,renewed=annual(f,renewalStart);f.invoice.id='in_annual_renew';f.invoice.billing_reason='subscription_cycle';
 await processStripeEvent(f.env,f.event('evt_annual_renew'),'d'.repeat(64),f.client);
 assert.equal((await creditBalance(f.DB,f.agencyId,Date.parse(renewed[0].start))).available,100);assert.equal((await f.DB.prepare('SELECT count(*) n FROM annual_credit_periods').first<{n:number}>())!.n,24);
});
test('Annuel : impayé, faux prix et durée incohérente ne donnent aucun crédit',async t=>{
 const f=await fixture(t,'annual-invalid');annual(f);
 await processStripeEvent(f.env,f.event('evt_annual_unpaid','invoice.payment_failed'),'1'.repeat(64),f.client);assert.equal((await creditBalance(f.DB,f.agencyId)).available,0);
 f.sub.items.data[0].price.unit_amount=5000;await assert.rejects(processStripeEvent(f.env,f.event('evt_annual_bad_price'),'2'.repeat(64),f.client));
 f.sub.items.data[0].price.unit_amount=54000;f.invoice.lines.data[0].period.end-=86400;await assert.rejects(processStripeEvent(f.env,f.event('evt_annual_bad_end'),'3'.repeat(64),f.client));
 assert.equal((await f.DB.prepare('SELECT count(*) n FROM annual_credit_periods').first<{n:number}>())!.n,0);
});
test('Annuel : remboursement et litige affectent aussi les mois futurs, dette bloquante et revenu sans duplication',async t=>{
 const f=await fixture(t,'annual-refund'),periods=annual(f);await processStripeEvent(f.env,f.event('evt_annual_refund'),'e'.repeat(64),f.client);
 await f.DB.prepare('UPDATE financial_receipts SET refunded_cents=27000,reversed_credits=300 WHERE invoice_id=?').bind(f.invoice.id).run();
 assert.equal((await creditBalance(f.DB,f.agencyId)).available,25);assert.equal((await creditBalance(f.DB,f.agencyId,Date.parse(periods[8].start))).available,25);
 await f.DB.prepare('UPDATE financial_receipts SET disputed=1 WHERE invoice_id=?').bind(f.invoice.id).run();assert.equal((await creditBalance(f.DB,f.agencyId,Date.parse(periods[8].start))).available,0);
 await f.DB.prepare('UPDATE financial_receipts SET disputed=0 WHERE invoice_id=?').bind(f.invoice.id).run();assert.equal((await creditBalance(f.DB,f.agencyId)).available,25);
 await f.DB.prepare('UPDATE allocations SET consumed=26 WHERE id=?').bind('stripe-'+f.invoice.id).run();assert.equal((await creditBalance(f.DB,f.agencyId,Date.parse(periods[8].start))).available,0,'Une dette sur un mois bloque également les prochains');
 const summary=await commercialSummary(f.DB);assert.equal(summary.revenue.find(r=>r.mode==='test')!.revenueHtCents,27000,'Le reçu annuel est compté une seule fois');
 await f.DB.prepare('UPDATE financial_receipts SET refunded_cents=54000,reversed_credits=600 WHERE invoice_id=?').bind(f.invoice.id).run();assert.equal((await creditBalance(f.DB,f.agencyId,Date.parse(periods[11].start))).available,0);
});
test('Annuel : bonus promotionnel au premier mois seulement, admission et revenu annuel réparti sur tous les crédits',async t=>{
 const f=await promotionFixture(t,'annual-promo'),periods=annual(f),{intent,session}=await f.open();
 session.status='complete';session.subscription=f.sub.id;(f.sub.metadata as Record<string,string>).promotionIntentId=intent.id;
 await processStripeEvent(f.env,f.event('evt_annual_promo'),'f'.repeat(64),f.client);
 assert.equal((await creditBalance(f.DB,f.agencyId)).available,60);assert.equal((await creditHistory(f.DB,f.agencyId)).bonuses![0].expiresAt,periods[0].end);
 assert.equal((await creditBalance(f.DB,f.agencyId,Date.parse(periods[1].start))).available,100,'Le bonus n’est pas renouvelé ou reporté');
 await f.DB.prepare('INSERT INTO hosted_import_budget VALUES(?,0,9000,0)').bind(new Date().toISOString().slice(0,7)).run();
 const run=await admitGeneration(f.DB,f.agencyId,'annual-promo-run-key001',{listingId:'listing-annual-promo',customization:{...defaultVideoCustomization(),runwayPhotos:[0]}},'true');
 const listing=JSON.parse((await f.DB.prepare('SELECT result_json data FROM listing_imports WHERE id=?').bind('listing-annual-promo').first<{data:string}>())!.data),photo=listing.photos[0],at=new Date().toISOString();
 await f.DB.prepare("INSERT INTO photo_animations(id,agency_id,job_id,photo_id,source_sha256,slot,month,mode,model,credits,reserved_cents,state,created_at,updated_at) VALUES(?,?,?,?,?,0,?,'mock','gen4_turbo',25,0,'ready',?,?)").bind('annual-promo-animation',f.agencyId,run.jobId,photo.id,photo.contentHash,at.slice(0,7),at,at).run();
 await failGeneration(f.DB,run,'FIXTURE');
 assert.deepEqual(await f.DB.prepare('SELECT used,revenue_micros revenue FROM finance_credit_attribution WHERE job_id=?').bind(run.jobId).first(),{used:1,revenue:Math.floor(540e6/610)});
});
