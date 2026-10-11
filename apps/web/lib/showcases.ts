import {ShowcaseConfig,ShowcaseAction,ShowcaseSlug,ShowcasePropertySettings,showcaseSlugBase,showcasePublicConfig,VideoManifest,VideoReport,
  type AgencyProfile,type CreationFields,type ShowcaseStoredProperty,type ShowcaseAssetMeta,type ShowcaseItem,type ShowcasePublic,type ShowcasePublicProperty,type ShowcaseConfig as Config} from '@bienvu/contracts';
import {readShowcase,readShowcaseItems,showcaseSlugAvailable,findAgencyLogo,findOwnedGeneration,generationRetained,generationMasterUnlocked,generationView,type ShowcaseRow} from '@bienvu/db';
import {readPropertyGroups,findProperty,propertyPage} from './properties';
import type {PropertyGroup,PropertySourcePhoto} from './property-catalog';
import {contentHash} from './manual-listings';
import {RequestFailure} from './http';
import {normalizeLogo} from './logo';

export type ShowcaseEnv=Pick<CloudflareEnv,'DB'|'MEDIA'>;
type Asset=ShowcaseAssetMeta&{agencyId:string;objectKey:string;sourceKey:string;sourceHash:string;ready:number;createdAt:string};
const assetColumns='id,agency_id AS agencyId,object_key AS objectKey,source_key AS sourceKey,source_hash AS sourceHash,kind,mime,width,height,size_bytes AS sizeBytes,ready,created_at AS createdAt';
export async function showcaseAsset(env:ShowcaseEnv,agency:string,id:string){return env.DB.prepare(`SELECT ${assetColumns} FROM showcase_assets WHERE id=? AND agency_id=? AND ready=1`).bind(id,agency).first<Asset>();}
const meta=(a:Asset):ShowcaseAssetMeta=>({id:a.id,kind:a.kind,width:a.width,height:a.height,mime:a.mime,sizeBytes:a.sizeBytes});
const fail=(error:unknown):never=>{const message=error instanceof Error?error.message:'';
  if(/UNIQUE constraint|SHOWCASE_CONFLICT/.test(message))throw new RequestFailure('CONFLICT');
  if(message.includes('SHOWCASE_STORAGE_FULL'))throw new RequestFailure('RATE_LIMITED',{media:'La réserve de médias de cette vitrine est pleine. Retirez les sélections inutilisées ou contactez BienVu.'});throw error;};
