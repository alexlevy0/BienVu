import {Stripe,billingMode,stripeClient,type BillingEnv} from './billing';
import {stripeId} from './credit-purchases';
import {RequestFailure} from './http';

type ChargeAccounting={id:string;intentId:string;amount:number;refunded:number;lost:number;disputed:number;disputeFee:number|null;transactionId:string|null;
 currency:string|null;settledAmount:number|null;fee:number|null;net:number|null;refundFee:number|null;complete:number;checkedAt:string};
type Receipt={id:string;agencyId:string;mode:'test'|'live';customerId:string;gross:number;credits:number;invoiceId:string|null;intentId:string|null};

// Only retrieve the financial projection. Card data and raw provider objects are
// never written to D1, included in admin responses or logged.
export async function readChargeAccounting(env:BillingEnv,id:string,customerId:string,client:Stripe):Promise<ChargeAccounting>{
 const checkedAt=new Date().toISOString(),charge=await client.charges.retrieve(id,{expand:['balance_transaction']}),mode=billingMode(env);
 if(charge.livemode!==(mode==='live')||stripeId(charge.customer)!==customerId||charge.currency!=='eur'||!charge.paid||!charge.captured||!stripeId(charge.payment_intent))throw new RequestFailure('FORBIDDEN');
 const transaction=typeof charge.balance_transaction==='object'?charge.balance_transaction:null;
 let refundFee=0,complete=Boolean(transaction&&transaction.currency==='eur'&&transaction.amount===charge.amount&&stripeId(transaction.source)===charge.id&&transaction.net===transaction.amount-transaction.fee);
 if(charge.amount_refunded>0){
  const refunds=await client.refunds.list({charge:charge.id,limit:100,expand:['data.balance_transaction']});
  const succeeded=refunds.data.filter(r=>r.status==='succeeded'),refunded=succeeded.reduce((s,r)=>s+r.amount,0);
  if(refunds.has_more||refunded!==charge.amount_refunded)complete=false;
  for(const refund of succeeded){const b=typeof refund.balance_transaction==='object'?refund.balance_transaction:null;
   if(!b||b.currency!=='eur'||stripeId(b.source)!==refund.id||b.amount!==-refund.amount||b.net!==b.amount-b.fee)complete=false;
   else refundFee+=b.fee;
  }
 }
 let disputed=charge.disputed?1:0,lost=0,disputeFee=0;
 if(disputed){const disputes=await client.disputes.list({charge:charge.id,limit:10});
  disputed=disputes.has_more||!disputes.data.length||disputes.data.some(d=>!['won','lost','warning_closed'].includes(d.status))?1:0;
  if(disputed)complete=false;
  for(const d of disputes.data){
   if(d.livemode!==(mode==='live')||stripeId(d.charge)!==charge.id||d.currency!=='eur')throw new RequestFailure('FORBIDDEN');
   if(d.status==='lost')lost+=d.amount;
   if(!d.balance_transactions?.length&&d.status!=='warning_closed')complete=false;
   for(const bt of d.balance_transactions??[]){if(bt.currency!=='eur'||stripeId(bt.source)!==d.id||bt.net!==bt.amount-bt.fee)complete=false;else disputeFee+=bt.fee;}
  }
 }
 return {id:charge.id,intentId:stripeId(charge.payment_intent)!,amount:charge.amount,refunded:charge.amount_refunded,lost:Math.min(charge.amount-charge.amount_refunded,lost),disputed,disputeFee:complete?disputeFee:null,
  transactionId:transaction?.id??null,currency:transaction?.currency??null,settledAmount:transaction?.amount??null,fee:transaction?.fee??null,net:transaction?.net??null,
  refundFee:complete?refundFee:null,complete:complete?1:0,checkedAt};
}
export function accountingMutations(env:BillingEnv,receiptId:string,charges:ChargeAccounting[],expectedGross:number):D1PreparedStatement[]{
 if(charges.some(c=>c.amount>expectedGross)||charges.reduce((s,c)=>s+c.amount,0)>expectedGross)throw new RequestFailure('VALIDATION_ERROR');
 const at=charges.reduce((a,c)=>c.checkedAt>a?c.checkedAt:a,new Date().toISOString());
 const mutations=charges.map(c=>env.DB.prepare(`INSERT INTO financial_charges(id,receipt_id,payment_intent_id,amount_cents,refunded_cents,lost_cents,balance_transaction_id,currency,settlement_amount,fee_minor,net_minor,refund_fee_minor,dispute_fee_minor,disputed,complete,checked_at)
  VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET amount_cents=excluded.amount_cents,refunded_cents=excluded.refunded_cents,lost_cents=excluded.lost_cents,balance_transaction_id=excluded.balance_transaction_id,currency=excluded.currency,settlement_amount=excluded.settlement_amount,fee_minor=excluded.fee_minor,net_minor=excluded.net_minor,refund_fee_minor=excluded.refund_fee_minor,dispute_fee_minor=excluded.dispute_fee_minor,disputed=excluded.disputed,complete=excluded.complete,checked_at=excluded.checked_at
  WHERE financial_charges.receipt_id=excluded.receipt_id AND financial_charges.payment_intent_id=excluded.payment_intent_id AND financial_charges.checked_at<=excluded.checked_at`)
  .bind(c.id,receiptId,c.intentId,c.amount,c.refunded,c.lost,c.transactionId,c.currency,c.settledAmount,c.fee,c.net,c.refundFee,c.disputeFee,c.disputed,c.complete,c.checkedAt));
 mutations.push(env.DB.prepare(`UPDATE financial_receipts SET
  refunded_cents=min(gross_cents,(SELECT coalesce(sum(refunded_cents),0) FROM financial_charges WHERE receipt_id=financial_receipts.id)),
  lost_cents=min(gross_cents,(SELECT coalesce(sum(lost_cents),0) FROM financial_charges WHERE receipt_id=financial_receipts.id)),
  reversed_credits=min(credits,CAST(((SELECT coalesce(sum(refunded_cents+lost_cents),0) FROM financial_charges WHERE receipt_id=financial_receipts.id)*credits+gross_cents-1)/gross_cents AS INTEGER)),
  disputed=(SELECT coalesce(max(disputed),0) FROM financial_charges WHERE receipt_id=financial_receipts.id),
  fee_cents=CASE WHEN (SELECT coalesce(sum(amount_cents),0) FROM financial_charges WHERE receipt_id=financial_receipts.id)=gross_cents AND
   NOT EXISTS(SELECT 1 FROM financial_charges WHERE receipt_id=financial_receipts.id AND complete=0)
   THEN (SELECT sum(fee_minor+refund_fee_minor+dispute_fee_minor) FROM financial_charges WHERE receipt_id=financial_receipts.id) END,
  fees_complete=IIF((SELECT coalesce(sum(amount_cents),0) FROM financial_charges WHERE receipt_id=financial_receipts.id)=gross_cents AND
   NOT EXISTS(SELECT 1 FROM financial_charges WHERE receipt_id=financial_receipts.id AND complete=0),1,0),checked_at=? WHERE id=? AND (checked_at IS NULL OR checked_at<=?)`)
  .bind(at,receiptId,at));
 return mutations;
}
export async function invoiceAccountingMutations(env:BillingEnv,invoice:Stripe.Invoice,receiptId:string,client:Stripe){
 const paid=await client.invoicePayments.list({invoice:invoice.id,status:'paid',limit:100});
 if(paid.has_more)return [];
 const charges:ChargeAccounting[]=[];
 for(const p of paid.data){
  if(p.livemode!==(billingMode(env)==='live')||stripeId(p.invoice)!==invoice.id||p.currency!=='eur')throw new RequestFailure('FORBIDDEN');
  const intentId=stripeId(p.payment.payment_intent);
  if(intentId){const intent=await client.paymentIntents.retrieve(intentId);
   if(intent.livemode!==(billingMode(env)==='live')||stripeId(intent.customer)!==stripeId(invoice.customer)||intent.currency!=='eur')throw new RequestFailure('FORBIDDEN');
   const chargeId=stripeId(intent.latest_charge);if(chargeId){const charge=await readChargeAccounting(env,chargeId,stripeId(invoice.customer)!,client);if(charge.intentId!==intent.id)throw new RequestFailure('FORBIDDEN');charges.push(charge);}}
  else if(p.payment.charge)charges.push(await readChargeAccounting(env,stripeId(p.payment.charge)!,stripeId(invoice.customer)!,client));
 }
 return accountingMutations(env,receiptId,charges,invoice.amount_paid);
}
export async function receiptAccounting(env:BillingEnv,receipt:Receipt,client:Stripe){
 if(receipt.mode!==billingMode(env))throw new RequestFailure('FORBIDDEN');
 if(receipt.invoiceId){const invoice=await client.invoices.retrieve(receipt.invoiceId);
  if(stripeId(invoice.customer)!==receipt.customerId||invoice.livemode!==(receipt.mode==='live')||invoice.amount_paid!==receipt.gross)throw new RequestFailure('FORBIDDEN');
  return invoiceAccountingMutations(env,invoice,receipt.id,client);}
 if(receipt.intentId){const intent=await client.paymentIntents.retrieve(receipt.intentId);
  if(stripeId(intent.customer)!==receipt.customerId||intent.livemode!==(receipt.mode==='live')||intent.amount_received!==receipt.gross)throw new RequestFailure('FORBIDDEN');
  const id=stripeId(intent.latest_charge);return id?accountingMutations(env,receipt.id,[await readChargeAccounting(env,id,receipt.customerId,client)],receipt.gross):[];}
 return [];
}
export async function financialEventMutations(env:BillingEnv,event:Stripe.Event,client:Stripe){
 let chargeId:string|null=null;
 if(['charge.updated','charge.refunded','charge.succeeded'].includes(event.type))chargeId=(event.data.object as Stripe.Charge).id;
 else if(event.type.startsWith('charge.dispute.')){const d=await client.disputes.retrieve((event.data.object as Stripe.Dispute).id);chargeId=stripeId(d.charge);}
 else if(['refund.created','refund.updated','refund.failed'].includes(event.type)){const r=await client.refunds.retrieve((event.data.object as Stripe.Refund).id);chargeId=stripeId(r.charge);}
 if(!chargeId)return [];
 const receipt=await env.DB.prepare(`SELECT f.id,f.agency_id AS agencyId,f.mode,f.customer_id AS customerId,f.gross_cents AS gross,f.credits,f.invoice_id AS invoiceId,f.payment_intent_id AS intentId
  FROM financial_receipts f JOIN financial_charges c ON c.receipt_id=f.id WHERE c.id=?`).bind(chargeId).first<Receipt>();
 if(!receipt)return [];
 return receiptAccounting(env,receipt,client);
}
export async function reconcileStripe(env:BillingEnv,client=stripeClient(env)){
 const rows=await env.DB.prepare(`SELECT id,agency_id AS agencyId,mode,customer_id AS customerId,gross_cents AS gross,credits,invoice_id AS invoiceId,payment_intent_id AS intentId
  FROM financial_receipts WHERE mode=? AND (checked_at IS NULL OR julianday(checked_at)<julianday('now','-10 minutes'))
  ORDER BY fees_complete,coalesce(checked_at,''),id LIMIT 20`).bind(billingMode(env)).all<Receipt>();
 let updated=0,unavailable=0;
 for(const receipt of rows.results){try{const changes=await receiptAccounting(env,receipt,client);if(changes.length){await env.DB.batch(changes);updated++;}else unavailable++;}catch{unavailable++;}}
 return {updated,unavailable,limit:20};
}
