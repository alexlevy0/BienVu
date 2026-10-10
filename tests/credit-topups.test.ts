import {test} from 'node:test';
import {readFile,readdir} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {migrateNarrationProbe,seedNarrationFixture} from '../scripts/narration-fixtures';
import {Stripe,stripeClient,processStripeEvent} from '../apps/web/lib/billing';
import {createTopupCheckout,topupHistory} from '../apps/web/lib/credit-purchases';
import {creditBalance,admitGeneration,failGeneration} from '../packages/db/src/index';
import {defaultVideoCustomization,creditPacks} from '../packages/contracts/src/index';
import {narrationListing} from '../fixtures/narration';
import {financeAction,financeReport,FinanceAction} from '../apps/web/lib/profitability';
test('Migration : conserver les crédits du paiement original malgré un quota ajusté par admin',async t=>{
 const mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:'export default {fetch(){return new Response("fixture")}}',compatibilityDate:'2026-09-27',d1Databases:['DB']}));t.after(()=>mf.dispose());
 const {DB}=await mf.getBindings<{DB:D1Database}>(),files=(await readdir(new URL('../packages/db/migrations/',import.meta.url))).filter(f=>/^\d{4}_[\w-]+\.sql$/.test(f)).sort();
 const apply=async(file:string)=>DB.exec((await readFile(new URL('../packages/db/migrations/'+file,import.meta.url),'utf8')).replace(/^--.*$/gm,'').replace(/\n/g,' '));
 for(const file of files.filter(f=>f<'0039'))await apply(file);
 const seed=await seedNarrationFixture(DB,'invoice-before-topups'),at=new Date().toISOString(),until=new Date(Date.now()+86400_000).toISOString();
 await DB.prepare("UPDATE allocations SET kind='paid',quota_limit=99 WHERE agency_id=?").bind(seed.agencyId).run();
 await DB.prepare('INSERT INTO billing_customers VALUES(?,?,?,?)').bind(seed.agencyId,'test','cus_old_invoice',at).run();
 await DB.prepare('INSERT INTO billing_invoices VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').bind('in_before_topups',seed.agencyId,'test','sub_before','plus',1900,1900,'eur',at,until,'allocation-invoice-before-topups',at).run();
 for(const file of files.filter(f=>f>='0039'))await apply(file);
 assert.deepEqual(await DB.prepare('SELECT credits,gross_cents AS gross FROM financial_receipts').first(),{credits:40,gross:1900});
 assert.equal((await DB.prepare('SELECT quota_limit AS quota FROM allocations').first<{quota:number}>())!.quota,99);
});
async function fixture(t:{after(fn:()=>Promise<void>):void},label:string,modern=false){
 const mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:'export default {fetch(){return new Response("fixture")}}',compatibilityDate:'2026-09-27',d1Databases:['DB']}));t.after(()=>mf.dispose());const {DB}=await mf.getBindings<{DB:D1Database}>();await migrateNarrationProbe(DB);const seed=await seedNarrationFixture(DB,label),at=new Date().toISOString();
 await DB.exec("UPDATE jobs SET status='failed',error_code='FIXTURE',lease_until=NULL; UPDATE allocations SET kind='paid',quota_limit=2; UPDATE generation_control SET enabled=1; UPDATE trial_policy SET free_enabled=1");
 await DB.prepare('INSERT INTO hosted_import_budget VALUES(?,0,9000,0)').bind(at.slice(0,7)).run();await DB.prepare('INSERT INTO generation_access VALUES(?,?,1)').bind(seed.agencyId,'allocation-'+label).run();
 await DB.prepare('INSERT INTO billing_customers VALUES(?,?,?,?)').bind(seed.agencyId,'test','cus_wallet',at).run();
 const env={DB,BILLING_MODE:'test',STRIPE_SECRET_KEY:'sk_test_fixture',STRIPE_WEBHOOK_SECRET:'whsec_fixture'},client=stripeClient(env);
 const listing=narrationListing();listing.id='listing-'+label;listing.agencyId=seed.agencyId;listing.photos=Array.from({length:6},(_,n)=>({...listing.photos[0],id:'photo-'+n,agencyId:seed.agencyId,listingId:listing.id,sourceOrder:n,contentHash:n.toString(16).padStart(64,'0'),objectKey:`agencies/${seed.agencyId}/imports/${listing.id}/photo-${n}.png`}));
 await DB.prepare('UPDATE listing_imports SET result_json=? WHERE id=?').bind(JSON.stringify(listing),listing.id).run();
 const session={id:'cs_wallet_'+label,mode:'payment',metadata:{agencyId:seed.agencyId,pack:'pack10',kind:'credit_topup'},client_reference_id:seed.agencyId,customer:'cus_wallet',livemode:false,status:'complete',payment_status:'paid',currency:'eur',amount_subtotal:700,amount_total:700,total_details:{amount_tax:0,amount_discount:0},invoice:null,line_items:{has_more:false,data:[{quantity:1,amount_subtotal:700,price:{id:'price_wallet',unit_amount:700,currency:'eur',recurring:null}}]},payment_intent:{id:'pi_wallet',customer:'cus_wallet',livemode:false,status:'succeeded',currency:'eur',amount_received:700,latest_charge:'ch_wallet'}};
 if(modern){session.metadata.pack='pack20v2';session.amount_subtotal=2000;session.amount_total=2000;session.line_items.data[0].amount_subtotal=2000;session.line_items.data[0].price.unit_amount=2000;session.payment_intent.amount_received=2000;}
 const state={feePending:false,refunded:0,dispute:'none'};
 client.checkout.sessions.create=async(params)=>{assert.equal(params!.mode,'payment');assert.equal(params!.line_items![0].price_data!.unit_amount,modern?2000:700);return {id:session.id,url:'https://checkout.stripe.com/c/pay/wallet'} as Stripe.Response<Stripe.Checkout.Session>;};
 client.checkout.sessions.retrieve=async()=>session as unknown as Stripe.Response<Stripe.Checkout.Session>;
 client.paymentIntents.retrieve=async()=>session.payment_intent as unknown as Stripe.Response<Stripe.PaymentIntent>;
 client.charges.retrieve=async()=>({id:'ch_wallet',payment_intent:'pi_wallet',customer:'cus_wallet',currency:'eur',amount:modern?2000:700,amount_refunded:state.refunded,paid:true,captured:true,livemode:false,disputed:state.dispute!=='none',balance_transaction:state.feePending?null:{id:'txn_wallet',source:'ch_wallet',currency:'eur',amount:modern?2000:700,fee:47,net:modern?1953:653}}) as unknown as Stripe.Response<Stripe.Charge>;
 client.refunds.list=(async()=>({has_more:false,data:state.refunded?[{id:'re_wallet',status:'succeeded',amount:state.refunded,balance_transaction:{id:'txn_refund',source:'re_wallet',currency:'eur',amount:-state.refunded,fee:0,net:-state.refunded}}]:[]}) ) as unknown as typeof client.refunds.list;
 client.disputes.list=(async()=>({has_more:false,data:[{id:'dp_wallet',charge:'ch_wallet',livemode:false,currency:'eur',amount:700,status:state.dispute,balance_transactions:state.dispute==='won'?[{id:'txn_dispute',source:'dp_wallet',currency:'eur',amount:0,fee:0,net:0}]:[]}]}) ) as unknown as typeof client.disputes.list;
 const event=(id:string,type:Stripe.Event.Type='checkout.session.completed')=>({id,type,livemode:false,created:Math.floor(Date.now()/1000),data:{object:type.startsWith('charge.')?{id:'ch_wallet'}:{id:session.id,mode:'payment',metadata:session.metadata}}}) as Stripe.Event;
 const pay=async()=>{if(modern)await createTopupCheckout(env,seed.agencyId,'test@example.com','https://bienvu.online',{pack:'pack20v2',accepted:true},'wallet-checkout-key-'+label,client);else await DB.prepare('INSERT INTO billing_topup_checkouts(agency_id,mode,idempotency_key,pack,credits,price_cents,session_id,url,valid_days,expires_at,created_at) VALUES(?,\'test\',?,\'pack10\',10,700,?,NULL,0,?,?)').bind(seed.agencyId,'legacy-order-'+label,session.id,new Date(Date.now()+2700000).toISOString(),at).run();await processStripeEvent(env,event('evt_wallet_'+label),'a'.repeat(64),client);};
 return {DB,env,client,session,state,event,pay,listing,at,...seed};
}
test('Nouvelles recharges : 20, 50 et 100 crédits à 1 € HT ; commandes antérieures inchangées',async t=>{
 const f=await fixture(t,'topup-new-prices',true),amounts:number[]=[];
 f.client.checkout.sessions.create=async params=>{amounts.push(params!.line_items![0].price_data!.unit_amount!);return {id:'cs_new_price_'+amounts.length,url:'https://checkout.stripe.com/c/pay/new-price'} as Stripe.Response<Stripe.Checkout.Session>;};
 for(const pack of creditPacks){await f.DB.exec('DELETE FROM billing_topup_checkouts');await createTopupCheckout(f.env,f.agencyId,'test@example.com','https://bienvu.online',{pack:pack.code,accepted:true},'new-pack-price-'+pack.code,f.client);
  assert.deepEqual(await f.DB.prepare('SELECT pack,credits,price_cents AS cents FROM billing_topup_checkouts').first(),{pack:pack.code,credits:pack.credits,cents:pack.priceCents});}
 assert.deepEqual(amounts,[2000,5000,10000]);await assert.rejects(createTopupCheckout(f.env,f.agencyId,'test@example.com','https://bienvu.online',{pack:'pack100',accepted:true},'legacy-new-purchase',f.client));
 assert.equal((await f.DB.prepare('SELECT count(*) n FROM credit_topups').first<{n:number}>())!.n,0,'Checkout alone never creates credits');
});
test('Recharge : consentement, prix serveur, paiement vérifié, événements concurrents et plan inchangé',async t=>{
 const f=await fixture(t,'topup-payment',true);await assert.rejects(createTopupCheckout(f.env,f.agencyId,'test@example.com','https://bienvu.online',{pack:'pack20v2',accepted:false},'wallet-invalid-key',f.client));
 await createTopupCheckout(f.env,f.agencyId,'test@example.com','https://bienvu.online',{pack:'pack20v2',accepted:true},'wallet-checkout-key01',f.client);
 f.session.payment_status='unpaid';await processStripeEvent(f.env,f.event('evt_unpaid'),'1'.repeat(64),f.client);assert.equal((await creditBalance(f.DB,f.agencyId)).available,2);
 f.session.payment_status='paid';f.session.amount_subtotal=1999;await assert.rejects(processStripeEvent(f.env,f.event('evt_bad_amount'),'2'.repeat(64),f.client));f.session.amount_subtotal=2000;
 f.session.metadata.agencyId='foreign';await assert.rejects(processStripeEvent(f.env,f.event('evt_foreign'),'3'.repeat(64),f.client));f.session.metadata.agencyId=f.agencyId;
 const [a,b]=await Promise.all([['evt_paid1','4'],['evt_paid2','5']].map(([id,hash])=>processStripeEvent(f.env,f.event(id),hash.repeat(64),f.client)));assert.ok(a&&b);
 assert.equal((await creditBalance(f.DB,f.agencyId)).available,22);assert.equal((await creditBalance(f.DB,f.agencyId)).purchasedAvailable,20);
 assert.equal((await f.DB.prepare('SELECT count(*) n FROM credit_topups').first<{n:number}>())!.n,1);
 assert.equal((await f.DB.prepare('SELECT count(*) n FROM subscriptions').first<{n:number}>())!.n,0);
 assert.equal((await topupHistory(f.env,f.agencyId))[0].remaining,20);assert.equal((await topupHistory(f.env,'foreign')).length,0);
 const receipt=await f.DB.prepare('SELECT fee_cents fee,fees_complete complete FROM financial_receipts').first<{fee:number;complete:number}>();assert.deepEqual(receipt,{fee:47,complete:1});
 const stored=await f.DB.prepare('SELECT expires_at FROM billing_topup_checkouts').first<{expires_at:string}>();assert.ok(stored!.expires_at<=new Date().toISOString(),'Un achat terminé libère immédiatement le prochain checkout');
});
test('Portefeuille : réservation mensuelle puis recharge, règlement partiel et restitution dans le lot d’origine',async t=>{
 const f=await fixture(t,'topup-split');await f.pay();const customization={...defaultVideoCustomization(),runwayPhotos:[0,1,2,3]};
 const [job,again]=await Promise.all([1,2].map(()=>admitGeneration(f.DB,f.agencyId,'wallet-job-split-001',{listingId:f.listing.id,customization},'true')));assert.equal(job.jobId,again.jobId);
 const parts=(await f.DB.prepare('SELECT priority,amount FROM generation_credit_parts ORDER BY priority').all()).results;assert.deepEqual(parts,[{priority:0,amount:2},{priority:1,amount:3}]);
 assert.equal((await creditBalance(f.DB,f.agencyId)).available,7);
 await f.DB.prepare("UPDATE allocations SET valid_until=? WHERE id=?").bind(new Date(Date.now()-1).toISOString(),'allocation-topup-split').run();
 await failGeneration(f.DB,job,'GENERATION_FAILED');const monthly=await f.DB.prepare('SELECT reserved,consumed FROM allocations WHERE id=?').bind('allocation-topup-split').first();assert.deepEqual(monthly,{reserved:0,consumed:0});
 assert.equal((await creditBalance(f.DB,f.agencyId)).purchasedAvailable,10);await failGeneration(f.DB,job,'GENERATION_FAILED');assert.equal((await creditBalance(f.DB,f.agencyId)).purchasedAvailable,10);
 const next=await admitGeneration(f.DB,f.agencyId,'wallet-job-after-001',{listingId:f.listing.id,customization:{...defaultVideoCustomization(),runwayPhotos:[0]}},'true');
 const at=new Date().toISOString(),photo=f.listing.photos[0];await f.DB.prepare("INSERT INTO photo_animations(id,agency_id,job_id,photo_id,source_sha256,slot,month,mode,model,credits,reserved_cents,state,created_at,updated_at) VALUES(?,?,?,?,?,0,?,'mock','gen4_turbo',25,0,'ready',?,?)").bind('wallet-partial-animation',f.agencyId,next.jobId,photo.id,photo.contentHash,at.slice(0,7),at,at).run();
 await failGeneration(f.DB,next,'GENERATION_FAILED');assert.equal((await creditBalance(f.DB,f.agencyId)).purchasedAvailable,9,'Animation réussie conservée, crédit vidéo restitué');
 const paid=await f.DB.prepare('SELECT sum(consumed) n FROM generation_credit_parts WHERE job_id=?').bind(next.jobId).first<{n:number}>();assert.equal(paid!.n,1);
 await assert.rejects(f.DB.prepare('UPDATE generation_credit_parts SET consumed=2 WHERE job_id=?').bind(next.jobId).run(),/IMMUTABLE/);
});
test('Remboursement et litige : retrait des crédits, dette après consommation, aucun contournement par le solde mensuel',async t=>{
 const f=await fixture(t,'topup-refund');await f.pay();f.state.refunded=350;
 await processStripeEvent(f.env,f.event('evt_refund','charge.refunded'),'2'.repeat(64),f.client);assert.equal((await creditBalance(f.DB,f.agencyId)).purchasedAvailable,5);assert.equal((await topupHistory(f.env,f.agencyId))[0].reversed,5);
 f.state.dispute='needs_response';await processStripeEvent(f.env,f.event('evt_dispute','charge.updated'),'3'.repeat(64),f.client);assert.equal((await creditBalance(f.DB,f.agencyId)).available,0);
 f.state.dispute='won';await processStripeEvent(f.env,f.event('evt_won','charge.updated'),'4'.repeat(64),f.client);assert.equal((await creditBalance(f.DB,f.agencyId)).available,7);
 await f.DB.exec("UPDATE allocations SET consumed=6 WHERE period_key LIKE 'topup:%'");assert.equal((await creditBalance(f.DB,f.agencyId)).available,0,'Les crédits déjà dépensés puis remboursés bloquent une nouvelle dépense');
 f.state.dispute='lost';await processStripeEvent(f.env,f.event('evt_lost','charge.updated'),'5'.repeat(64),f.client);const receipt=await f.DB.prepare('SELECT lost_cents AS lost,reversed_credits AS reversed FROM financial_receipts').first();assert.deepEqual(receipt,{lost:350,reversed:10});assert.equal((await financeReport(f.DB,new URLSearchParams({mode:'test'}))).summary.cashHtMicros,0);
});
test('Coûts réels : frais Stripe inconnus, factures affectées, stock prépayé, arrondis, journal et isolation test/live',async t=>{
 const f=await fixture(t,'topup-finance');f.state.feePending=true;await f.pay();
 await f.DB.prepare('UPDATE allocations SET consumed=2 WHERE id=?').bind('allocation-topup-finance').run();
 const job=await admitGeneration(f.DB,f.agencyId,'wallet-profit-job01',{listingId:f.listing.id},'true');const at=new Date().toISOString();await f.DB.prepare('INSERT INTO generation_artifacts VALUES(?,?,?,?)').bind(job.jobId,'master-profit','{}',at).run();await f.DB.prepare("UPDATE jobs SET status='ready',lease_until=NULL WHERE id=?").bind(job.jobId).run();
 let report=await financeReport(f.DB,new URLSearchParams({mode:'test'}));assert.equal(report.videos[0].revenueMicros,700000);assert.equal(report.videos[0].feesMissing,1);assert.equal(report.videos[0].missingProviders,'cloudflare');assert.equal(report.summary.marginMicros,null);
 f.state.feePending=false;await processStripeEvent(f.env,f.event('evt_fee_available','charge.updated'),'2'.repeat(64),f.client);
 const day=at.slice(0,10),expense={action:'expense',provider:'cloudflare',reference:'invoice-fixture-cloud',mode:'test',kind:'fixed',currency:'EUR',originalMinor:50,eurCents:50,quantity:1,from:day,until:day,paidAt:day,note:'Facture réellement réglée, répartie sur cette vidéo.',allocations:[{jobId:job.jobId,units:1,covers:true}]};
 const stored=await financeAction(f.env,'test-admin',expense);assert.ok('id' in stored);
 report=await financeReport(f.DB,new URLSearchParams({mode:'test',jobId:job.jobId}));assert.equal(report.videos[0].feeMicros,47000);assert.equal(report.videos[0].costMicros,500000);assert.equal(report.videos[0].marginMicros,153000);assert.equal(report.detail!.costs[0].reference,expense.reference);assert.equal(report.agencies[0].cashHtMicros,7000000);assert.equal(report.agencies[0].unassignedRevenueMicros,6300000);
 assert.equal((await financeReport(f.DB,new URLSearchParams({mode:'live'}))).summary.videos,0);
 await assert.rejects(financeAction(f.env,'test-admin',{...expense,reference:'foreign-mode',mode:'live'}));
 await assert.rejects(financeAction(f.env,'test-admin',expense),/UNIQUE/);
 const prepaid=await financeAction(f.env,'test-admin',{...expense,reference:'runway-credit-purchase',provider:'runway',kind:'prepaid',quantity:1000,originalMinor:1000,eurCents:1000,allocations:[]});assert.ok('id' in prepaid);
 assert.equal((await financeReport(f.DB,new URLSearchParams({mode:'test'}))).summary.unassignedCostMicros,10000000);
 if('id' in prepaid)await financeAction(f.env,'test-admin',{action:'allocate',expenseId:prepaid.id,allocations:[{jobId:job.jobId,units:25,covers:false}]});
 assert.equal((await financeReport(f.DB,new URLSearchParams({mode:'test'}))).summary.unassignedCostMicros,9750000);
 if('id' in stored)await financeAction(f.env,'test-admin',{action:'void',expenseId:stored.id,reason:'Référence incorrecte, justificatif annulé.'});report=await financeReport(f.DB,new URLSearchParams({mode:'test',jobId:job.jobId}));assert.equal(report.videos[0].marginMicros,null);assert.equal(report.videos[0].costMicros,250000);
 assert.equal(report.audit.length,4);await assert.rejects(f.DB.exec('DELETE FROM financial_audit'),/IMMUTABLE/);
 assert.equal(FinanceAction.safeParse({...expense,eurCents:1.5}).success,false);await assert.rejects(financeReport(f.DB,new URLSearchParams({from:'2026-02-31'})));
});

