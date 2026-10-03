import {AgencyProfile,type Me} from '@bienvu/contracts';
import type {Database} from './index';
export type AgencyRole='owner'|'admin'|'editor'|'viewer';
export async function memberAgency(db:Database,userId:string,agencyId:string){
 const row=await db.prepare(`SELECT a.id,a.owner_user_id AS ownerUserId,a.name,a.logo_asset_id AS logoAssetId,a.primary_color AS primaryColor,a.secondary_color AS secondaryColor,a.phone,a.email,a.website,a.city,a.created_at AS createdAt,a.updated_at AS updatedAt,a.brand_version AS brandVersion,m.role FROM agencies a JOIN agency_members m ON m.agency_id=a.id WHERE a.id=? AND m.user_id=?`).bind(agencyId,userId).first<{role:AgencyRole}>();
 if(!row)return null;const {role,...fields}=row;return {agency:AgencyProfile.parse(fields),role};
}
export async function agencyMemberships(db:Database,userId:string):Promise<NonNullable<Me['memberships']>>{
 const row=await db.prepare("SELECT json_group_array(json_object('id',a.id,'name',a.name,'role',m.role)) AS items FROM agency_members m JOIN agencies a ON a.id=m.agency_id WHERE m.user_id=?").bind(userId).first<{items:string}>();return JSON.parse(row?.items??'[]');
}
