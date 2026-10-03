import {z} from 'zod';
import {EntityId,MusicMetadata,LibraryMusic,MusicLibraryPage,VideoAsset,MUSIC_LIMITS,audioNormalizationGain} from '@bienvu/contracts';
import {findCreationDraft,type Database} from '@bienvu/db';
import {measureMusicWav} from '../../../packages/voice/src/audio';
import {contentHash} from './manual-listings';
import {putEditorMusic} from './video-editor';
import {RequestFailure,respond,assertSameOrigin,boundedBytes,boundedJson} from './http';
import {requireAdmin} from './admin-access';
import type {AuthEnvironment} from './auth';

type Env={DB:Database;MEDIA:Pick<R2Bucket,'get'|'head'|'put'|'delete'>};
// Separate namespace: tenant VideoAsset/ObjectKey rules stay restricted to agencies.
const LibraryAsset=VideoAsset.safeExtend({objectKey:z.string().regex(/^library\/music\/[a-zA-Z0-9_-]+-[a-f0-9]{64}\.wav$/),
  mime:z.literal('audio/wav'),durationMs:z.number().int().min(500).max(MUSIC_LIMITS.durationMs)});
type Row={id:string;name:string;description:string;license:string;asset_json:string;waveform_json:string;active:number;revision:number;created_at:string;object_key:string};
const view=(row:Row)=>LibraryMusic.parse({id:row.id,name:row.name,description:row.description,license:row.license,
  durationMs:LibraryAsset.parse(JSON.parse(row.asset_json)).durationMs,waveform:JSON.parse(row.waveform_json),
  active:row.active===1,revision:row.revision,createdAt:row.created_at});