async function retainAsset(env:ShowcaseEnv,agency:string,source:{key:string;hash:string;kind:Asset['kind'];mime:string;width:number;height:number;sizeBytes:number},bytes?:Uint8Array,claimed=false){
  if(!claimed&&!source.key.startsWith(`agencies/${agency}/`)&&!source.key.startsWith('showcase-upload:'))throw new RequestFailure('FORBIDDEN');
  if(!Number.isSafeInteger(source.sizeBytes)||source.sizeBytes<1||source.sizeBytes>50*1024*1024)throw new RequestFailure('FILE_TOO_LARGE');
  const old=await env.DB.prepare(`SELECT ${assetColumns} FROM showcase_assets WHERE agency_id=? AND source_key=? AND source_hash=? AND kind=?`).bind(agency,source.key,source.hash,source.kind).first<Asset>();
  if(old?.ready&&await env.MEDIA.head(old.objectKey))return meta(old);
  const id=old?.id??crypto.randomUUID(),key=old?.objectKey??`agencies/${agency}/showcase/${id}.${source.mime==='video/mp4'?'mp4':source.mime==='image/png'?'png':source.mime==='image/webp'?'webp':'jpg'}`;
  if(!old)try{await env.DB.prepare('INSERT INTO showcase_assets(id,agency_id,source_key,source_hash,object_key,kind,mime,width,height,size_bytes,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)')
    .bind(id,agency,source.key,source.hash,key,source.kind,source.mime,source.width,source.height,source.sizeBytes,new Date().toISOString()).run();}catch(error){fail(error);}
  if(bytes){if(bytes.length!==source.sizeBytes||await contentHash(new Uint8Array(bytes))!==source.hash)throw new RequestFailure('NOT_FOUND');
    await env.MEDIA.put(key,bytes,{httpMetadata:{contentType:source.mime},customMetadata:{sha256:source.hash}});
  }else{const head=await env.MEDIA.head(source.key);if(!head||head.size!==source.sizeBytes)throw new RequestFailure('NOT_FOUND');
    const object=await env.MEDIA.get(source.key);if(!object)throw new RequestFailure('NOT_FOUND');
    if(source.kind==='video'){if(head.customMetadata?.sha256!==source.hash||head.size>50*1024*1024)throw new RequestFailure('NOT_FOUND');const options={httpMetadata:{contentType:source.mime},customMetadata:{sha256:source.hash}};
      if(typeof FixedLengthStream!=='undefined'){const fixed=new FixedLengthStream(head.size);await Promise.all([object.body.pipeTo(fixed.writable),env.MEDIA.put(key,fixed.readable,options)]);}
      else await env.MEDIA.put(key,await object.arrayBuffer(),options); // Bounded fallback for the Node/Miniflare test bridge; Workers stream.
    }
    else{if(source.sizeBytes>10*1024*1024)throw new RequestFailure('FILE_TOO_LARGE');const pixels=new Uint8Array(await object.arrayBuffer());if(await contentHash(pixels)!==source.hash)throw new RequestFailure('NOT_FOUND');
      await env.MEDIA.put(key,pixels,{httpMetadata:{contentType:source.mime},customMetadata:{sha256:source.hash}});}}
  await env.DB.prepare('UPDATE showcase_assets SET ready=1 WHERE id=? AND agency_id=?').bind(id,agency).run();return{id,kind:source.kind,width:source.width,height:source.height,mime:source.mime,sizeBytes:source.sizeBytes};
}
export async function ensureShowcase(env:ShowcaseEnv,agency:AgencyProfile){
  let row=await readShowcase(env.DB,agency.id);if(row)return row;
  const at=new Date().toISOString(),slug=showcaseSlugBase(agency.name)+'-'+agency.id.replaceAll('-','').slice(0,8);
  const config:Config={name:agency.name,slug,tagline:'',description:'',city:agency.city??'',sectors:[],phone:agency.phone,email:agency.email,website:agency.website,
    socials:{instagram:null,facebook:null,linkedin:null,youtube:null},address:'',showAddress:false,accent:agency.primaryColor,logoAssetId:null,coverAssetId:null,keepSold:false,notifications:true};
  await env.DB.batch([env.DB.prepare('INSERT INTO agency_showcases(agency_id,draft_json,created_at,updated_at) VALUES(?,?,?,?) ON CONFLICT(agency_id) DO NOTHING').bind(agency.id,JSON.stringify(config),at,at),
    env.DB.prepare('INSERT INTO showcase_slugs(slug,agency_id,created_at) VALUES(?,?,?) ON CONFLICT(slug) DO NOTHING').bind(slug,agency.id,at)]);
  row=(await readShowcase(env.DB,agency.id))!;
  if(agency.logoAssetId){const logo=await findAgencyLogo(env.DB,agency.id,agency.logoAssetId);if(logo)try{const asset=await retainAsset(env,agency.id,{key:logo.objectKey,hash:logo.contentHash,kind:'logo',mime:'image/png',width:logo.width,height:logo.height,sizeBytes:logo.sizeBytes});
    await env.DB.prepare('UPDATE agency_showcases SET draft_json=? WHERE agency_id=? AND version=1 AND published_json IS NULL').bind(JSON.stringify({...row.draft,logoAssetId:asset.id}),agency.id).run();}catch{/* The agency can choose a logo before publication; fallback stays useful. */}}
  return (await readShowcase(env.DB,agency.id))!;
}
export async function uploadShowcaseImage(env:ShowcaseEnv,agency:string,bytes:Uint8Array,mime:string,kind:'logo'|'cover'){
  const image=await normalizeLogo(bytes,mime);return retainAsset(env,agency,{key:'showcase-upload:'+image.hash,hash:image.hash,kind,mime:'image/png',width:image.width,height:image.height,sizeBytes:image.bytes.length},image.bytes);
}
export async function showcaseFactsHash(fields:CreationFields){const normalized=(value:string|null)=>value?.trim().replace(/\s+/g,' ').toLocaleLowerCase('fr-FR')??null;return contentHash(new TextEncoder().encode(JSON.stringify([fields.priceCents,fields.area,fields.rooms,fields.transaction,normalized(fields.locality),fields.propertyType,fields.charges,normalized(fields.title),normalized(fields.description)])));}
async function copyPhoto(env:ShowcaseEnv,agency:string,photo:PropertySourcePhoto){
  if(photo.agencyId!==agency){if(!photo.jobId||!await findOwnedGeneration(env.DB,agency,photo.jobId))throw new RequestFailure('NOT_FOUND');
    // Claimed anonymous assets are owned through generation_runs. Copy via the
    // same scoped proof, never by an object key supplied by a browser.
    const object=await env.MEDIA.get(photo.objectKey);if(!object||object.size!==photo.sizeBytes||object.size>10*1024*1024)throw new RequestFailure('NOT_FOUND');
    return retainAsset(env,agency,{key:`showcase-upload:${photo.hash}`,hash:photo.hash,kind:'photo',mime:photo.mime,width:photo.width,height:photo.height,sizeBytes:photo.sizeBytes},new Uint8Array(await object.arrayBuffer()));}
  return retainAsset(env,agency,{key:photo.objectKey,hash:photo.hash,kind:'photo',mime:photo.mime,width:photo.width,height:photo.height,sizeBytes:photo.sizeBytes});
}
async function prepareItem(env:ShowcaseEnv,agency:string,group:PropertyGroup,settings:ShowcaseStoredProperty['settings']):Promise<ShowcaseStoredProperty>{
  if(group.summary.archived)throw new RequestFailure('CONFLICT');const photos:ShowcaseStoredProperty['photos']=[];
  for(const hash of settings.photoIds){const photo=group.photos.find(p=>p.hash===hash);if(!photo)throw new RequestFailure('NOT_FOUND');photos.push({...await copyPhoto(env,agency,photo),sourceHash:hash});}
  let video:ShowcaseStoredProperty['video']=null;
  if(settings.videoJobId){if(!group.records.some(r=>r.kind==='job'&&r.id===settings.videoJobId))throw new RequestFailure('NOT_FOUND');
    const job=await findOwnedGeneration(env.DB,agency,settings.videoJobId);if(!job||job.status!=='ready'||!generationRetained(job)||!generationMasterUnlocked(job)||!job.objectKey||!job.report)throw new RequestFailure('NOT_FOUND');
    const stored=await env.DB.prepare("SELECT manifest_json AS json FROM video_manifests WHERE agency_id=? AND job_id=? AND state='prepared'").bind(job.agencyId,job.jobId).first<{json:string}>();if(!stored)throw new RequestFailure('NOT_FOUND');
    const manifest=VideoManifest.parse(JSON.parse(stored.json)),report=VideoReport.parse(JSON.parse(job.report)),p=manifest.presentation;
    const frozenFields=group.records.find(r=>r.jobId===job.jobId)!.fields;
    const facts=p?{...frozenFields,title:p.title,propertyType:p.propertyType,priceCents:p.priceCents??null,area:p.areaM2??null,rooms:p.rooms??null,transaction:p.transaction??null,locality:p.locality??null}:frozenFields;
    if(!job.objectKey.startsWith(`agencies/${job.agencyId}/jobs/${job.jobId}/`))throw new RequestFailure('NOT_FOUND');
    video={...await retainAsset(env,agency,{key:job.objectKey,hash:report.sha256,kind:'video',mime:'video/mp4',width:report.width,height:report.height,sizeBytes:report.sizeBytes},undefined,job.agencyId!==agency),jobId:job.jobId,factsHash:await showcaseFactsHash(facts),aspectRatio:report.width>report.height?'16:9':'9:16',durationSeconds:report.durationSeconds};
  }return{settings,photos,video};
}
export function showcasePropertyIssues(group:PropertyGroup|null,item:ShowcaseStoredProperty){const issues:string[]=[];
  if(!group)return ['Ce bien n’est plus disponible dans Mes biens.'];if(group.summary.archived)issues.push('Ce bien est archivé.');
  if(!group.summary.fields.title)issues.push('Ajoutez un titre au bien.');if(!group.summary.fields.locality)issues.push('Renseignez la commune.');
  if(!group.summary.fields.transaction)issues.push('Précisez vente ou location.');if(!item.photos.length)issues.push('Sélectionnez au moins une photo publique.');
  if(!item.settings.coverPhotoId||!item.photos.some(p=>p.sourceHash===item.settings.coverPhotoId))issues.push('Choisissez une photo de couverture.');
  if(item.settings.showAddress&&!item.settings.address)issues.push('Renseignez l’adresse dont vous autorisez la publication.');return issues;}
