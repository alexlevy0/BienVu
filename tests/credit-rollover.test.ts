import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {migrateNarrationProbe,seedNarrationFixture} from '../scripts/narration-fixtures';
import {creditBalance,admitGeneration,failGeneration} from '../packages/db/src/index';
import {creditPlans,defaultVideoCustomization} from '../packages/contracts/src/index';
import {stripeClient,processStripeEvent,createCheckout,type Stripe} from '../apps/web/lib/billing';
async function fixture(t:{after(fn:()=>Promise<void>):void},label:string){
 const mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:'export default {fetch(){return new Response("fixture")}}',compatibilityDate:'2026-09-27',d1Databases:['DB']}));t.after(()=>mf.dispose());const {DB}=await mf.getBindings<{DB:D1Database}>();await migrateNarrationProbe(DB);
 const seed=await seedNarrationFixture(DB,label),now=Date.now(),start=Math.floor(now/1000)-60;
 await DB.exec("UPDATE jobs SET status='failed',error_code='FIXTURE',lease_until=NULL; UPDATE generation_control SET enabled=1; UPDATE trial_policy SET free_enabled=1");
 await DB.prepare('INSERT OR IGNORE INTO hosted_import_budget VALUES(?,0,9000,0)').bind(new Date(now).toISOString().slice(0,7)).run();
 const env={DB,BILLING_MODE:'test',STRIPE_SECRET_KEY:'sk_test_fixture',STRIPE_WEBHOOK_SECRET:'whsec_fixture'},client=stripeClient(env);
 await DB.prepare('INSERT INTO billing_customers VALUES(?,?,?,?)').bind(seed.agencyId,'test','cus_roll',new Date(now).toISOString()).run();
 const price={id:'price_solo_roll',currency:'eur',unit_amount:5000,recurring:{interval:'month',interval_count:1}},sub={id:'sub_roll',customer:'cus_roll',metadata:{agencyId:seed.agencyId,plan:'solo'},items:{data:[{id:'si_roll',quantity:1,price,current_period_start:start,current_period_end:start+30*86400}]},status:'active',cancel_at_period_end:false};
 let invoice:Record<string,unknown>;
 client.subscriptions.retrieve=async()=>sub as unknown as Stripe.Response<Stripe.Subscription>;client.invoices.retrieve=async()=>invoice as unknown as Stripe.Response<Stripe.Invoice>;client.invoicePayments.list=(async()=>({data:[],has_more:false})) as unknown as typeof client.invoicePayments.list;
 async function pay(id:string,from:number,code='solo'){
  const plan=creditPlans.find(p=>p.code===code)!;price.id='price_'+code;price.unit_amount=plan.price*100;sub.items.data[0].current_period_start=from;sub.items.data[0].current_period_end=from+30*86400;
  invoice={id,customer:'cus_roll',status:'paid',currency:'eur',amount_paid:plan.price*100,subtotal:plan.price*100,subtotal_excluding_tax:plan.price*100,billing_reason:id==='in_roll_previous'?'subscription_create':'subscription_cycle',parent:{subscription_details:{subscription:'sub_roll'}},lines:{has_more:false,data:[{amount:plan.price*100,quantity:1,parent:{subscription_item_details:{subscription_item:'si_roll',proration:false}},pricing:{price_details:{price:price.id}},period:{start:from,end:from+30*86400}}]}};
  const event={id:'evt_'+id,type:'invoice.paid',created:Math.floor(Date.now()/1000),livemode:false,data:{object:{id}}} as Stripe.Event;
  await processStripeEvent(env,event,'a'.repeat(64),client);return event;
 }
 return {...seed,listingId:'listing-'+label,env,DB,client,start,pay,now};
}
test('Report : renouvellement payé, plafond, concurrence et crédit d’origine consommé en premier',async t=>{
 const f=await fixture(t,'roll-core');await f.pay('in_roll_previous',f.start-30*86400);
 await f.DB.exec("UPDATE allocations SET consumed=7 WHERE id='stripe-in_roll_previous'");await f.pay('in_roll_current',f.start);
 const [a,b]=await Promise.all([creditBalance(f.DB,f.agencyId),creditBalance(f.DB,f.agencyId)]);assert.equal(a.available,93);assert.equal(b.available,93);assert.equal(a.rolloverAvailable,43);assert.equal(a.purchasedAvailable,0);
 assert.equal((await f.DB.prepare('SELECT count(*) n FROM credit_rollover_links').first<{n:number}>())!.n,1);
 const job=await admitGeneration(f.DB,f.agencyId,'rollover-generation-001',{listingId:f.listingId,customization:{...defaultVideoCustomization(),mapDisabled:true,runwayPhotos:[0]}},'true');
 const parts=(await f.DB.prepare('SELECT allocation_id id,priority,amount FROM generation_credit_parts WHERE job_id=?').bind(job.jobId).all()).results;
 assert.deepEqual(parts,[{id:'stripe-in_roll_previous',priority:0,amount:2}]);
 assert.equal((await creditBalance(f.DB,f.agencyId)).reserved,2);
 const listing=JSON.parse((await f.DB.prepare('SELECT result_json FROM listing_imports WHERE id=?').bind(f.listingId).first<{result_json:string}>())!.result_json),photo=listing.photos[0],at=new Date().toISOString();
 await f.DB.prepare("INSERT INTO photo_animations(id,agency_id,job_id,photo_id,source_sha256,slot,month,mode,model,credits,reserved_cents,state,created_at,updated_at) VALUES(?,?,?,?,?,0,?,'mock','gen4_turbo',25,0,'ready',?,?)").bind('roll-animation',f.agencyId,job.jobId,photo.id,photo.contentHash,at.slice(0,7),at,at).run();
 await failGeneration(f.DB,job,'GENERATION_FAILED');assert.equal((await creditBalance(f.DB,f.agencyId)).rolloverAvailable,42);
 assert.equal((await f.DB.prepare("SELECT consumed FROM allocations WHERE id='stripe-in_roll_previous'").first<{consumed:number}>())!.consumed,8);
 assert.equal((await f.DB.prepare("SELECT consumed FROM allocations WHERE id='stripe-in_roll_current'").first<{consumed:number}>())!.consumed,0);
 await assert.rejects(f.DB.exec('DELETE FROM credit_rollover_links'),/IMMUTABLE/);
});
test('Report : facture future différée, crédits réservés exclus et absence de cumul sur trois mois',async t=>{
 const f=await fixture(t,'roll-future');await f.pay('in_roll_previous',f.start-30*86400);await f.DB.exec("UPDATE allocations SET reserved=5,consumed=10 WHERE id='stripe-in_roll_previous'");await f.pay('in_roll_current',f.start);
 assert.equal((await creditBalance(f.DB,f.agencyId)).rolloverAvailable,35);
 await f.pay('in_roll_next',f.start+30*86400);assert.equal((await creditBalance(f.DB,f.agencyId)).available,85);
 assert.equal((await f.DB.prepare("SELECT count(*) n FROM credit_rollover_links WHERE allocation_id='stripe-in_roll_next'").first<{n:number}>())!.n,0);
 await f.DB.exec("UPDATE allocations SET consumed=12 WHERE id='stripe-in_roll_current'");
 const next=await creditBalance(f.DB,f.agencyId,(f.start+30*86400+10)*1000);assert.equal(next.available,88);assert.equal(next.rolloverAvailable,38,'Only unused new-month credits roll again');
 assert.equal((await creditBalance(f.DB,f.agencyId,(f.start+60*86400+10)*1000)).available,0,'No payment: no new monthly or carried credits');
});
test('Report : changement de palier, plafond d’une mensualité, isolation et remboursement',async t=>{
 const f=await fixture(t,'roll-cap');await f.pay('in_roll_previous',f.start-30*86400,'reseau');await f.pay('in_roll_current',f.start,'solo');
 assert.equal((await creditBalance(f.DB,f.agencyId)).available,100);assert.equal((await creditBalance(f.DB,f.agencyId)).rolloverAvailable,50);
 assert.equal((await creditBalance(f.DB,'foreign-roll-agency')).available,0);
 await f.DB.exec("UPDATE financial_receipts SET reversed_credits=500 WHERE invoice_id='in_roll_previous'");
 assert.equal((await creditBalance(f.DB,f.agencyId)).available,50,'Refund of original source revokes unspent carry');
});
test('Report : une hausse de quota par admin ne devient pas un crédit mensuel payé reportable',async t=>{
 const f=await fixture(t,'roll-admin');await f.pay('in_roll_previous',f.start-30*86400);
 await f.DB.exec("UPDATE allocations SET quota_limit=100,consumed=10 WHERE id='stripe-in_roll_previous'");await f.pay('in_roll_current',f.start);
 const balance=await creditBalance(f.DB,f.agencyId);assert.equal(balance.rolloverAvailable,40);assert.equal(balance.available,90);
});
test('Nouvelles souscriptions : quatre prix serveur exacts, anciens choix refusés et aucun crédit sur simple Checkout',async t=>{
 const f=await fixture(t,'roll-prices'),calls:Stripe.Checkout.SessionCreateParams[]=[];
 f.client.checkout.sessions.create=async params=>{calls.push(params!);return {id:'cs_'+calls.length,url:'https://checkout.stripe.com/c/pay/fixture'} as Stripe.Response<Stripe.Checkout.Session>;};
 await assert.rejects(createCheckout(f.env,f.agencyId,'fixture@example.com','https://bienvu.online',{plan:'plus',accepted:true},'old-price-selection',f.client));
 for(const plan of creditPlans.filter(p=>p.price>0)){
  await f.DB.exec('DELETE FROM billing_checkouts');await createCheckout(f.env,f.agencyId,'fixture@example.com','https://bienvu.online',{plan:plan.code,accepted:true},'new-price-selection-'+plan.code,f.client);
  assert.equal(calls.at(-1)!.line_items![0].price_data!.unit_amount,plan.price*100);const submit=calls.at(-1)!.custom_text!.submit;assert.ok(submit&&typeof submit==='object');assert.match(submit.message,/reportés un mois/);
 }
 assert.equal((await f.DB.prepare("SELECT count(*) n FROM allocations WHERE period_key LIKE 'stripe:%'").first<{n:number}>())!.n,0);
});