test('Recettes : les crédits supplémentaires accordés par admin ne peuvent pas dépasser le paiement original',async t=>{
 const f=await fixture(t,'topup-revenue-cap');await f.pay();await f.DB.exec("UPDATE allocations SET consumed=2 WHERE period_key NOT LIKE 'topup:%'; UPDATE allocations SET quota_limit=30 WHERE period_key LIKE 'topup:%'");
 for(let n=0;n<2;n++){const job=await admitGeneration(f.DB,f.agencyId,'wallet-bonus-job-'+n,{listingId:f.listing.id,customization:{...defaultVideoCustomization(),runwayPhotos:[0,1,2,3,4,5]}},'true');
  const at=new Date().toISOString();for(let slot=0;slot<6;slot++){const p=f.listing.photos[slot];await f.DB.prepare("INSERT INTO photo_animations(id,agency_id,job_id,photo_id,source_sha256,slot,month,mode,model,credits,reserved_cents,state,created_at,updated_at) VALUES(?,?,?,?,?,?,?,'mock','gen4_turbo',25,0,'ready',?,?)").bind('bonus-animation-'+n+'-'+slot,f.agencyId,job.jobId,p.id,p.contentHash,slot,at.slice(0,7),at,at).run();}await failGeneration(f.DB,job,'GENERATION_FAILED');
 }
 const report=await financeReport(f.DB,new URLSearchParams({mode:'test'}));assert.equal(report.summary.credits,12);assert.equal(report.summary.revenueMicros,7000000);assert.equal(report.summary.feeMicros,470000);assert.equal(report.agencies[0].unassignedRevenueMicros,0);
});