function groupFor(groups:PropertyGroup[],id:string){return groups.find(g=>g.summary.id===id||g.aliases.includes(id))??null;}
async function validConfigAssets(env:ShowcaseEnv,agency:string,config:Config){for(const[id,kind]of[[config.logoAssetId,'logo'],[config.coverAssetId,'cover']]as const){if(!id)continue;const a=await showcaseAsset(env,agency,id);if(!a||a.kind!==kind||!await env.MEDIA.head(a.objectKey))throw new RequestFailure('NOT_FOUND');}}
async function validateItemAssets(env:ShowcaseEnv,agency:string,item:ShowcaseStoredProperty){for(const selected of[...item.photos,...(item.video?[item.video]:[])]){const a=await showcaseAsset(env,agency,selected.id);if(!a||a.kind!==selected.kind||!await env.MEDIA.head(a.objectKey))throw new RequestFailure('NOT_FOUND');}}
export async function mutateShowcase(env:ShowcaseEnv,agency:AgencyProfile,role:string,input:unknown){
  const parsed=ShowcaseAction.safeParse(input);if(!parsed.success)throw new RequestFailure('VALIDATION_ERROR');const action=parsed.data;
  if(role==='viewer'||['save','publish','offline'].includes(action.action)&&!['owner','admin'].includes(role))throw new RequestFailure('FORBIDDEN');
  if(!('version'in action))throw new RequestFailure('VALIDATION_ERROR');
  const row=await ensureShowcase(env,agency);if(row.version!==action.version)throw new RequestFailure('CONFLICT');
  const at=new Date().toISOString(),token=crypto.randomUUID(),gate="EXISTS(SELECT 1 FROM agency_showcases WHERE agency_id=? AND mutation_token=?)";
  const statements=[env.DB.prepare('UPDATE agency_showcases SET version=version+1,updated_at=?,mutation_token=? WHERE agency_id=? AND version=?').bind(at,token,agency.id,row.version)];
  if(action.action==='save'){const config=ShowcaseConfig.parse(action.config);await validConfigAssets(env,agency.id,config);
    if(!await showcaseSlugAvailable(env.DB,agency.id,config.slug))throw new RequestFailure('CONFLICT');
    statements.push(env.DB.prepare(`INSERT INTO showcase_slugs(slug,agency_id,created_at) SELECT ?,?,? WHERE ${gate} ON CONFLICT(slug) DO NOTHING`).bind(config.slug,agency.id,at,agency.id,token),
      env.DB.prepare(`UPDATE agency_showcases SET draft_json=? WHERE agency_id=? AND mutation_token=? AND EXISTS(SELECT 1 FROM showcase_slugs WHERE slug=? AND agency_id=?)`).bind(JSON.stringify(config),agency.id,token,config.slug,agency.id));
  }else if(action.action==='offline'){statements.push(env.DB.prepare('UPDATE agency_showcases SET status=\'offline\' WHERE agency_id=? AND mutation_token=?').bind(agency.id,token));
  }else if(action.action==='property-save'){const groups=await readPropertyGroups(env,agency.id),group=findProperty(groups,action.propertyId),items=await readShowcaseItems(env.DB,agency.id);
    const old=items.find(i=>group.aliases.includes(i.propertyId)||i.propertyId===group.summary.id);if(!old&&items.length>=500)throw new RequestFailure('RATE_LIMITED');
    const item=await prepareItem(env,agency.id,group,ShowcasePropertySettings.parse(action.settings)),id=old?.id??crypto.randomUUID(),anchor=group.records.find(r=>r.kind==='listing')?.key??group.records[0].key;
    statements.push(env.DB.prepare(`INSERT INTO showcase_properties(id,agency_id,property_id,draft_json,created_at,updated_at)
      SELECT ?,?,?,?,?,? WHERE ${gate} ON CONFLICT(id) DO UPDATE SET draft_json=excluded.draft_json,removed=0,updated_at=excluded.updated_at WHERE showcase_properties.agency_id=excluded.agency_id`)
      .bind(id,agency.id,old?.propertyId??anchor,JSON.stringify(item),at,at,agency.id,token));
  }else if(action.action==='property-remove'){const items=await readShowcaseItems(env.DB,agency.id),item=items.find(i=>i.id===action.id);if(!item)throw new RequestFailure('NOT_FOUND');const groups=await readPropertyGroups(env,agency.id),group=groupFor(groups,item.propertyId),aliases=group?[...group.aliases,group.summary.id]:[item.propertyId];
    statements.push(env.DB.prepare(`UPDATE showcase_properties SET removed=1,published_json=NULL,updated_at=? WHERE agency_id=? AND property_id IN (SELECT value FROM json_each(?)) AND ${gate}`).bind(at,agency.id,JSON.stringify(aliases),agency.id,token));
  }else{
    const groups=await readPropertyGroups(env,agency.id),items=await readShowcaseItems(env.DB,agency.id);
    const chosen=action.action==='property-publish'?items.filter(i=>i.id===action.id):items.filter(i=>!i.removed);
    if(!chosen.length)throw new RequestFailure('VALIDATION_ERROR',{'biens':'Choisissez au moins un bien publiable.'});
    const config=action.action==='publish'?row.draft:row.published;
    if(!config||!config.name.trim()||!config.phone&&!config.email&&!config.website||action.action==='property-publish'&&row.status!=='published')throw new RequestFailure('VALIDATION_ERROR',{'vitrine':'Renseignez le nom, un contact et publiez la présentation de l’agence.'});
    await validConfigAssets(env,agency.id,config);
    const publishedGroups=new Set<string>();
    for(const item of chosen){const group=groupFor(groups,item.propertyId),issues=showcasePropertyIssues(group,item.draft);if(issues.length)throw new RequestFailure('VALIDATION_ERROR',{[item.id]:issues.join(' ')});if(publishedGroups.has(group!.summary.id))continue;publishedGroups.add(group!.summary.id);await validateItemAssets(env,agency.id,item.draft);
      statements.push(env.DB.prepare(`UPDATE showcase_properties SET removed=1,published_json=NULL,updated_at=? WHERE agency_id=? AND id!=? AND property_id IN (SELECT value FROM json_each(?)) AND ${gate}`).bind(at,agency.id,item.id,JSON.stringify([...group!.aliases,group!.summary.id]),agency.id,token));
      statements.push(env.DB.prepare(`UPDATE showcase_properties SET published_json=draft_json,removed=0,updated_at=? WHERE agency_id=? AND id=? AND ${gate}`).bind(at,agency.id,item.id,agency.id,token));}
    if(action.action==='publish'){statements.push(env.DB.prepare(`UPDATE showcase_slugs SET public=1 WHERE agency_id=? AND slug=? AND ${gate}`).bind(agency.id,config.slug,agency.id,token),
      env.DB.prepare('UPDATE agency_showcases SET status=\'published\',published_json=draft_json,published_at=? WHERE agency_id=? AND mutation_token=?').bind(at,agency.id,token));}
  }
  try{const results=await env.DB.batch(statements);if(!results[0].meta.changes)throw new RequestFailure('CONFLICT');}catch(error){fail(error);}return readShowcase(env.DB,agency.id);
}
export async function resolvePublicShowcase(env:ShowcaseEnv,slug:string){if(!ShowcaseSlug.safeParse(slug).success)throw new RequestFailure('NOT_FOUND');
  const owned=await env.DB.prepare('SELECT s.agency_id AS agencyId FROM showcase_slugs s JOIN agency_showcases a ON a.agency_id=s.agency_id WHERE s.slug=? AND s.public=1 AND a.status=\'published\' AND a.published_json IS NOT NULL').bind(slug).first<{agencyId:string}>();
  const row=owned?await readShowcase(env.DB,owned.agencyId):null;if(!row||row.status!=='published'||!row.published)throw new RequestFailure('NOT_FOUND');return row;}
