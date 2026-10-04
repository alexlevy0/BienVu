import {HomepageQuery,HomepageSource,HomepageSelections,type HomepageAsset} from '@bienvu/contracts';
import type {Database} from './index';

export type HomepageSettingsRow={revision:number;draft_json:string;published_json:string;published_version:number;published_at:string|null;updated_at:string};
export type HomepageAssetRow={id:string;source_kind:HomepageSource['kind'];source_id:string;request_hash:string;object_key:string;metadata_json:string;
  poster_json:string|null;state:'staging'|'active'|'deleting';created_at:string;actor_user_id:string};
export type HomepageSourceRow={kind:HomepageSource['kind'];id:string;agencyId:string;parentId:string;objectKey:string;
  payload:string;poster:string|null;title:string;agency:string|null;locality:string|null;createdAt:string};
const title=`coalesce(json_extract(i.result_json,'$.facts.title.value'),json_extract(d.data_json,'$.fields.title'),'Votre annonce')`;
const locality=`coalesce(json_extract(i.result_json,'$.facts.locality.value'),json_extract(d.data_json,'$.fields.locality'))`;
// Only metadata is enumerated. Private files remain behind the admin guard.
const sources=`SELECT 'photo' AS kind,o.id,o.agency_id AS agencyId,o.import_id AS parentId,o.object_key AS objectKey,o.photo_json AS payload,NULL AS poster,
 ${title} AS title,a.name AS agency,${locality} AS locality,i.created_at AS createdAt
 FROM import_objects o JOIN listing_imports i ON i.id=o.import_id AND i.agency_id=o.agency_id
 LEFT JOIN agencies a ON a.id=o.agency_id LEFT JOIN creation_drafts d ON d.id=i.id AND d.agency_id=i.agency_id
 WHERE i.status IN ('ready','importing')
 UNION ALL SELECT 'video',g.job_id,g.agency_id,g.job_id,v.object_key,v.report_json,
 json_extract(m.manifest_json,'$.photos[0]'),${title},a.name,${locality},j.created_at
 FROM generation_runs g JOIN jobs j ON j.id=g.job_id JOIN generation_artifacts v ON v.job_id=g.job_id
 LEFT JOIN video_manifests m ON m.job_id=g.job_id LEFT JOIN listing_imports i ON i.id=j.listing_id AND i.agency_id=g.agency_id
 LEFT JOIN creation_drafts d ON d.id=i.id AND d.agency_id=i.agency_id LEFT JOIN agencies a ON a.id=coalesce(g.owner_agency_id,g.agency_id)
 WHERE j.status='ready' AND g.retention='available'
 UNION ALL SELECT 'animation',p.id,p.agency_id,p.job_id,json_extract(p.animation_json,'$.asset.objectKey'),
 json_extract(p.animation_json,'$.asset'),(SELECT o.photo_json FROM import_objects o WHERE o.id=p.photo_id AND o.agency_id=p.agency_id),
 ${title}||' · Plan '||(p.slot+1),a.name,${locality},p.created_at
 FROM photo_animations p JOIN jobs j ON j.id=p.job_id LEFT JOIN listing_imports i ON i.id=j.listing_id AND i.agency_id=p.agency_id
 LEFT JOIN creation_drafts d ON d.id=i.id AND d.agency_id=i.agency_id LEFT JOIN agencies a ON a.id=p.agency_id
 WHERE p.state='ready' AND p.animation_json IS NOT NULL
 UNION ALL SELECT 'library',l.id,l.agency_id,l.origin_job_id,json_extract(l.asset_json,'$.objectKey'),l.asset_json,
 (SELECT o.photo_json FROM import_objects o WHERE o.agency_id=l.agency_id AND json_extract(o.photo_json,'$.contentHash')=l.source_sha256 LIMIT 1),
 ${title}||' · Plan conservé',a.name,${locality},l.created_at
 FROM animation_library l JOIN jobs j ON j.id=l.origin_job_id LEFT JOIN listing_imports i ON i.id=j.listing_id AND i.agency_id=l.agency_id
 LEFT JOIN creation_drafts d ON d.id=i.id AND d.agency_id=i.agency_id LEFT JOIN agencies a ON a.id=l.agency_id WHERE l.state='available'`;

