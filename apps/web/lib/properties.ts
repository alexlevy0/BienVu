import {z} from 'zod';
import {CreationDraftData,EntityId,NormalizedListing,emptyCreationFields,propertyCaption,
  type CreationFields,type PropertyDetail,type PropertyPublication} from '@bienvu/contracts';
import {findOwnedGeneration,generationRetained,generationView,draftFromListing} from '@bienvu/db';
import {propertyGroups,type PropertyRecord,type PropertyProject,type PropertyGroup,type PropertySourcePhoto} from './property-catalog';
import {RequestFailure} from './http';
import {privateImportPhoto} from './imports';
import {contentHash} from './manual-listings';
import {customizeImportedListing} from './creation-drafts';
import {editExistingVideo} from './video-editor';

type Env=Pick<CloudflareEnv,'DB'|'MEDIA'>;
type ImportSource={id:string;source:string|null;input:string|null;result:string|null;draft:string|null;photos:string;
  status:string;expiresAt:string;createdAt:string;updatedAt:string;projectId:string|null};
type JobSource={id:string;agencyId:string;listingId:string|null;input:string;createdAt:string;updatedAt:string;status:string;
  result:string|null;presentation:string|null;photos:string|null;projectId:string|null};
const propertyId=z.string().regex(/^(listing|job|project):[a-zA-Z0-9_-]{1,128}$/);
const json=(value:string|null)=>value?JSON.parse(value):null;
function fields(result:string|null,draft:string|null):CreationFields{
  const parsed=CreationDraftData.safeParse(json(draft));if(parsed.success)return parsed.data.fields;
  const listing=NormalizedListing.safeParse(json(result));return listing.success?draftFromListing(listing.data).fields:emptyCreationFields();
}
function sourcePhotos(raw:unknown,agencyId:string,importId:string|null,jobId:string|null):PropertySourcePhoto[]{
  if(!Array.isArray(raw))return [];
  return raw.flatMap((value:Record<string,unknown>)=>{
    const hash=String(value.contentHash??value.sha256??''),key=String(value.objectKey??'');
    const prefix=jobId?`agencies/${agencyId}/jobs/${jobId}/`:`agencies/${agencyId}/imports/${importId}/`;
    if(!/^[a-f0-9]{64}$/.test(hash)||!key.startsWith(prefix)||!['image/jpeg','image/png','image/webp'].includes(String(value.mime)))return [];
    return [{id:String(value.id),hash,objectKey:key,width:Number(value.width),height:Number(value.height),sizeBytes:Number(value.sizeBytes),
      mime:String(value.mime),agencyId,importId,jobId,url:''}];
  });
}
export async function readPropertyGroups(env:Env,agencyId:string):Promise<PropertyGroup[]>{
  EntityId.parse(agencyId);
  const [imports,jobs,projects]=await Promise.all([
    env.DB.prepare(`SELECT i.id,nullif(i.source_url,'') AS source,i.input_json AS input,i.result_json AS result,d.data_json AS draft,
      (SELECT json_group_array(json(o.photo_json)) FROM import_objects o WHERE o.agency_id=i.agency_id AND o.import_id=i.id) AS photos,
      i.status,i.expires_at AS expiresAt,i.created_at AS createdAt,coalesce(d.updated_at,i.created_at) AS updatedAt,
      p.project_id AS projectId FROM listing_imports i LEFT JOIN creation_drafts d ON d.id=i.id AND d.agency_id=i.agency_id
      LEFT JOIN project_items p ON p.agency_id=i.agency_id AND p.kind='draft' AND p.entity_id=i.id
      WHERE i.agency_id=? AND i.estimate_only=0 AND (i.status='ready' OR i.draft_pending=1) AND i.status!='deleting'`).bind(agencyId).all<ImportSource>(),
    env.DB.prepare(`SELECT j.id,j.agency_id AS agencyId,coalesce(j.listing_id,json_extract(g.input_json,'$.listingId')) AS listingId,
      g.input_json AS input,j.created_at AS createdAt,j.updated_at AS updatedAt,j.status,i.result_json AS result,
      json_extract(m.manifest_json,'$.presentation') AS presentation,json_extract(m.manifest_json,'$.photos') AS photos,p.project_id AS projectId
      FROM generation_runs g JOIN jobs j ON j.id=g.job_id AND j.agency_id=g.agency_id
      LEFT JOIN listing_imports i ON i.id=j.listing_id AND i.agency_id=j.agency_id
      LEFT JOIN video_manifests m ON m.job_id=j.id AND m.agency_id=j.agency_id AND m.state='prepared'
      LEFT JOIN project_items p ON p.agency_id=g.owner_agency_id AND p.kind='job' AND p.entity_id=j.id
      WHERE g.owner_agency_id=? ORDER BY j.created_at`).bind(agencyId).all<JobSource>(),
    env.DB.prepare('SELECT id,name,archived,created_at AS createdAt FROM property_projects WHERE agency_id=?').bind(agencyId).all<PropertyProject>(),
  ]);
  const records:PropertyRecord[]=imports.results.map(row=>{
    const draft=CreationDraftData.safeParse(json(row.draft)),input=json(row.input),listing=NormalizedListing.safeParse(json(row.result));
    return {key:`listing:${row.id}`,id:row.id,kind:'listing',parent:typeof input?.editorSource==='string'?`listing:${input.editorSource}`:null,
      originHash:typeof input?.sourceHash==='string'?input.sourceHash:null,canonicalUrl:draft.success?draft.data.canonicalUrl:listing.success?listing.data.canonicalUrl:row.source,
      projectId:row.projectId,fields:fields(row.result,row.draft),photos:sourcePhotos(listing.success?listing.data.photos:json(row.photos),agencyId,row.id,null),
      createdAt:row.createdAt,updatedAt:row.updatedAt,editable:row.status==='importing'&&draft.success&&row.expiresAt>new Date().toISOString(),
      editor:draft.success&&Boolean(draft.data.videoCustomization?.editor),status:row.status,jobId:null};
  });
  const wanted=new Set(records.flatMap(r=>r.originHash?[r.originHash]:[])),origins=new Map<string,string>();
  if(wanted.size)for(const job of jobs.results){const hash=await contentHash(new TextEncoder().encode(`Version de la vidéo ${job.id}`));if(wanted.has(hash))origins.set(hash,`job:${job.id}`);}
  for(const record of records)if(record.originHash&&origins.has(record.originHash))record.parent=origins.get(record.originHash)!;
  for(const job of jobs.results){const presentation=json(job.presentation),input=json(job.input),jobFields=fields(job.result,null);
    if(presentation)for(const key of ['title','propertyType','transaction','locality','priceCents','rooms'] as const)
      if(jobFields[key]===null&&presentation[key]!==undefined)(jobFields as Record<string,unknown>)[key]=presentation[key];
    if(jobFields.area===null&&presentation?.areaM2)jobFields.area=presentation.areaM2;
    records.push({key:`job:${job.id}`,id:job.id,kind:'job',parent:job.listingId?`listing:${job.listingId}`:null,
      originHash:null,canonicalUrl:NormalizedListing.safeParse(json(job.result)).success?json(job.result).canonicalUrl:input.url??null,
      fields:jobFields,projectId:job.projectId,photos:sourcePhotos(json(job.photos),job.agencyId,null,job.id),
      createdAt:job.createdAt,updatedAt:job.updatedAt,editable:false,editor:false,status:job.status,jobId:job.id});}
  // Expired, abandoned drafts are not properties; completed jobs stay visible.
  return propertyGroups(records.filter(r=>r.kind==='job'||r.editable||r.status==='ready'),projects.results);
}
export function findProperty(groups:PropertyGroup[],id:string){
  id=id.replace(/%3a/gi,':');
  if(!propertyId.safeParse(id).success)throw new RequestFailure('NOT_FOUND');
  const found=groups.find(group=>group.summary.id===id||group.aliases.includes(id));if(!found)throw new RequestFailure('NOT_FOUND');return found;
}
export function propertyPage(groups:PropertyGroup[],params:URLSearchParams){
  const query=(params.get('q')??'').trim().toLocaleLowerCase('fr-FR'),filter=params.get('filter')??'all',sort=params.get('sort')??'updated';
  if(query.length>80||!['all','sale','rent','archived'].includes(filter)||!['updated','newest','oldest','title'].includes(sort))throw new RequestFailure('VALIDATION_ERROR');
  const filtered=groups.filter(({summary:p})=>(filter==='archived'?p.archived:!p.archived&&(filter==='all'||p.fields.transaction===filter))&&
    (!query||`${p.title} ${p.fields.locality??''} ${p.reference}`.toLocaleLowerCase('fr-FR').includes(query)))
    .sort((a,b)=>sort==='title'?a.summary.title.localeCompare(b.summary.title,'fr'):sort==='oldest'?
      a.summary.createdAt.localeCompare(b.summary.createdAt):sort==='newest'?b.summary.createdAt.localeCompare(a.summary.createdAt):b.summary.updatedAt.localeCompare(a.summary.updatedAt));
  const cursor=params.get('cursor');let start=0;if(cursor){if(cursor.length>200||!propertyId.safeParse(cursor).success)throw new RequestFailure('VALIDATION_ERROR');
    const position=filtered.findIndex(g=>g.summary.id===cursor);if(position<0)throw new RequestFailure('CONFLICT');start=position+1;}
  const page=filtered.slice(start,start+24);return {properties:page.map(g=>g.summary),total:filtered.length,nextCursor:start+24<filtered.length?page.at(-1)!.summary.id:null};
}
export async function propertyDetail(env:Env,agencyId:string,id:string,cursor:string|null,agencyName:string):Promise<PropertyDetail>{
  const group=findProperty(await readPropertyGroups(env,agencyId),id),records=group.records.filter(r=>r.kind==='job').sort((a,b)=>b.createdAt.localeCompare(a.createdAt));
  let start=0;if(cursor){if(!EntityId.safeParse(cursor).success)throw new RequestFailure('VALIDATION_ERROR');const i=records.findIndex(r=>r.id===cursor);if(i<0)throw new RequestFailure('CONFLICT');start=i+1;}
  const slice=records.slice(start,start+20),rows=await Promise.all(slice.map(r=>findOwnedGeneration(env.DB,agencyId,r.id)));
  const jobs=rows.filter(row=>row!==null).map(row=>generationView(row));
  const refs=records.map(r=>r.id),referenceJson=JSON.stringify(refs);
  const [shares,posts]=refs.length?await Promise.all([
    env.DB.prepare(`SELECT id,job_id AS jobId FROM generation_shares WHERE revoked_at IS NULL AND job_id IN (SELECT value FROM json_each(?))
      AND job_id IN (SELECT job_id FROM generation_runs WHERE owner_agency_id=?)`).bind(referenceJson,agencyId).all<{id:string;jobId:string}>(),
    env.DB.prepare(`SELECT p.id,p.job_id AS jobId,p.scheduled_at AS scheduledAt,p.caption,
      (SELECT json_group_array(json_object('platform',t.platform,'name',t.account_name,'status',t.status,'permalink',t.permalink))
       FROM social_targets t WHERE t.post_id=p.id) AS targets FROM social_posts p WHERE p.agency_id=? AND p.prepared=1
      AND p.job_id IN (SELECT value FROM json_each(?)) ORDER BY p.scheduled_at DESC LIMIT 100`).bind(agencyId,referenceJson).all<Omit<PropertyPublication,'targets'>&{targets:string}>(),
  ]):[{results:[]},{results:[]}];
  return {property:group.summary,jobs,shares:shares.results,photos:group.photos.map(p=>({id:p.hash,url:p.url,width:p.width,height:p.height})),
    drafts:group.records.filter(r=>r.editable).map(r=>({id:r.id,title:r.fields.title??'Brouillon',editor:r.editor})),
    caption:propertyCaption(group.summary.fields,agencyName),nextCursor:start+20<records.length?slice.at(-1)!.id:null,
    publications:posts.results.map(p=>({...p,targets:JSON.parse(p.targets)}))};
}
export async function archiveProperty(env:Env,agencyId:string,id:string,archived:boolean){
  const group=findProperty(await readPropertyGroups(env,agencyId),id),projectId=group.summary.projectId??crypto.randomUUID(),at=new Date().toISOString();
  const n=await env.DB.prepare('SELECT count(*) n FROM property_projects WHERE agency_id=?').bind(agencyId).first<{n:number}>();
  if(!group.summary.projectId&&(n?.n??0)>=500)throw new RequestFailure('RATE_LIMITED');
  await env.DB.batch([
    env.DB.prepare('INSERT INTO property_projects(id,agency_id,name,archived,created_at) VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET archived=excluded.archived WHERE property_projects.agency_id=excluded.agency_id')
      .bind(projectId,agencyId,group.summary.title.slice(0,120),archived?1:0,at),
    env.DB.prepare(`INSERT INTO project_items(agency_id,project_id,kind,entity_id,created_at)
      SELECT ?,?,json_extract(value,'$.kind'),json_extract(value,'$.id'),? FROM json_each(?) WHERE 1
      ON CONFLICT(agency_id,kind,entity_id) DO UPDATE SET project_id=excluded.project_id`)
      .bind(agencyId,projectId,at,JSON.stringify(group.records.map(record=>({id:record.id,kind:record.kind==='listing'?'draft':'job'})))),
  ]);return {id:`project:${projectId}`,archived};
}
export async function propertyPhoto(env:Env,agencyId:string,id:string,hash:string,request:Request){
  if(!/^[a-f0-9]{64}$/.test(hash))throw new RequestFailure('NOT_FOUND');
  const group=findProperty(await readPropertyGroups(env,agencyId),id);
  const candidates=group.records.flatMap(r=>r.photos).filter(p=>p.hash===hash).sort((a,b)=>Number(Boolean(b.jobId))-Number(Boolean(a.jobId)));
  for(const photo of candidates){
    if(photo.jobId){const job=await findOwnedGeneration(env.DB,agencyId,photo.jobId);if(!job||!generationRetained(job))continue;
      const head=await env.MEDIA.head(photo.objectKey);if(!head||head.size!==photo.sizeBytes||head.customMetadata?.sha256!==photo.hash)continue;
      const object=await env.MEDIA.get(photo.objectKey);if(!object)continue;
      return new Response(object.body,{headers:{'Content-Type':photo.mime,'Content-Length':String(head.size),
        'Content-Disposition':`${new URL(request.url).searchParams.has('download')?'attachment':'inline'}; filename="bienvu-photo-${photo.hash.slice(0,12)}.${photo.mime==='image/png'?'png':photo.mime==='image/webp'?'webp':'jpg'}"`}});
    }
    if(photo.importId){try{const ownedJobs=group.records.filter(r=>r.kind==='job'&&r.parent===`listing:${photo.importId}`);
      let retained=false;for(const r of ownedJobs){const job=await findOwnedGeneration(env.DB,agencyId,r.id);if(job&&generationRetained(job)&&job.expiresAt===null){retained=true;break;}}
      const response=await privateImportPhoto(env,agencyId,photo.importId,photo.id,retained);
      if(new URL(request.url).searchParams.has('download'))response.headers.set('Content-Disposition',`attachment; filename="bienvu-photo-${photo.hash.slice(0,12)}.jpg"`);
      return response;
    }catch(error){if(!(error instanceof RequestFailure&&error.code==='NOT_FOUND'))throw error;}}
  }throw new RequestFailure('NOT_FOUND');
}
export async function preparePropertyDraft(env:Env,agencyId:string,id:string,key:string,signal:AbortSignal){
  if(!/^[a-zA-Z0-9_-]{16,128}$/.test(key))throw new RequestFailure('VALIDATION_ERROR');
  const group=findProperty(await readPropertyGroups(env,agencyId),id);
  const draft=group.records.filter(r=>r.editable).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt))[0];
  if(draft)return {draftId:draft.id};
  const video=group.records.filter(r=>r.kind==='job'&&r.status==='ready').sort((a,b)=>b.createdAt.localeCompare(a.createdAt))[0];
  if(video){const copy=await editExistingVideo(env,agencyId,video.id,key,signal);return {draftId:copy.id};}
  const source=group.records.find(r=>r.kind==='listing'&&r.status==='ready');if(!source)throw new RequestFailure('NOT_FOUND');
  const copy=await customizeImportedListing(env,agencyId,source.id,key,signal);return {draftId:copy.id};
}