export function showcasePath(slug:string,id?:string){return `/agences/${slug}${id?'/biens/'+id:''}`;}
async function itemPublic(env:ShowcaseEnv,row:ShowcaseRow,config:Config,item:ShowcaseItem,group:PropertyGroup,preview:boolean):Promise<ShowcasePublicProperty|null>{
  const selected=preview?item.draft:item.published;if(!selected||!preview&&item.removed||group.summary.archived||!config.keepSold&&['sold','rented'].includes(selected.settings.status))return null;
  const photos=(await Promise.all(selected.photos.map(async p=>{const a=await showcaseAsset(env,row.agencyId,p.id);if(!a||!await env.MEDIA.head(a.objectKey))return[];return[{id:a.id,url:preview?`/api/vitrine/assets/${a.id}`:`/api/vitrines/${config.slug}/biens/${item.id}/media/${a.id}`,width:a.width,height:a.height,sourceHash:p.sourceHash}];}))).flat();
  if(!photos.length)return null;
  const currentHash=await showcaseFactsHash(group.summary.fields),videoOutdated=Boolean(selected.video&&selected.video.factsHash!==currentHash);let video:ShowcasePublicProperty['video']=null;
  if(selected.video&&!videoOutdated){const job=await findOwnedGeneration(env.DB,row.agencyId,selected.video.jobId),a=await showcaseAsset(env,row.agencyId,selected.video.id);
    if(job?.status==='ready'&&generationMasterUnlocked(job)&&a&&await env.MEDIA.head(a.objectKey))video={url:preview?`/api/vitrine/assets/${a.id}`:`/api/vitrines/${config.slug}/biens/${item.id}/media/${a.id}`,aspectRatio:selected.video.aspectRatio,durationSeconds:selected.video.durationSeconds};}
  const cover=photos.find(p=>p.sourceHash===selected.settings.coverPhotoId)??photos[0];
  const image=({sourceHash:_hash,...p}:typeof cover)=>p;
  return{id:item.id,url:preview?`/ma-vitrine/apercu?frame=1&bien=${item.id}`:showcasePath(config.slug,item.id),fields:{...group.summary.fields},reference:group.summary.reference,
    status:selected.settings.status,featured:selected.settings.featured,photos:photos.map(image),cover:image(cover),video,address:selected.settings.showAddress?selected.settings.address:null,
    dpe:selected.settings.dpe,ges:selected.settings.ges,legal:selected.settings.legal,videoOutdated,updatedAt:group.summary.updatedAt};
}
export async function showcaseView(env:ShowcaseEnv,row:ShowcaseRow,params=new URLSearchParams(),preview=false):Promise<ShowcasePublic>{
  const config=preview?row.draft:row.published;if(!config||!preview&&row.status!=='published')throw new RequestFailure('NOT_FOUND');
  const[groups,items]=await Promise.all([readPropertyGroups(env,row.agencyId),readShowcaseItems(env.DB,row.agencyId)]);
  const q=(params.get('q')??'').trim().toLocaleLowerCase('fr-FR'),transaction=params.get('transaction')??'',type=params.get('type')??'',locality=params.get('locality')??'',budget=Number(params.get('budget')??0),rooms=Number(params.get('rooms')??0),page=Number(params.get('page')??1);
  if(q.length>80||locality.length>200||!['','sale','rent'].includes(transaction)||!['','apartment','house','other'].includes(type)||![budget,rooms,page].every(Number.isFinite)||budget<0||budget>1_000_000_000||rooms<0||rooms>100||!Number.isInteger(page)||page<1||page>1000)throw new RequestFailure('VALIDATION_ERROR');
  const seen=new Set<string>();
  const candidates=items.flatMap(item=>{const group=groupFor(groups,item.propertyId),selected=preview?item.draft:item.published;if(!group||seen.has(group.summary.id)||!selected||item.removed||group.summary.archived||!selected.photos.length||!config.keepSold&&['sold','rented'].includes(selected.settings.status))return[];seen.add(group.summary.id);return[{item,group,selected}];})
    .sort((a,b)=>a.selected.settings.order-b.selected.settings.order||a.item.id.localeCompare(b.item.id));
  const filtered=candidates.filter(({group})=>{const p=group.summary;return(!q||`${p.fields.title} ${p.fields.locality}`.toLocaleLowerCase('fr-FR').includes(q))&&(!transaction||p.fields.transaction===transaction)&&(!type||p.fields.propertyType===type)&&(!locality||p.fields.locality?.toLocaleLowerCase('fr-FR').includes(locality.toLocaleLowerCase('fr-FR')))&&(!budget||p.fields.priceCents!==null&&p.fields.priceCents<=budget*100)&&(!rooms||(p.fields.rooms??0)>=rooms);});
  const featuredCandidates=candidates.filter(p=>p.selected.settings.featured).slice(0,6),selectedCandidates=[...new Map([...filtered.slice((page-1)*12,page*12),...featuredCandidates].map(p=>[p.item.id,p])).values()];
  const projected=new Map<string,ShowcasePublicProperty>();for(let offset=0;offset<selectedCandidates.length;offset+=4){const properties=await Promise.all(selectedCandidates.slice(offset,offset+4).map(p=>itemPublic(env,row,config,p.item,p.group,preview)));for(const property of properties)if(property)projected.set(property.id,property);}
  async function brandImage(id:string|null){const a=id?await showcaseAsset(env,row.agencyId,id):null;return a&&await env.MEDIA.head(a.objectKey)?{id:a.id,url:preview?`/api/vitrine/assets/${a.id}`:`/api/vitrines/${config!.slug}/media/${a.id}`,width:a.width,height:a.height}:null;}
  return{config:showcasePublicConfig(config),logo:await brandImage(config.logoAssetId),cover:await brandImage(config.coverAssetId),properties:filtered.slice((page-1)*12,page*12).flatMap(p=>projected.get(p.item.id)?[projected.get(p.item.id)!]:[]),featured:featuredCandidates.flatMap(p=>projected.get(p.item.id)?[projected.get(p.item.id)!]:[]),total:filtered.length,page,pages:Math.max(1,Math.ceil(filtered.length/12)),publishedAt:row.publishedAt??row.updatedAt,preview};
}
export async function publicShowcaseProperty(env:ShowcaseEnv,row:ShowcaseRow,id:string,preview=false){const config=preview?row.draft:row.published;if(!config)throw new RequestFailure('NOT_FOUND');
  const[groups,items]=await Promise.all([readPropertyGroups(env,row.agencyId),readShowcaseItems(env.DB,row.agencyId)]);let item=items.find(p=>p.id===id);const group=item?groupFor(groups,item.propertyId):null;
  if(!preview&&group&&item?.published&&!item.removed)item=items.find(p=>p.published&&!p.removed&&(config.keepSold||!['sold','rented'].includes(p.published.settings.status))&&groupFor(groups,p.propertyId)?.summary.id===group.summary.id);
  const property=item&&group?await itemPublic(env,row,config,item,group,preview):null;if(!property)throw new RequestFailure('NOT_FOUND');return property;}
