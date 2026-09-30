import {z} from 'zod';
import {EntityId} from './product';

export const AdminSection = z.enum(['videos','agencies','users','subscriptions','quotas','imports','reports','audit']);
export type AdminSection = z.infer<typeof AdminSection>;
export const AdminQuery = z.object({
  section: AdminSection.default('videos'), q: z.string().trim().max(100).default(''),
  status: z.string().max(30).regex(/^[a-z_]*$/).default(''),
  agency: EntityId.optional(), from: z.iso.date().optional(), to: z.iso.date().optional(),
  cursor: z.string().max(1600).optional(),
}).strict().refine(v=>!v.from||!v.to||v.from<=v.to,{message:'INVALID_DATE_RANGE'});
export type AdminQuery = z.infer<typeof AdminQuery>;
const reason = z.string().trim().min(5).max(300);
export const AdminAction = z.discriminatedUnion('action',[
  z.object({action:z.literal('generation_gate'),enabled:z.boolean(),expected:z.boolean(),reason}).strict(),
  z.object({action:z.literal('report_status'),id:EntityId,status:z.enum(['new','reviewing','closed']),expected:z.enum(['new','reviewing','closed']),reason}).strict(),
  z.object({action:z.literal('quota'),id:EntityId,limit:z.number().int().min(1).max(1000),expected:z.number().int().min(1).max(1000),reason}).strict(),
]);
export type AdminAction = z.infer<typeof AdminAction>;
export type AdminRow = Record<string,string|number|null>;
export type AdminPage = {rows:AdminRow[];nextCursor:string|null;total:number};
export type AdminOverview = {
  at:string; counts:Record<string,number>; statuses:{status:string;count:number}[];
  daily:{day:string;total:number;ready:number;failed:number}[];
  errors:{code:string;stage:string;count:number}[];
  providers:{provider:string;mode:string;state:string;calls:number;reservedCents:number}[];
  budget:{month:string;baselineCents:number;importsCents:number;ceilingCents:number;paused:number}|null;
  narrationBudget:{month:string;envelopeCents:number;reservedCents:number;paused:number}|null;
  costs:{currency:string;kind:string;amountMicros:number;events:number}[];
  storage:{kind:string;bytes:number;objects:number}[];
  control:{enabled:number;updatedAt:string}|null;
  policy:Record<string,number>|null;
  performance:{days:number;total:number;ready:number;failed:number;active:number;measuredReady:number;averageSeconds:number|null};
  monthlyCosts:{provider:string;realCalls:number;measuredCalls:number;mockCalls:number;failedCalls:number;amountMicros:number|null}[];
  config:{generations:boolean;anonymousTrials:boolean;imports:string;email:string;google:boolean;origin:string};
};
export const AdminTrafficQuery=z.object({section:z.literal('traffic'),days:z.enum(['7','30']).default('30')}).strict();
export type AdminTraffic={at:string;days:number;enabled:boolean;firstDay:string|null;total:number;
  daily:{day:string;views:number}[];countries:{country:string;views:number}[];pages:{page:string;views:number}[]};
export type AdminVideoDetail = {
  video:AdminRow;events:AdminRow[];reports:AdminRow[];calls:AdminNarrationCall[];
};
export type AdminNarrationCall = {
  id:string;provider:'openai'|'google';mode:'real'|'mock';state:'pending'|'done'|'failed';error:string|null;reservedCents:number;at:string;step:string;
  model:string|null;voice:string|null;requestId:string|null;providerRequestId:string|null;responseId:string|null;requestDurationMs:number|null;
  inputTokens:number|null;outputTokens:number|null;cachedInputTokens:number|null;inputCharacters:number|null;
  currency:'USD'|null;priceDate:string|null;estimatedMicros:number|null;
};