export async function homepageSettings(db:Database){
 const row=await db.prepare('SELECT * FROM homepage_settings WHERE id=1').first<HomepageSettingsRow>();
 if(!row)throw Error('HOMEPAGE_SETTINGS_MISSING');return row;
}
export async function homepageAsset(db:Database,id:string){return db.prepare('SELECT * FROM homepage_assets WHERE id=?').bind(id).first<HomepageAssetRow>();}
export async function homepageSource(db:Database,source:HomepageSource){
 const ref=HomepageSource.parse(source);return db.prepare(`SELECT * FROM (${sources}) WHERE kind=? AND id=?`).bind(ref.kind,ref.id).first<HomepageSourceRow>();
}
export async function homepageSources(db:Database,input:unknown){
 const query=HomepageQuery.parse(input),params:(string|number)[]=[],where=['1=1'];
 if(query.kind!=='all'){where.push(query.kind==='animation'?"kind IN ('animation','library')":'kind=?');if(query.kind!=='animation')params.push(query.kind);}
 if(query.agency){where.push('agencyId=?');params.push(query.agency);}
 if(query.q){where.push("(instr(lower(title),lower(?))>0 OR instr(lower(coalesce(agency,'')),lower(?))>0 OR instr(lower(coalesce(locality,'')),lower(?))>0 OR instr(id,?)>0)");params.push(query.q,query.q,query.q,query.q);}
 const base=`FROM (${sources}) WHERE ${where.join(' AND ')}`,fingerprint=JSON.stringify({...query,cursor:undefined});
 const total=(await db.prepare('SELECT count(*) AS n '+base).bind(...params).first<{n:number}>())!.n;
 let seek='';if(query.cursor){try{const token=JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(query.cursor),c=>c.charCodeAt(0)))) as unknown;
   if(!Array.isArray(token)||token.length!==4||token[0]!==fingerprint||typeof token[1]!=='string'||token[1].length>40||!HomepageSource.safeParse({kind:token[2],id:token[3]}).success)throw 0;
   seek=' AND (createdAt,kind,id)<(?,?,?)';params.push(token[1],token[2],token[3]);
  }catch{throw Error('HOMEPAGE_INVALID_CURSOR');}}
 const result=await db.prepare(`SELECT json_group_array(json_object('kind',kind,'id',id,'agencyId',agencyId,'parentId',parentId,'objectKey',objectKey,
  'payload',payload,'poster',poster,'title',title,'agency',agency,'locality',locality,'createdAt',createdAt)) AS items FROM
  (SELECT * ${base}${seek} ORDER BY createdAt DESC,kind DESC,id DESC LIMIT 25)`).bind(...params).first<{items:string}>();
 const found=JSON.parse(result?.items??'[]') as HomepageSourceRow[],rows=found.slice(0,24),last=rows.at(-1);
 const token=last?JSON.stringify([fingerprint,last.createdAt,last.kind,last.id]):'';
 return {rows,total,nextCursor:found.length>24?btoa(String.fromCharCode(...new TextEncoder().encode(token))):null};
}
export function homepageStoredMetadata(row:HomepageAssetRow){return JSON.parse(row.metadata_json) as Omit<HomepageAsset,'url'|'posterUrl'>;}
export async function homepageSelectedAssets(db:Database,selections:HomepageSelections){
 const ids=[...new Set(Object.values(selections).filter((id):id is string=>typeof id==='string'))];if(!ids.length)return [];
 const result=await db.prepare(`SELECT json_group_array(json_object('id',id,'source_kind',source_kind,'source_id',source_id,'request_hash',request_hash,
  'object_key',object_key,'metadata_json',metadata_json,'poster_json',poster_json,'state',state,'created_at',created_at,'actor_user_id',actor_user_id)) AS items
  FROM homepage_assets WHERE state='active' AND id IN (${ids.map(()=>'?').join(',')})`).bind(...ids).first<{items:string}>();
 return JSON.parse(result?.items??'[]') as HomepageAssetRow[];
}