export async function streamShowcaseAsset(request:Request,env:ShowcaseEnv,agency:string,id:string){const a=await showcaseAsset(env,agency,id);if(!a)throw new RequestFailure('NOT_FOUND');
  const head=await env.MEDIA.head(a.objectKey);if(!head||head.size!==a.sizeBytes||head.customMetadata?.sha256!==a.sourceHash)throw new RequestFailure('NOT_FOUND');
  let offset=0,length=head.size;const range=request.headers.get('range');if(range){const match=/^bytes=(\d*)-(\d*)$/.exec(range);if(!match||!match[1]&&!match[2])throw new RequestFailure('VALIDATION_ERROR');
    offset=match[1]?Number(match[1]):Math.max(0,head.size-Number(match[2]));const end=match[1]&&match[2]?Math.min(head.size-1,Number(match[2])):head.size-1;length=end-offset+1;if(!Number.isSafeInteger(offset)||!Number.isSafeInteger(length)||offset<0||length<1||offset>=head.size)return new Response(null,{status:416,headers:{'Content-Range':`bytes */${head.size}`}});}
  const headers={'Content-Type':a.mime,'Content-Length':String(length),'Accept-Ranges':'bytes','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff',...(range?{'Content-Range':`bytes ${offset}-${offset+length-1}/${head.size}`}:{})};
  if(request.method==='HEAD')return new Response(null,{status:range?206:200,headers});const object=await env.MEDIA.get(a.objectKey,range?{range:{offset,length}}:undefined);if(!object)throw new RequestFailure('NOT_FOUND');return new Response(object.body,{status:range?206:200,headers});
}
export async function publicShowcaseMedia(request:Request,env:ShowcaseEnv,slug:string,id:string,propertyId?:string){const row=await resolvePublicShowcase(env,slug);
  if(propertyId){const[groups,items]=await Promise.all([readPropertyGroups(env,row.agencyId),readShowcaseItems(env.DB,row.agencyId)]),item=items.find(p=>p.id===propertyId),selected=item?.published,group=item?groupFor(groups,item.propertyId):null;
    const primary=group?items.find(p=>p.published&&!p.removed&&(row.published!.keepSold||!['sold','rented'].includes(p.published.settings.status))&&groupFor(groups,p.propertyId)?.summary.id===group.summary.id):null;
    if(!selected||item!.removed||!group||group.summary.archived||primary?.id!==propertyId||!row.published!.keepSold&&['sold','rented'].includes(selected.settings.status))throw new RequestFailure('NOT_FOUND');
    if(!selected.photos.some(photo=>photo.id===id)){const video=selected.video;if(!video||video.id!==id||video.factsHash!==await showcaseFactsHash(group.summary.fields))throw new RequestFailure('NOT_FOUND');const job=await findOwnedGeneration(env.DB,row.agencyId,video.jobId);if(job?.status!=='ready'||!generationMasterUnlocked(job))throw new RequestFailure('NOT_FOUND');}}
  else if(![row.published!.logoAssetId,row.published!.coverAssetId].includes(id))throw new RequestFailure('NOT_FOUND');
  return streamShowcaseAsset(request,env,row.agencyId,id);}
export async function showcasePropertySelection(env:ShowcaseEnv,agency:string,params:URLSearchParams){const groups=await readPropertyGroups(env,agency),page=propertyPage(groups,params),wanted=params.get('propertyId');
  const chosen=wanted?[findProperty(groups,wanted).summary]:page.properties;
  const properties=[];for(const p of chosen){const g=findProperty(groups,p.id),videos=[];for(const record of g.records.filter(r=>r.kind==='job')){const job=await findOwnedGeneration(env.DB,agency,record.id);if(job){const view=generationView(job);videos.push({id:job.jobId,title:job.title??'Vidéo',ready:job.status==='ready'&&generationRetained(job)&&generationMasterUnlocked(job),aspectRatio:view.aspectRatio??'9:16',videoUrl:view.videoUrl??null});}}
    properties.push({id:p.id,title:p.title,fields:p.fields,archived:p.archived,photos:g.photos.map(photo=>({id:photo.hash,url:photo.url,width:photo.width,height:photo.height})),videos});}
  return{properties,total:page.total,nextCursor:page.nextCursor,groups};}
