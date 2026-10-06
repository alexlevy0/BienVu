import {z} from 'zod';
import {EntityId} from '@bienvu/contracts';
import {RequestFailure,assertSameOrigin,boundedJson,respond} from './http';
import {requireAdmin} from './admin-access';
import type {AuthEnvironment} from './auth';
import {billingMode,type BillingEnv} from './billing';
import {reconcileStripe} from './stripe-accounting';
const day=z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(s=>!Number.isNaN(Date.parse(s))&&new Date(s).toISOString().slice(0,10)===s);
const provider=z.enum(['openai','google','fish','cartesia','runway','cloudflare','other']);
const allocation=z.object({jobId:EntityId,units:z.number().int().min(1).max(100000000),covers:z.boolean()}).strict();
const allocations=z.array(allocation).max(120).refine(a=>new Set(a.map(x=>x.jobId)).size===a.length);
export const FinanceAction=z.discriminatedUnion('action',[
 z.object({action:z.literal('expense'),provider,reference:z.string().trim().min(2).max(120),mode:z.enum(['test','live']),kind:z.enum(['usage','fixed','prepaid','credit_note']),currency:z.enum(['EUR','USD']),originalMinor:z.number().int().min(0).max(100000000),eurCents:z.number().int().min(0).max(100000000),quantity:z.number().int().min(1).max(100000000),from:day,until:day,paidAt:day,note:z.string().trim().min(5).max(500),allocations}).strict(),
 z.object({action:z.literal('allocate'),expenseId:EntityId,allocations:allocations.refine(a=>a.length>0)}).strict(),
 z.object({action:z.literal('void'),expenseId:EntityId,reason:z.string().trim().min(5).max(300)}).strict(),
 z.object({action:z.literal('stripe_sync')}).strict(),
]);
type Expense={id:string;provider:string;reference:string;mode:'test'|'live';kind:string;currency:string;originalMinor:number;eurCents:number;quantity:number;from:string;until:string;paidAt:string;note:string;voidedAt:string|null;allocatedUnits:number;allocatedMicros:number};
export type FinanceVideo={id:string;agencyId:string;mode:'test'|'live';at:string;status:string;title:string;agency:string|null;credits:number;revenueMicros:number;feeMicros:number;feesMissing:number;costMicros:number;missingProviders:string|null;marginMicros:number|null};
export type FinanceAgency={id:string;name:string;videos:number;revenueMicros:number;feeMicros:number;costMicros:number;incomplete:number;cashHtMicros:number;cashFeeMicros:number;cashFeesMissing:number;unassignedRevenueMicros:number;marginMicros:number|null};
export type FinanceReport={at:string;mode:'test'|'live';from:string;until:string;page:number;total:number;videos:FinanceVideo[];agencies:FinanceAgency[];expenses:Expense[];audit:{at:string;action:string;target:string}[];
 summary:{videos:number;credits:number;revenueMicros:number;feeMicros:number;costMicros:number;incomplete:number;marginMicros:number|null;cashHtMicros:number;cashFeeMicros:number;cashFeesMissing:number;unassignedCostMicros:number};
 detail?:{costs:{provider:string;reference:string;kind:string;amountMicros:number;units:number;covers:number}[];funding:{receipt:string;used:number;revenueMicros:number;feeMicros:number|null;incomplete:number}[]};};
const audit=(DB:D1Database,userId:string,action:string,target:string,detail:unknown)=>DB.prepare('INSERT INTO financial_audit VALUES(?,?,?,?,?,?)').bind(crypto.randomUUID(),userId,action,target,JSON.stringify(detail),new Date().toISOString());
const expenseSql=`SELECT e.id,e.provider,e.reference,e.mode,e.kind,e.currency,e.original_minor AS originalMinor,e.eur_cents AS eurCents,e.unit_quantity AS quantity,e.period_from AS "from",e.period_until AS until,e.paid_at AS paidAt,e.note,e.voided_at AS voidedAt,
 coalesce((SELECT sum(units) FROM financial_expense_allocations WHERE expense_id=e.id),0) AS allocatedUnits,coalesce((SELECT sum(amount_micros) FROM financial_expense_allocations WHERE expense_id=e.id),0) AS allocatedMicros FROM financial_expenses e`;
