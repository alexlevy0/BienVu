import {z} from 'zod';
import {EntityId} from '@bienvu/contracts';
import {agencyMemberships,memberAgency,type AgencyRole} from '@bienvu/db';
import {contentHash} from './manual-listings';
import {RequestFailure} from './http';
type Env=Pick<CloudflareEnv,'DB'>;
const role=z.enum(['admin','editor','viewer']);
export const TeamAction=z.discriminatedUnion('action',[z.object({action:z.literal('invite'),email:z.email().max(254),role}),z.object({action:z.literal('revoke'),id:EntityId}),z.object({action:z.literal('remove'),userId:EntityId}),z.object({action:z.literal('role'),userId:EntityId,role}),z.object({action:z.literal('switch'),agencyId:EntityId}),z.object({action:z.literal('accept'),token:z.string().regex(/^[a-f0-9]{64}$/)})]);
export async function teamSummary(env:Env,agencyId:string,userId:string,access:AgencyRole){
 const row=await env.DB.prepare("SELECT json_group_array(json_object('id',u.id,'name',u.name,'email',u.email,'role',m.role)) AS items FROM agency_members m JOIN auth_user u ON u.id=m.user_id WHERE m.agency_id=?").bind(agencyId).first<{items:string}>();
 const invitations=['owner','admin'].includes(access)?await env.DB.prepare("SELECT json_group_array(json_object('id',id,'email',email,'role',role,'status',status,'expiresAt',expires_at)) AS items FROM agency_invitations WHERE agency_id=? AND expires_at>? ORDER BY created_at DESC").bind(agencyId,new Date().toISOString()).first<{items:string}>():null;
 return {members:JSON.parse(row?.items??'[]'),invitations:JSON.parse(invitations?.items??'[]'),memberships:await agencyMemberships(env.DB,userId),role:access};
}
export async function teamAction(env:Env,agencyId:string,user:{id:string;email:string},access:AgencyRole,input:unknown){
 const parsed=TeamAction.safeParse(input);if(!parsed.success)throw new RequestFailure('VALIDATION_ERROR');const b=parsed.data,at=new Date().toISOString();
 if(b.action==='switch'){if(!await memberAgency(env.DB,user.id,b.agencyId))throw new RequestFailure('FORBIDDEN');return {agencyId:b.agencyId};}
 if(b.action==='accept'){
  const invitation=await env.DB.prepare("SELECT id,agency_id AS agencyId,email,role FROM agency_invitations WHERE token_hash=? AND status='pending' AND expires_at>?").bind(await contentHash(new TextEncoder().encode(b.token)),at).first<{id:string;agencyId:string;email:string;role:AgencyRole}>();
  if(!invitation||invitation.email.toLowerCase()!==user.email.toLowerCase())throw new RequestFailure('FORBIDDEN');
  try{await env.DB.batch([env.DB.prepare("INSERT INTO agency_members SELECT agency_id,?,role,? FROM agency_invitations WHERE id=? AND status='pending' AND expires_at>? ON CONFLICT(agency_id,user_id) DO NOTHING").bind(user.id,at,invitation.id,at),env.DB.prepare("UPDATE agency_invitations SET status='accepted',accepted_by=? WHERE id=? AND status='pending'").bind(user.id,invitation.id)]);}catch(e){if(e instanceof Error&&e.message.includes('TEAM_LIMIT'))throw new RequestFailure('RATE_LIMITED');throw e;}
  return {agencyId:invitation.agencyId};
 }
 if(!['owner','admin'].includes(access))throw new RequestFailure('FORBIDDEN');
 if(b.action==='revoke'){await env.DB.prepare("UPDATE agency_invitations SET status='revoked' WHERE agency_id=? AND id=? AND status='pending'").bind(agencyId,b.id).run();return {ok:true};}
 if(b.action==='role'||b.action==='remove'){
  const target=await memberAgency(env.DB,b.userId,agencyId);if(!target)throw new RequestFailure('NOT_FOUND');
  if(target.role==='owner'||access==='admin'&&(target.role==='admin'||b.action==='role'&&b.role==='admin'))throw new RequestFailure('FORBIDDEN');
  if(b.action==='remove')await env.DB.prepare("DELETE FROM agency_members WHERE agency_id=? AND user_id=? AND role!='owner'").bind(agencyId,b.userId).run();
  else await env.DB.prepare("UPDATE agency_members SET role=? WHERE agency_id=? AND user_id=? AND role!='owner'").bind(b.role,agencyId,b.userId).run();return {ok:true};
 }
 if(b.role==='admin'&&access!=='owner')throw new RequestFailure('FORBIDDEN');
 const count=await env.DB.prepare("SELECT count(*) n FROM agency_invitations WHERE agency_id=? AND created_at>=?").bind(agencyId,new Date(Date.now()-86400_000).toISOString()).first<{n:number}>();if((count?.n??0)>=30)throw new RequestFailure('RATE_LIMITED');
 const token=Array.from(crypto.getRandomValues(new Uint8Array(32)),v=>v.toString(16).padStart(2,'0')).join(''),id=crypto.randomUUID(),expires=new Date(Date.now()+7*86400_000).toISOString();
 await env.DB.prepare("INSERT INTO agency_invitations(id,agency_id,email,role,token_hash,status,expires_at,created_at) VALUES(?,?,?,?,?,'pending',?,?)").bind(id,agencyId,b.email.toLowerCase(),b.role,await contentHash(new TextEncoder().encode(token)),expires,at).run();
 return {id,url:`/equipe?invitation=${token}`};
}
