import {emptyCreationFields,propertyCaption,type CreationFields,type PropertySummary} from '@bienvu/contracts';

export type PropertySourcePhoto = {id:string;hash:string;width:number;height:number;url:string;
  objectKey:string;mime:string;sizeBytes:number;agencyId:string;jobId:string|null;importId:string|null};
export type PropertyRecord = {key:string;id:string;kind:'listing'|'job';parent:string|null;originHash:string|null;
  canonicalUrl:string|null;projectId:string|null;createdAt:string;updatedAt:string;fields:CreationFields;
  photos:PropertySourcePhoto[];editable:boolean;editor:boolean;status:string;jobId:string|null};
export type PropertyProject = {id:string;name:string;archived:number;createdAt:string};
export type PropertyGroup = {summary:PropertySummary;records:PropertyRecord[];aliases:string[];photos:PropertySourcePhoto[]};

// Only explicit lineage, the canonical listing URL, or an identical set of
// source photos groups properties. A matching title or city is insufficient.
// Distinct folders chosen by the agency always keep their own grouping.
export function propertyGroups(records:PropertyRecord[],projects:PropertyProject[]):PropertyGroup[]{
  const ordered=[...records].sort((a,b)=>a.createdAt.localeCompare(b.createdAt)||a.key.localeCompare(b.key));
  const parent=new Map(ordered.map(r=>[r.key,r.key])),assignments=new Map(ordered.map(r=>[r.key,r.projectId]));
  const root=(key:string):string=>{const next=parent.get(key);if(!next||next===key)return key;const result=root(next);parent.set(key,result);return result;};
  const merge=(a:string,b:string)=>{if(!parent.has(a)||!parent.has(b))return;const x=root(a),y=root(b);if(x===y)return;
    const px=assignments.get(x),py=assignments.get(y);if(px&&py&&px!==py)return;
    parent.set(y,x);assignments.set(x,px??py??null);};
  const folders=new Map<string,string>();for(const record of ordered)if(record.projectId){const old=folders.get(record.projectId);if(old)merge(old,record.key);else folders.set(record.projectId,record.key);}
  for(const record of ordered)if(record.parent)merge(record.parent,record.key);
  const urls=new Map<string,string>(),images=new Map<string,string>();
  for(const record of ordered){if(record.canonicalUrl){let canonical=record.canonicalUrl;try{const url=new URL(canonical);url.hash='';canonical=url.href;}catch{/* Retain the exact saved source. */}
      const old=urls.get(canonical);if(old)merge(old,record.key);else urls.set(canonical,record.key);}
    if(record.photos.length>=3){const fingerprint=[...new Set(record.photos.map(p=>p.hash))].sort().join(':');
      const old=images.get(fingerprint);if(old)merge(old,record.key);else images.set(fingerprint,record.key);}}
  const groups=new Map<string,PropertyRecord[]>();for(const record of ordered){const key=root(record.key);groups.set(key,[...(groups.get(key)??[]),record]);}
  return [...groups.values()].map(members=>{
    const projectId=members.find(r=>r.projectId)?.projectId??null,project=projects.find(p=>p.id===projectId);
    const first=members.find(r=>r.kind==='listing')??members[0],id=project?`project:${project.id}`:first.key;
    const latest=[...members].sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt)||(a.kind==='listing'?-1:1));
    const fields=emptyCreationFields();for(const record of latest)for(const key of Object.keys(fields) as (keyof CreationFields)[])
      if(fields[key]===null&&record.fields[key]!==null)(fields as Record<string,unknown>)[key]=record.fields[key];
    const title=fields.title||project?.name||'Votre bien';fields.title=title;
    const photos:PropertySourcePhoto[]=[],hashes=new Set<string>();for(const record of latest)for(const photo of record.photos){
      if(hashes.has(photo.hash))continue;hashes.add(photo.hash);photos.push({...photo,url:`/api/properties/${encodeURIComponent(id)}/photos/${photo.hash}`});}
    const jobs=members.filter(r=>r.kind==='job'),drafts=members.filter(r=>r.kind==='listing'&&r.editable);
    const visuals=photos.length>0&&(fields.priceCents!==null||fields.area!==null||fields.rooms!==null)?1:0;
    const summary:PropertySummary={id,title,fields,reference:`BV-${first.id.replaceAll('-','').slice(0,8).toUpperCase()}`,
      projectId,archived:project?.archived===1,createdAt:members[0].createdAt,updatedAt:latest[0].updatedAt,
      coverUrl:photos[0]?.url??null,thumbnails:photos.slice(0,3).map(({hash,url,width,height})=>({id:hash,url,width,height})),photoCount:photos.length,
      videoCount:jobs.length,draftCount:drafts.length,visualCount:visuals,textCount:fields.locality||fields.title!=='Votre bien'?1:0,
      attentionCount:jobs.filter(r=>r.status==='failed').length};
    return {summary,records:members,aliases:[...members.map(r=>r.key),...(project?[`project:${project.id}`]:[])],photos};
  }).sort((a,b)=>b.summary.updatedAt.localeCompare(a.summary.updatedAt)||a.summary.id.localeCompare(b.summary.id));
}
export {propertyCaption};
