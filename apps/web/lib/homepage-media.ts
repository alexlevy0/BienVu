import {HomepageAsset,HomepageCommand,HomepageQuery,HomepageSelections,HomepageSource,homepageSlots,PhotoAsset,VideoAsset,VideoReport,
  type HomepageAdmin,type HomepageCandidate,type HomepageConfig,type HomepageLibrary,type HomepageSlot} from '@bienvu/contracts';
import {homepageAsset,homepageSettings,homepageSource,homepageSources,homepageSelectedAssets,homepageStoredMetadata,
  type HomepageAssetRow,type HomepageSourceRow,type Database} from '@bienvu/db';
import type {AuthEnvironment} from './auth';
import {requireAdmin} from './admin-access';
import {assertSameOrigin,boundedJson,RequestFailure,respond} from './http';
import {contentHash} from './manual-listings';
import {resolveHomeMedia} from './home-media-view';

type Env={DB:D1Database;MEDIA:Pick<R2Bucket,'get'|'head'|'put'|'delete'>};
type AdminEnv=Env&AuthEnvironment&{SUPER_ADMIN_EMAIL?:string};
type Media={key:string;sha256:string;sizeBytes:number;mime:HomepageAsset['mime'];width:number|null;height:number|null;durationMs:number|null};
export type HomepageCache={cache:Pick<Cache,'match'|'put'>;origin:string;waitUntil(task:Promise<unknown>):void};
export async function homepageEdgeCache(origin:string,waitUntil:HomepageCache['waitUntil']):Promise<HomepageCache|undefined>{
 if(typeof caches==='undefined')return undefined;
 try{return {cache:await caches.open('bienvu-homepage-v2'),origin,waitUntil};}catch{return undefined;}
}
function cacheKey(context:HomepageCache,path:string,headers?:Headers){return new Request(new URL('/__bienvu_cache__/homepage-v2/'+path,context.origin),{headers});}
function writeCache(context:HomepageCache,key:Request,response:Response){
 try{context.waitUntil(context.cache.put(key,response).catch(()=>{}));}catch{/* Cache availability never prevents a public page from loading. */}
}
function photoMedia(raw:string,agency:string):Media {
 const data=JSON.parse(raw) as unknown,photo=PhotoAsset.safeParse(data);
 if(photo.success){if(photo.data.agencyId!==agency)throw new RequestFailure('NOT_FOUND');return {key:photo.data.objectKey,sha256:photo.data.contentHash,sizeBytes:photo.data.sizeBytes,mime:photo.data.mime,width:photo.data.width,height:photo.data.height,durationMs:null};}
 const asset=VideoAsset.parse(data);
 if(!asset.mime.startsWith('image/')||!asset.objectKey.startsWith(`agencies/${agency}/`))throw new RequestFailure('NOT_FOUND');
 return {key:asset.objectKey,sha256:asset.sha256,sizeBytes:asset.sizeBytes,mime:asset.mime as Media['mime'],width:asset.width??null,height:asset.height??null,durationMs:null};
}
function sourceMedia(row:HomepageSourceRow):Media {
 let media:Media;
 if(row.kind==='photo')media=photoMedia(row.payload,row.agencyId);
 else if(row.kind==='video'){
  const report=VideoReport.parse(JSON.parse(row.payload));media={key:row.objectKey,sha256:report.sha256,sizeBytes:report.sizeBytes,mime:'video/mp4',width:report.width,height:report.height,durationMs:Math.round(report.durationSeconds*1000)};
 }else{const asset=VideoAsset.parse(JSON.parse(row.payload));if(asset.mime!=='video/mp4')throw new RequestFailure('NOT_FOUND');
  media={key:asset.objectKey,sha256:asset.sha256,sizeBytes:asset.sizeBytes,mime:asset.mime,width:asset.width??null,height:asset.height??null,durationMs:asset.durationMs??null};}
 const prefix=row.kind==='photo'?`agencies/${row.agencyId}/imports/${row.parentId}/`:row.kind==='library'?`agencies/${row.agencyId}/imports/animation-library/`:`agencies/${row.agencyId}/jobs/${row.parentId}/`;
 if(media.key!==row.objectKey||!media.key.startsWith(prefix))throw new RequestFailure('NOT_FOUND');return media;
}
async function mediaPresent(env:Env,media:Media){const head=await env.MEDIA.head(media.key);return Boolean(head&&head.size===media.sizeBytes&&(!head.customMetadata?.sha256||head.customMetadata.sha256===media.sha256));}
function assetView(row:HomepageAssetRow,admin=false):HomepageAsset {
 const data=homepageStoredMetadata(row),root=admin?'/api/admin/homepage/assets/':'/api/homepage/media/';
 return HomepageAsset.parse({...data,url:root+row.id,posterUrl:row.poster_json?root+row.id+'?poster=1':null});
}
export async function readHomepageConfig(db:Database,preview=false,context?:HomepageCache):Promise<HomepageConfig>{
 const state=await homepageSettings(db),selections=HomepageSelections.parse(JSON.parse(preview?state.draft_json:state.published_json));
 // Read the live publication version first. Publishing or withdrawing a choice
 // invalidates entries at every edge without relying on a per-datacenter purge.
 const key=!preview&&context?cacheKey(context,`config/${state.published_version}`):null;
 if(key&&context){try{const hit=await context.cache.match(key);if(hit){const config=await hit.json() as HomepageConfig;
  if(config.version===state.published_version&&Object.entries(config.slots).every(([slot,asset])=>
   selections[slot as HomepageSlot]===asset.id&&HomepageAsset.safeParse(asset).success&&asset.url.startsWith('/api/homepage/media/')))return config;
 }}catch{/* An absent or obsolete entry falls back to the database. */}}
 const rows=await homepageSelectedAssets(db,selections);
 rows.sort((a,b)=>a.id.localeCompare(b.id));
 const views=rows.map(row=>assetView(row,preview));
 // Reuse one public URL for identical bytes, including posters also used as photos.
 // Only currently published assets participate; private or withdrawn copies never do.
 if(!preview){const urls=new Map<string,string>();
  for(const asset of views)if(!urls.has(asset.sha256))urls.set(asset.sha256,asset.url);
  for(const row of rows){if(row.poster_json){const poster=JSON.parse(row.poster_json) as Media;if(!urls.has(poster.sha256))urls.set(poster.sha256,assetView(row).posterUrl!);}}
  for(const asset of views){asset.url=urls.get(asset.sha256)!;const row=rows.find(row=>row.id===asset.id)!;if(row.poster_json)asset.posterUrl=urls.get((JSON.parse(row.poster_json) as Media).sha256)!;}
 }
 const assets=new Map(views.map(asset=>[asset.id,asset]));
 const slots:HomepageConfig['slots']={};for(const slot of homepageSlots){const id=selections[slot.id],asset=id?assets.get(id):null;if(asset)slots[slot.id]=asset;}
 const config={version:preview?state.revision:state.published_version,slots};
 if(key&&context)writeCache(context,key,Response.json(config,{headers:{'Cache-Control':'public, max-age=3600'}}));
 return config;
}
export async function readHomepageAdmin(db:Database):Promise<HomepageAdmin>{
 const state=await homepageSettings(db),draft=HomepageSelections.parse(JSON.parse(state.draft_json)),published=HomepageSelections.parse(JSON.parse(state.published_json));
 const rows=await homepageSelectedAssets(db,{...published,...draft}),assets:HomepageAdmin['assets']={};
 // Include published choices hidden by a newer draft, for comparing/reverting.
 const publishedRows=await homepageSelectedAssets(db,published);
 for(const row of [...rows,...publishedRows])assets[row.id]=assetView(row,true);
 const result=await db.prepare("SELECT json_group_array(json_object('action',action,'createdAt',created_at)) AS items FROM (SELECT * FROM homepage_audit ORDER BY created_at DESC,id DESC LIMIT 8)").first<{items:string}>();
 const history=JSON.parse(result?.items??'[]') as HomepageAdmin['history'];
 return {revision:state.revision,publishedVersion:state.published_version,publishedAt:state.published_at,updatedAt:state.updated_at,draft,published,assets,history};
}
export async function readHomepageLibrary(env:Env,input:unknown):Promise<HomepageLibrary>{
 const result=await homepageSources(env.DB,input),items:HomepageCandidate[]=[];
 // Bound R2 fan-out; rows are already limited to one page across all agencies.
 for(let offset=0;offset<result.rows.length;offset+=6){const page=await Promise.all(result.rows.slice(offset,offset+6).map(async row=>{
  let media:Media|null=null,available=false,posterAvailable=false;try{media=sourceMedia(row);available=await mediaPresent(env,media);}catch{/* Interrupted/old media remain visible, never selectable. */}
  if(available&&row.poster){try{posterAvailable=await mediaPresent(env,photoMedia(row.poster,row.agencyId));}catch{/* A retained clip can outlive its original photo. */}}
  const root='/api/admin/homepage/sources/'+row.kind+'/'+row.id;
  return {id:row.id,kind:row.kind==='photo'?'image':'video',title:row.title.slice(0,220),agency:row.agency?.slice(0,200)??null,locality:row.locality?.slice(0,200)??null,
   mime:media?.mime??(row.kind==='photo'?'image/jpeg':'video/mp4'),sha256:media?.sha256??'0'.repeat(64),sizeBytes:media?.sizeBytes??1,
   durationMs:media?.durationMs??null,width:media?.width??null,height:media?.height??null,url:root,posterUrl:posterAvailable?root+'?poster=1':null,
   createdAt:row.createdAt,source:{kind:row.kind,id:row.id},available} satisfies HomepageCandidate;
 }));items.push(...page);}
 return {items,total:result.total,nextCursor:result.nextCursor};
}
async function copyMedia(env:Env,source:Media,key:string){
 const object=await env.MEDIA.get(source.key);
 if(!object||object.size!==source.sizeBytes||object.customMetadata?.sha256&&object.customMetadata.sha256!==source.sha256)throw new RequestFailure('NOT_FOUND');
 const metadata={httpMetadata:{contentType:source.mime},customMetadata:{sha256:source.sha256}};
 // R2 needs a stream with a known length. Workers use a bounded stream; the
 // Node-only fixture runtime has no FixedLengthStream implementation.
 let stored:R2Object|null;
 if(typeof FixedLengthStream==='undefined')stored=await env.MEDIA.put(key,await object.arrayBuffer(),metadata);
 else{const stream=new FixedLengthStream(source.sizeBytes);const [,result]=await Promise.all([object.body.pipeTo(stream.writable),env.MEDIA.put(key,stream.readable,metadata)]);stored=result;}
 if(!stored||stored.size!==source.sizeBytes)throw Error('HOMEPAGE_COPY_FAILED');
}
const extension=(mime:Media['mime'])=>({'image/jpeg':'jpg','image/png':'png','image/webp':'webp','video/mp4':'mp4'} as const)[mime];
export async function changeHomepage(env:Env,actor:string,body:unknown){
 const parsed=HomepageCommand.safeParse(body);if(!parsed.success)throw new RequestFailure('VALIDATION_ERROR');const action=parsed.data,state=await homepageSettings(env.DB),at=new Date().toISOString();
 const hash=await contentHash(new TextEncoder().encode(JSON.stringify(action)));
 if(action.action==='assign'&&action.source){const replay=await homepageAsset(env.DB,action.requestId);
  if(replay){if(replay.request_hash!==hash)throw new RequestFailure('CONFLICT');
   if(replay.state==='active'&&JSON.parse(state.draft_json)[action.slot]===replay.id)return readHomepageAdmin(env.DB);
   if(state.revision!==action.revision||replay.state==='deleting')throw new RequestFailure('CONFLICT');}}
 if(state.revision!==action.revision)throw new RequestFailure('CONFLICT');
 let draft=HomepageSelections.parse(JSON.parse(state.draft_json)),copiedId:string|null=null;
 if(action.action==='assign'){
  if(action.source){
   const source=await homepageSource(env.DB,action.source);if(!source)throw new RequestFailure('NOT_FOUND');const media=sourceMedia(source),slot=homepageSlots.find(s=>s.id===action.slot)!;
   if(slot.kind==='image'&&media.mime==='video/mp4'||slot.kind==='video'&&media.mime!=='video/mp4')throw new RequestFailure('VALIDATION_ERROR',{media:'Choisissez un média du type indiqué pour cet emplacement.'});
   if(!await mediaPresent(env,media))throw new RequestFailure('NOT_FOUND',{media:'Le fichier d’origine n’est plus disponible. Choisissez un autre média.'});
   let poster:Media|null=null;try{if(source.poster){const possible=photoMedia(source.poster,source.agencyId);if(await mediaPresent(env,possible))poster=possible;}}catch{/* A missing original poster never blocks a retained video. */}
   const id=action.requestId,key=`homepage/${id}/media.${extension(media.mime)}`,posterKey=poster?`homepage/${id}/poster.${extension(poster.mime)}`:null;
   const metadata:Omit<HomepageAsset,'url'|'posterUrl'>={id,kind:media.mime==='video/mp4'?'video':'image',title:source.title.slice(0,220),agency:source.agency?.slice(0,200)??null,locality:source.locality?.slice(0,200)??null,
    mime:media.mime,sha256:media.sha256,sizeBytes:media.sizeBytes,durationMs:media.durationMs,width:media.width,height:media.height,createdAt:at};
   await env.DB.prepare(`INSERT INTO homepage_assets(id,source_kind,source_id,request_hash,object_key,metadata_json,poster_json,created_at,actor_user_id)
    VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO NOTHING`).bind(id,source.kind,source.id,hash,key,JSON.stringify(metadata),poster&&posterKey?JSON.stringify({...poster,key:posterKey}):null,at,actor).run();
   const staged=await homepageAsset(env.DB,id);if(!staged||staged.request_hash!==hash||staged.state==='deleting')throw new RequestFailure('CONFLICT');
   await copyMedia(env,media,key);if(poster&&posterKey)await copyMedia(env,poster,posterKey);copiedId=id;draft={...draft,[action.slot]:id};
  }else draft={...draft,[action.slot]:null};
 }
 if(action.action==='discard')draft=HomepageSelections.parse(JSON.parse(state.published_json));
 if(action.action==='publish'){
  const selected=await homepageSelectedAssets(env.DB,draft);
  if(selected.length!==new Set(Object.values(draft).filter(Boolean)).size)throw new RequestFailure('NOT_FOUND');
  for(const row of selected){const meta=homepageStoredMetadata(row);if(!await mediaPresent(env,{...meta,key:row.object_key})||row.poster_json&&!await mediaPresent(env,JSON.parse(row.poster_json) as Media))throw new RequestFailure('NOT_FOUND',{media:'Un visuel manque. Remplacez-le avant de publier.'});}
 }
 try{await env.DB.batch([
  ...(copiedId?[env.DB.prepare("UPDATE homepage_assets SET state='active' WHERE id=? AND state='staging'").bind(copiedId)]:[]),
  env.DB.prepare(`UPDATE homepage_settings SET revision=?,draft_json=?,published_json=?,published_version=?,published_at=?,updated_at=? WHERE id=1`)
   .bind(action.revision+1,JSON.stringify(draft),action.action==='publish'?JSON.stringify(draft):state.published_json,
    state.published_version+(action.action==='publish'?1:0),action.action==='publish'?at:state.published_at,at),
  env.DB.prepare('INSERT INTO homepage_audit VALUES(?,?,?,?,?,?)').bind(crypto.randomUUID(),actor,action.action,action.revision+1,JSON.stringify(draft),at),
 ]);}catch(cause){if(cause instanceof Error&&cause.message.includes('HOMEPAGE_CONFLICT'))throw new RequestFailure('CONFLICT');throw cause;}
 return readHomepageAdmin(env.DB);
}
function mediaRange(range:string|null,size:number){
 let start=0,end=size-1;
 if(range){const match=/^bytes=(\d*)-(\d*)$/.exec(range);if(!match||!match[1]&&!match[2])return null;
  if(match[1]){start=Number(match[1]);if(match[2])end=Math.min(end,Number(match[2]));}else start=Math.max(0,size-Number(match[2]));
  if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start<0||start>=size||end<start)return null;}
 return {start,end};
}
async function serveMedia(request:Request,env:Env,media:Omit<Media,'mime'>&{mime:Media['mime']|'image/avif'},publicAccess=false,knownHead?:R2Object){
 const head=knownHead??await env.MEDIA.head(media.key);
 if(!head||head.size!==media.sizeBytes||head.customMetadata?.sha256&&head.customMetadata.sha256!==media.sha256)throw new RequestFailure('NOT_FOUND');
 const range=request.headers.get('range'),interval=mediaRange(range,head.size);
 if(!interval)return new Response(null,{status:416,headers:{'Content-Range':`bytes */${head.size}`}});
 const {start,end}=interval;
 const headers={'Content-Type':media.mime,'Content-Length':String(end-start+1),'Accept-Ranges':'bytes','ETag':head.httpEtag,
  'Cache-Control':publicAccess?'public, max-age=60, must-revalidate':'private, no-store',...(range?{'Content-Range':`bytes ${start}-${end}/${head.size}`}:{})};
 if(!range&&request.headers.get('if-none-match')===head.httpEtag)return new Response(null,{status:304,headers});
 if(request.method==='HEAD')return new Response(null,{status:range?206:200,headers});
 const object=await env.MEDIA.get(media.key,{range:{offset:start,length:end-start+1}});if(!object)throw new RequestFailure('NOT_FOUND');
 return new Response(object.body,{status:range?206:200,headers});
}
export async function adminHomepageRequest(request:Request,env:AdminEnv){return respond(async()=>{
 const user=await requireAdmin(request,env);
 if(request.method==='POST'){assertSameOrigin(request,env);return Response.json(await changeHomepage(env,user.id,await boundedJson(request,32768)));}
 if(request.method!=='GET')throw new RequestFailure('FORBIDDEN');
 const params=new URL(request.url).searchParams;if(params.get('section')!=='library'){if(params.size)throw new RequestFailure('VALIDATION_ERROR');return Response.json(await readHomepageAdmin(env.DB));}
 params.delete('section');const input=HomepageQuery.safeParse(Object.fromEntries(params));if(!input.success)throw new RequestFailure('VALIDATION_ERROR');
 try{return Response.json(await readHomepageLibrary(env,input.data));}catch(cause){if(cause instanceof Error&&cause.message==='HOMEPAGE_INVALID_CURSOR')throw new RequestFailure('VALIDATION_ERROR');throw cause;}
});}
export async function homepageMediaRequest(request:Request,env:Env,id:string,admin?:AdminEnv,context?:HomepageCache){
 const acceptsAvif=request.headers.get('accept')?.split(',').some(part=>{
  const [type,...params]=part.trim().toLowerCase().split(';'),quality=params.find(value=>value.trim().startsWith('q='));
  return type.trim()==='image/avif'&&(!quality||Number(quality.trim().slice(2))>0);
 })??false;
 const response=await respond(async()=>{
  if(admin)await requireAdmin(request,admin);
  const [row,state]=await Promise.all([homepageAsset(env.DB,id),homepageSettings(env.DB)]);if(!row||row.state!=='active')throw new RequestFailure('NOT_FOUND');
  const published=HomepageSelections.parse(JSON.parse(state.published_json));
  if(!admin&&!Object.values(published).includes(id))throw new RequestFailure('NOT_FOUND');
  const poster=new URL(request.url).searchParams.get('poster')==='1';
  if(poster&&!row.poster_json)throw new RequestFailure('NOT_FOUND');
  const media:Media=poster?JSON.parse(row.poster_json!):{...homepageStoredMetadata(row),key:row.object_key};
  if(!media.key.startsWith(`homepage/${row.id}/`))throw new RequestFailure('NOT_FOUND');
  const params=new URL(request.url).searchParams,width=params.get('w'),preview=params.get('preview');
  if(!admin&&(width||preview)){
   if(!await mediaPresent(env,media))throw new RequestFailure('NOT_FOUND');
   if(width&&(!['320','640','960'].includes(width)||media.mime==='video/mp4')||preview&&(!['1','540'].includes(preview)||media.mime!=='video/mp4'))throw new RequestFailure('VALIDATION_ERROR');
   const headers=new Headers();for(const name of ['range','if-none-match']){const value=request.headers.get(name);if(value)headers.set(name,value);}
   const format=width&&acceptsAvif?'avif':'webp';
   const entry=context?cacheKey(context,`media/${state.published_version}/${row.id}/${poster?'poster':'main'}/${media.sha256}/${width?`${width}-${format}`:preview}`,headers):null;
   if(entry&&context){try{const hit=await context.cache.match(entry);
    const length=Number(hit?.headers.get('X-Homepage-Media-Length')),range=headers.get('range'),interval=mediaRange(range,length);
    if(hit&&Number.isSafeInteger(length)&&length>0&&length<=Math.min(media.sizeBytes,4*1024*1024)){
     if(!interval){await hit.body?.cancel();return new Response(null,{status:416,headers:{'Content-Range':`bytes */${length}`}});}
     if(!range&&[200,304].includes(hit.status)||range&&hit.status===206&&hit.headers.get('Content-Range')===`bytes ${interval.start}-${interval.end}/${length}`){
      const publicHeaders=new Headers(hit.headers);publicHeaders.delete('X-Homepage-Media-Length');publicHeaders.set('Content-Length',String(interval.end-interval.start+1));
      const result=new Response(request.method==='HEAD'?null:hit.body,{status:hit.status,headers:publicHeaders});
      if(request.method==='HEAD')await hit.body?.cancel();return result;
     }
    }
    await hit?.body?.cancel();
   }catch{/* A cache miss or outage uses the public snapshot. */}}
   const sizes=width?[width]:preview==='540'?['540','720']:['720'];
   const formats=width?(acceptsAvif?['avif','webp'] as const:['webp'] as const):['mp4'] as const;
   for(const extension of formats)for(const size of sizes){const key=`homepage/${row.id}/seo/${media.sha256}-${size}.${extension}`,head=await env.MEDIA.head(key),mime=extension==='mp4'?'video/mp4':extension==='avif'?'image/avif':'image/webp';
    if(head&&head.size>0&&head.size<=media.sizeBytes&&head.httpMetadata?.contentType===mime){
     const result=await serveMedia(request,env,{...media,key,sizeBytes:head.size,mime},true,head);
     // Only complete, bounded derivatives enter the shared cache. A full-file
     // bytes=0- request can populate it; partial ranges and originals cannot.
     if(entry&&context&&request.method==='GET'&&head.size<=4*1024*1024&&
      (result.status===200||result.status===206&&result.headers.get('Content-Range')===`bytes 0-${head.size-1}/${head.size}`)){
      const stored=result.clone(),cacheHeaders=new Headers(stored.headers);cacheHeaders.delete('Content-Range');cacheHeaders.set('Cache-Control','public, max-age=3600');cacheHeaders.set('X-Homepage-Media-Length',String(head.size));
      writeCache(context,new Request(entry.url),new Response(stored.body,{headers:cacheHeaders}));
     }
     return result;
    }
   }
  }
  return serveMedia(request,env,media,!admin);
 });
 if(!admin&&[200,206,304].includes(response.status)){
  response.headers.set('Cache-Control','public, max-age=60, must-revalidate');
  if(new URL(request.url).searchParams.has('w'))response.headers.set('Vary','Accept');
 }return response;
}
// The small public hero poster travels with the initial mobile HTML. Reuse the
// public media handler so publication, revocation and snapshot checks stay the
// same as for a normal image request. Never inline originals or private previews.
export async function readHomepageHeroPoster(env:Env,config:HomepageConfig,context?:HomepageCache):Promise<string|null>{
 const visual=resolveHomeMedia(config,'hero.visual'),source=visual.kind==='image'?visual.src:visual.poster??resolveHomeMedia(config,'hero.video').poster;
 const match=source&&/^\/api\/homepage\/media\/([a-f0-9-]{36})(\?poster=1)?$/.exec(source);
 if(!match)return null;
 try{
  const url=new URL(source!,context?.origin??'https://bienvu.online');url.searchParams.set('w','640');
  const response=await homepageMediaRequest(new Request(url,{headers:{Accept:'image/avif,image/webp'}}),env,match[1]!,undefined,context);
  const mime=response.headers.get('Content-Type'),length=Number(response.headers.get('Content-Length'));
  if(response.status!==200||!['image/avif','image/webp'].includes(mime??'')||!Number.isSafeInteger(length)||length<1||length>48000){await response.body?.cancel();return null;}
  const bytes=new Uint8Array(await response.arrayBuffer());if(bytes.length!==length)return null;
  return `data:${mime};base64,${btoa(String.fromCharCode(...bytes))}`;
 }catch{return null;}
}
export async function adminHomepageSourceRequest(request:Request,env:AdminEnv,kind:string,id:string){return respond(async()=>{
 await requireAdmin(request,env);const ref=HomepageSource.safeParse({kind,id});if(!ref.success)throw new RequestFailure('NOT_FOUND');
 const row=await homepageSource(env.DB,ref.data);if(!row)throw new RequestFailure('NOT_FOUND');
 const poster=new URL(request.url).searchParams.get('poster')==='1';if(poster&&!row.poster)throw new RequestFailure('NOT_FOUND');
 return serveMedia(request,env,poster?photoMedia(row.poster!,row.agencyId):sourceMedia(row));
});}
export async function cleanupHomepageAssets(env:Env,now=Date.now()){
 const cutoff=new Date(now-86400_000).toISOString(),refs=`NOT EXISTS(SELECT 1 FROM homepage_settings s,json_each(s.draft_json) r WHERE r.value=a.id)
  AND NOT EXISTS(SELECT 1 FROM homepage_settings s,json_each(s.published_json) r WHERE r.value=a.id)`;
 const candidates=(await env.DB.prepare(`SELECT a.* FROM homepage_assets a WHERE created_at<? AND ${refs} ORDER BY created_at LIMIT 12`).bind(cutoff).all<HomepageAssetRow>()).results;
 let removed=0;for(const row of candidates){
  const claim=await env.DB.prepare(`UPDATE homepage_assets AS a SET state='deleting' WHERE id=? AND ${refs} RETURNING id`).bind(row.id).first();if(!claim)continue;
  const media:Media={...homepageStoredMetadata(row),key:row.object_key},poster=row.poster_json?JSON.parse(row.poster_json) as Media:null;
  const variants=(item:Media)=>item.mime==='video/mp4'?[540,720].map(width=>`homepage/${row.id}/seo/${item.sha256}-${width}.mp4`):[320,640,960].flatMap(width=>['webp','avif'].map(format=>`homepage/${row.id}/seo/${item.sha256}-${width}.${format}`));
  const keys=[row.object_key,...variants(media),...(poster?[poster.key,...variants(poster)]:[])];
  if(keys.some(key=>!key.startsWith(`homepage/${row.id}/`)))throw Error('HOMEPAGE_SCOPE_INVALID');
  await env.MEDIA.delete(keys);await env.DB.prepare("DELETE FROM homepage_assets WHERE id=? AND state='deleting'").bind(row.id).run();removed++;
 }return {removed};
}
export async function publicHomepageManifest(db:Database){
 const state=await homepageSettings(db),config=await readHomepageConfig(db),rows=await homepageSelectedAssets(db,HomepageSelections.parse(JSON.parse(state.published_json)));
 return {version:config.version,publishedAt:state.published_at,assets:rows.map(row=>{const asset=assetView(row),poster=row.poster_json?JSON.parse(row.poster_json) as Media:null;
  return {id:asset.id,url:asset.url,mime:asset.mime,sha256:asset.sha256,sizeBytes:asset.sizeBytes,width:asset.width,height:asset.height,
   poster:poster?{url:asset.posterUrl!,mime:poster.mime,sha256:poster.sha256,sizeBytes:poster.sizeBytes,width:poster.width,height:poster.height}:null};})};
}