const validId=(id:string)=>{if(!EntityId.safeParse(id).success)throw new RequestFailure('NOT_FOUND');};
export async function findLibraryMusic(env:Env,id:string,includeHidden=false){
  validId(id);const row=await env.DB.prepare('SELECT * FROM music_library WHERE id=? AND (?=1 OR active=1)').bind(id,includeHidden?1:0).first<Row>();
  if(!row)throw new RequestFailure('NOT_FOUND');return row;
}
export async function listLibraryMusic(env:Env,params:URLSearchParams,includeHidden=false){
  const query=z.object({q:z.string().max(100).default(''),cursor:EntityId.optional()}).strict().safeParse(Object.fromEntries(params));
  if(!query.success)throw new RequestFailure('VALIDATION_ERROR');const {q,cursor}=query.data;
  const found=await env.DB.prepare(`SELECT json_group_array(json_object('id',id,'name',name,'description',description,'license',license,
    'asset_json',asset_json,'waveform_json',waveform_json,'active',active,'revision',revision,'created_at',created_at)) AS items FROM
    (SELECT * FROM music_library WHERE (?=1 OR active=1) AND (instr(lower(name),lower(?))>0 OR instr(lower(description),lower(?))>0)
    AND (? IS NULL OR (created_at,id)<(SELECT created_at,id FROM music_library WHERE id=?)) ORDER BY created_at DESC,id DESC LIMIT 31)`)
    .bind(includeHidden?1:0,q,q,cursor??null,cursor??null).first<{items:string}>();
  const rows=JSON.parse(found?.items??'[]') as Row[],items=rows.slice(0,30).map(view);
  return MusicLibraryPage.parse({items,nextCursor:rows.length>30?items.at(-1)!.id:null});
}
export async function uploadLibraryMusic(env:Env,actorId:string,id:string,metadata:unknown,bytes:Uint8Array){
  validId(id);const input=MusicMetadata.safeParse(metadata);if(!input.success)throw new RequestFailure('VALIDATION_ERROR');
  if(bytes.byteLength>MUSIC_LIMITS.bytes)throw new RequestFailure('FILE_TOO_LARGE');
  let metrics:ReturnType<typeof measureMusicWav>;
  try{metrics=measureMusicWav(bytes);}catch{throw new RequestFailure('VALIDATION_ERROR',{music:'Choisissez une piste audio non silencieuse de 0,5 seconde à 5 minutes.'});}
  const sha256=await contentHash(new Uint8Array(bytes)),key=`library/music/${id}-${sha256}.wav`,at=new Date().toISOString(),
    asset=LibraryAsset.parse({id,objectKey:key,sha256,sizeBytes:bytes.byteLength,mime:'audio/wav',durationMs:metrics.durationMs,
      normalizationGain:audioNormalizationGain(metrics.rmsDbfs,metrics.peak,-24)}),
    previous=await env.DB.prepare('SELECT * FROM music_library WHERE id=?').bind(id).first<Row>();
  if(previous){if(previous.asset_json!==JSON.stringify(asset))throw new RequestFailure('CONFLICT');
    const existing=await env.MEDIA.head(key);if(existing?.size===asset.sizeBytes&&existing.customMetadata?.sha256===sha256)return view(previous);}
  await env.MEDIA.put(key,bytes,{httpMetadata:{contentType:'audio/wav',cacheControl:'private, no-store'},customMetadata:{sha256}});
  try{
    await env.DB.prepare(`INSERT INTO music_library(id,name,description,license,asset_json,waveform_json,object_key,created_at,updated_at,updated_by)
      VALUES(?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO NOTHING`).bind(id,input.data.name,input.data.description,input.data.license,
      JSON.stringify(asset),JSON.stringify(metrics.waveform),key,at,at,actorId).run();
    const row=await findLibraryMusic(env,id,true);if(row.asset_json!==JSON.stringify(asset))throw new RequestFailure('CONFLICT');return view(row);
  }catch(cause){const current=await env.DB.prepare('SELECT object_key AS key FROM music_library WHERE id=?').bind(id).first<{key:string}>();
    if(current?.key!==key)await env.MEDIA.delete(key);throw cause;}
}
export async function updateLibraryMusic(env:Env,actorId:string,id:string,body:unknown){
  validId(id);const input=MusicMetadata.extend({revision:z.number().int().positive(),active:z.boolean()}).strict().safeParse(body);
  if(!input.success)throw new RequestFailure('VALIDATION_ERROR');const {name,description,license,active,revision}=input.data;
  const row=await env.DB.prepare(`UPDATE music_library SET name=?,description=?,license=?,active=?,revision=revision+1,updated_at=?,updated_by=?
    WHERE id=? AND revision=? RETURNING *`).bind(name,description,license,active?1:0,new Date().toISOString(),actorId,id,revision).first<Row>();
  if(!row)throw new RequestFailure('CONFLICT');return view(row);
}
export async function libraryMusicAudio(env:Env,id:string,request:Request,includeHidden=false){
  const row=await findLibraryMusic(env,id,includeHidden),asset=LibraryAsset.parse(JSON.parse(row.asset_json));
  if(asset.objectKey!==`library/music/${row.id}-${asset.sha256}.wav`||row.object_key!==asset.objectKey)throw new RequestFailure('NOT_FOUND');
  const head=await env.MEDIA.head(asset.objectKey);
  if(!head||head.size!==asset.sizeBytes||head.customMetadata?.sha256!==asset.sha256)throw new RequestFailure('NOT_FOUND');
  let offset=0,length=head.size;const range=request.headers.get('range');
  const headers=new Headers({'Content-Type':'audio/wav','Content-Length':String(head.size),'Accept-Ranges':'bytes'});
  if(range){const match=/^bytes=(\d*)-(\d*)$/.exec(range);
    if(!match||!match[1]&&!match[2])return new Response(null,{status:416,headers:{'Content-Range':`bytes */${head.size}`}});
    offset=match[1]?Number(match[1]):Math.max(0,head.size-Number(match[2]));
    const end=match[1]&&match[2]?Math.min(head.size-1,Number(match[2])):head.size-1;length=end-offset+1;
    if(!Number.isSafeInteger(offset)||!Number.isSafeInteger(length)||offset<0||offset>=head.size||length<=0)
      return new Response(null,{status:416,headers:{'Content-Range':`bytes */${head.size}`}});
    headers.set('Content-Length',String(length));headers.set('Content-Range',`bytes ${offset}-${offset+length-1}/${head.size}`);}
  const object=await env.MEDIA.get(asset.objectKey,{range:{offset,length}});
  if(!object||!('body' in object))throw new RequestFailure('NOT_FOUND');
  return new Response(object.body,{status:range?206:200,headers});
}
export async function attachLibraryMusic(env:Env,agencyId:string,importId:string,id:string){
  const draft=await findCreationDraft(env.DB,agencyId,importId);
  if(!draft||draft.expiresAt<=new Date().toISOString())throw new RequestFailure('NOT_FOUND');
  const row=await findLibraryMusic(env,id),asset=LibraryAsset.parse(JSON.parse(row.asset_json));
  if(asset.objectKey!==`library/music/${id}-${asset.sha256}.wav`)throw new RequestFailure('NOT_FOUND');
  const object=await env.MEDIA.get(asset.objectKey);
  if(!object||object.size!==asset.sizeBytes||object.size>MUSIC_LIMITS.bytes)throw new RequestFailure('NOT_FOUND');
  const bytes=new Uint8Array(await object.arrayBuffer());if(await contentHash(bytes)!==asset.sha256)throw new RequestFailure('NOT_FOUND');
  // Idempotent attachment, isolated from the library and from every other agency.
  const assetId=(await contentHash(new TextEncoder().encode(`${agencyId}:${importId}:library:${id}:${asset.sha256}`))).slice(0,32);
  return {...await putEditorMusic(env,agencyId,importId,assetId,bytes),name:row.name};
}
export async function adminMusicRequest(request:Request,env:Env&AuthEnvironment&{SUPER_ADMIN_EMAIL?:string},id?:string,audio=false){
  return respond(async()=>{
    const user=await requireAdmin(request,env);
    if(request.method==='GET')return audio&&id?libraryMusicAudio(env,id,request,true):Response.json(await listLibraryMusic(env,new URL(request.url).searchParams,true));
    assertSameOrigin(request,env);if(!id)throw new RequestFailure('NOT_FOUND');validId(id);
    if(request.method==='PUT'&&audio){
      if(request.headers.get('content-type')?.split(';')[0]!=='audio/wav')throw new RequestFailure('VALIDATION_ERROR');
      let metadata:unknown;try{const raw=request.headers.get('x-music-metadata');if(!raw||raw.length>6000)throw Error();metadata=JSON.parse(decodeURIComponent(raw));}catch{throw new RequestFailure('VALIDATION_ERROR');}
      return Response.json(await uploadLibraryMusic(env,user.id,id,metadata,await boundedBytes(request,MUSIC_LIMITS.bytes)),{status:201});}
    if(request.method==='PATCH'&&!audio)return Response.json(await updateLibraryMusic(env,user.id,id,await boundedJson(request,6000)));
    throw new RequestFailure('VALIDATION_ERROR');
  });
}