async function assignmentStatements(DB:D1Database,e:Expense,items:z.infer<typeof allocations>){
 const total=items.reduce((s,x)=>s+x.units,0);if(total+e.allocatedUnits>e.quantity||e.voidedAt)throw new RequestFailure('VALIDATION_ERROR');
 let cumulative=e.allocatedUnits;const statements:D1PreparedStatement[]=[];
 for(const x of items){const job=await DB.prepare('SELECT financial_mode AS mode,substr(created_at,1,10) AS at FROM generation_runs WHERE job_id=?').bind(x.jobId).first<{mode:string;at:string}>();
  if(!job||job.mode!==e.mode||job.at<e.from||job.at>e.until)throw new RequestFailure('VALIDATION_ERROR');
  const offset=cumulative,previous=BigInt(e.eurCents)*10000n*BigInt(cumulative)/BigInt(e.quantity);cumulative+=x.units;
  const amount=Number(BigInt(e.eurCents)*10000n*BigInt(cumulative)/BigInt(e.quantity)-previous);
  statements.push(DB.prepare('INSERT INTO financial_expense_allocations VALUES(?,?,?,?,?,?)').bind(e.id,x.jobId,x.units,amount,offset,x.covers?1:0));
 }
 return statements;
}
export async function financeAction(env:BillingEnv,userId:string,input:unknown){
 const parsed=FinanceAction.safeParse(input);if(!parsed.success)throw new RequestFailure('VALIDATION_ERROR');const value=parsed.data,DB=env.DB;
 if(value.action==='stripe_sync'){
  // Reserve the audited action before any network access; repeated clicks cannot flood Stripe.
  if(await DB.prepare("SELECT 1 FROM financial_audit WHERE action='stripe_sync' AND created_at>strftime('%Y-%m-%dT%H:%M:%fZ','now','-1 minute')").first())throw new RequestFailure('CONFLICT');
  await audit(DB,userId,'stripe_sync',billingMode(env)??'disabled',{}).run();return reconcileStripe(env);
 }
 if(value.action==='expense'){
  if(value.until<value.from||value.paidAt>new Date().toISOString().slice(0,10)||(value.currency==='EUR'&&value.originalMinor!==value.eurCents))throw new RequestFailure('VALIDATION_ERROR');
  const units=value.allocations.reduce((s,a)=>s+a.units,0);if(value.kind!=='prepaid'&&units!==value.quantity)throw new RequestFailure('VALIDATION_ERROR');
  const id=crypto.randomUUID(),at=new Date().toISOString();const e:Expense={...value,id,allocatedUnits:0,allocatedMicros:0,voidedAt:null};
  await DB.batch([DB.prepare('INSERT INTO financial_expenses(id,provider,reference,mode,kind,currency,original_minor,eur_cents,unit_quantity,period_from,period_until,paid_at,note,actor_id,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
   .bind(id,value.provider,value.reference,value.mode,value.kind,value.currency,value.originalMinor,value.eurCents,value.quantity,value.from,value.until,value.paidAt,value.note,userId,at),
   ...await assignmentStatements(DB,e,value.allocations),audit(DB,userId,'expense',id,{provider:value.provider,reference:value.reference,eurCents:value.eurCents,jobs:value.allocations.length})]);return {id};
 }
 const e=await DB.prepare(expenseSql+' WHERE e.id=?').bind(value.expenseId).first<Expense>();if(!e||e.voidedAt)throw new RequestFailure('NOT_FOUND');
 if(value.action==='allocate'){await DB.batch([...await assignmentStatements(DB,e,value.allocations),audit(DB,userId,'allocate',e.id,{jobs:value.allocations.length})]);return {id:e.id};}
 await DB.batch([DB.prepare('UPDATE financial_expenses SET voided_at=?,voided_by=?,void_reason=? WHERE id=? AND voided_at IS NULL').bind(new Date().toISOString(),userId,value.reason,e.id),audit(DB,userId,'void',e.id,{reason:value.reason})]);return {id:e.id};
}
export async function financeReport(DB:D1Database,params:URLSearchParams):Promise<FinanceReport>{
 if([...params.keys()].some(k=>!['mode','from','until','page','q','agencyId','jobId'].includes(k)))throw new RequestFailure('VALIDATION_ERROR');
 const parsed=z.object({mode:z.enum(['test','live']).default('live'),from:day.default('2000-01-01'),until:day.default(new Date().toISOString().slice(0,10)),page:z.coerce.number().int().min(0).max(100000).default(0),q:z.string().trim().max(100).default(''),agencyId:EntityId.optional(),jobId:EntityId.optional()}).strict().safeParse(Object.fromEntries(params));
 if(!parsed.success||parsed.data.until<parsed.data.from)throw new RequestFailure('VALIDATION_ERROR');const f=parsed.data;
 const where=`mode=? AND substr(created_at,1,10) BETWEEN ? AND ? AND (?='' OR instr(lower(title||' '||coalesce(agency,'')),lower(?))>0) AND (?='' OR agency_id=?) AND (?='' OR job_id=?)`;
 const binds=[f.mode,f.from,f.until,f.q,f.q,f.agencyId??'',f.agencyId??'',f.jobId??'',f.jobId??''];
 const rows=await DB.prepare(`SELECT job_id AS id,agency_id AS agencyId,mode,created_at AS at,status,title,agency,credits_used AS credits,revenue_micros AS revenueMicros,fee_micros AS feeMicros,fees_missing AS feesMissing,cost_micros AS costMicros,missing_providers AS missingProviders,
 CASE WHEN fees_missing=0 AND missing_providers IS NULL THEN revenue_micros-fee_micros-cost_micros END AS marginMicros FROM finance_video_summary WHERE ${where} ORDER BY created_at DESC,job_id DESC LIMIT 50 OFFSET ?`).bind(...binds,f.page*50).all<FinanceVideo>();
 const summary=(await DB.prepare(`SELECT count(*) AS videos,coalesce(sum(credits_used),0) AS credits,coalesce(sum(revenue_micros),0) AS revenueMicros,coalesce(sum(fee_micros),0) AS feeMicros,coalesce(sum(cost_micros),0) AS costMicros,
 coalesce(sum(IIF(fees_missing>0 OR missing_providers IS NOT NULL,1,0)),0) AS incomplete,CASE WHEN NOT EXISTS(SELECT 1 FROM finance_video_summary WHERE ${where} AND (fees_missing>0 OR missing_providers IS NOT NULL)) THEN coalesce(sum(revenue_micros-fee_micros-cost_micros),0) END AS marginMicros
 FROM finance_video_summary WHERE ${where}`).bind(...binds,...binds).first<FinanceReport['summary']>())!;
 const cash=(await DB.prepare(`SELECT coalesce(sum(CAST(revenue_ht_cents*10000*(max(0,gross_cents-refunded_cents-lost_cents))/gross_cents AS INTEGER)),0) AS cashHtMicros,coalesce(sum(fee_cents*10000),0) AS cashFeeMicros,coalesce(sum(IIF(fees_complete=0 OR disputed=1,1,0)),0) AS cashFeesMissing FROM financial_receipts WHERE mode=? AND substr(paid_at,1,10) BETWEEN ? AND ? AND (?='' OR agency_id=?)`).bind(f.mode,f.from,f.until,f.agencyId??'',f.agencyId??'').first<{cashHtMicros:number;cashFeeMicros:number;cashFeesMissing:number}>())!;
 const unassigned=(await DB.prepare(`SELECT coalesce(sum(e.eur_cents*10000-coalesce((SELECT sum(amount_micros) FROM financial_expense_allocations WHERE expense_id=e.id),0)),0) AS amount FROM financial_expenses e WHERE mode=? AND voided_at IS NULL AND kind='prepaid'`).bind(f.mode).first<{amount:number}>())!.amount;
 const agencies=await DB.prepare(`WITH v AS (SELECT agency_id,count(*) AS videos,sum(revenue_micros) AS revenueMicros,sum(fee_micros) AS feeMicros,sum(cost_micros) AS costMicros,sum(IIF(fees_missing>0 OR missing_providers IS NOT NULL,1,0)) AS incomplete FROM finance_video_summary WHERE ${where} GROUP BY agency_id),
 cash AS (SELECT agency_id,sum(CAST(revenue_ht_cents*10000*(max(0,gross_cents-refunded_cents-lost_cents))/gross_cents AS INTEGER)) AS cashHtMicros,sum(fee_cents*10000) AS cashFeeMicros,sum(IIF(fees_complete=0 OR disputed=1,1,0)) AS cashFeesMissing FROM financial_receipts WHERE mode=? AND substr(paid_at,1,10) BETWEEN ? AND ? GROUP BY agency_id),
 attributed AS (SELECT g.agency_id,sum(f.revenue_micros) AS amount FROM finance_credit_attribution f JOIN generation_runs g ON g.job_id=f.job_id WHERE f.mode=? GROUP BY g.agency_id),
 received AS (SELECT agency_id,sum(CAST(revenue_ht_cents*10000*(max(0,gross_cents-refunded_cents-lost_cents))/gross_cents AS INTEGER)) AS amount FROM financial_receipts WHERE mode=? GROUP BY agency_id),
 ids AS (SELECT agency_id FROM v UNION SELECT agency_id FROM cash)
 SELECT ids.agency_id AS id,coalesce(a.name,'Essai anonyme') AS name,coalesce(v.videos,0) AS videos,coalesce(v.revenueMicros,0) AS revenueMicros,coalesce(v.feeMicros,0) AS feeMicros,coalesce(v.costMicros,0) AS costMicros,coalesce(v.incomplete,0) AS incomplete,coalesce(cash.cashHtMicros,0) AS cashHtMicros,coalesce(cash.cashFeeMicros,0) AS cashFeeMicros,coalesce(cash.cashFeesMissing,0) AS cashFeesMissing,
 coalesce(received.amount,0)-coalesce(attributed.amount,0) AS unassignedRevenueMicros,CASE WHEN coalesce(v.incomplete,0)=0 THEN coalesce(v.revenueMicros-v.feeMicros-v.costMicros,0) END AS marginMicros
 FROM ids LEFT JOIN agencies a ON a.id=ids.agency_id LEFT JOIN v ON v.agency_id=ids.agency_id LEFT JOIN cash ON cash.agency_id=ids.agency_id LEFT JOIN attributed ON attributed.agency_id=ids.agency_id LEFT JOIN received ON received.agency_id=ids.agency_id
 WHERE (?='' OR ids.agency_id=?) ORDER BY revenueMicros DESC,videos DESC,ids.agency_id LIMIT 100`).bind(...binds,f.mode,f.from,f.until,f.mode,f.mode,f.agencyId??'',f.agencyId??'').all<FinanceAgency>();
 const expenses=await DB.prepare(expenseSql+' WHERE e.mode=? ORDER BY e.created_at DESC,e.id DESC LIMIT 50').bind(f.mode).all<Expense>();
 const journal=await DB.prepare('SELECT created_at AS at,action,target_id AS target FROM financial_audit ORDER BY created_at DESC,id DESC LIMIT 50').all<FinanceReport['audit'][number]>();
 const result:FinanceReport={at:new Date().toISOString(),mode:f.mode,from:f.from,until:f.until,page:f.page,total:summary.videos,videos:rows.results,agencies:agencies.results,expenses:expenses.results,audit:journal.results,summary:{...summary,...cash,unassignedCostMicros:unassigned}};
 if(f.jobId)result.detail={costs:(await DB.prepare(`SELECT e.provider,e.reference,e.kind,x.amount_micros*IIF(e.kind='credit_note',-1,1) AS amountMicros,x.units,x.covers_provider AS covers FROM financial_expense_allocations x JOIN financial_expenses e ON e.id=x.expense_id WHERE x.job_id=? AND e.voided_at IS NULL ORDER BY e.created_at`).bind(f.jobId).all<NonNullable<FinanceReport['detail']>['costs'][number]>()).results,
 funding:(await DB.prepare('SELECT receipt_id AS receipt,used,revenue_micros AS revenueMicros,fee_micros AS feeMicros,incomplete FROM finance_credit_attribution WHERE job_id=?').bind(f.jobId).all<NonNullable<FinanceReport['detail']>['funding'][number]>()).results};
 return result;
}

export function financeRequest(request:Request,env:BillingEnv&AuthEnvironment&{SUPER_ADMIN_EMAIL?:string}){return respond(async()=>{const user=await requireAdmin(request,env);if(request.method==='GET')return Response.json(await financeReport(env.DB,new URL(request.url).searchParams));if(request.method!=='POST')throw new RequestFailure('FORBIDDEN');assertSameOrigin(request,env);try{return Response.json(await financeAction(env,user.id,await boundedJson(request,24576)));}catch(e){const message=e instanceof Error?e.message:'';if(message.includes('FINANCIAL_RATE_LIMIT'))throw new RequestFailure('RATE_LIMITED');if(message.includes('FINANCIAL_ALLOCATION_INVALID'))throw new RequestFailure('CONFLICT');if(message.includes('UNIQUE constraint failed'))throw new RequestFailure('CONFLICT');throw e;}});}
