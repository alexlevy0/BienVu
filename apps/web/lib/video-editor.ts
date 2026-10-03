import {CreationDraftData,EditorDocument,GenerationRequest,GeneratableListing,VideoAsset,VideoManifest,defaultVideoCustomization,createEditorDocument,selectedAnimationIndices,audioNormalizationGain,generationCreditCost,
  MUSIC_LIMITS,type CreationDraftView,type VideoCustomization} from '@bienvu/contracts';
import {findCreationDraft,findImport,draftFromListing,updateCreationDraft,beginManualImport,startCreationDraft,blankCreationDraft,retainedAnimations,ImportStateFailure,type Database} from '@bienvu/db';
import {measureMusicWav} from '../../../packages/voice/src/audio';
import {contentHash} from './manual-listings';
import {startManualCreationDraft,uploadCreationPhoto,finishCreationDraft} from './creation-drafts';
import {ownGeneration} from './generations';
import {RequestFailure} from './http';
import {restoreVideoVoice,copyEditorVoice} from './editor-voice';
import {editorMediaSourcesKey} from './editor-client';

type Env={DB:Database;MEDIA:Pick<R2Bucket,'put'|'head'|'get'|'delete'>};
export async function editorResources(db:Database,agencyId:string,id:string){
  const draft=await findCreationDraft(db,agencyId,id);if(!draft)throw new RequestFailure('NOT_FOUND');
  const settings=draft.data.videoCustomization,order=settings?.photoOrder??draft.photos.map(p=>p.sourceOrder),
    selected=new Set(selectedAnimationIndices(order,settings).map(index=>order[index]));
  // Discover the retained files even if an older editor copy lost its selection.
  // Only selected animations count towards reuse pricing and the current preview.
  const available=await retainedAnimations(db,agencyId,{agencyId,photos:draft.photos},
    {...defaultVideoCustomization(),photoOrder:draft.photos.map(p=>p.sourceOrder),runwayPhotos:draft.photos.map(p=>p.sourceOrder)},settings?.editor?.aspectRatio??'9:16');
  const availableAnimations=available.map(reuse=>({slot:draft.photos[reuse.index].sourceOrder,url:`/api/animations/${reuse.libraryId}`})),
    animations=availableAnimations.filter(a=>selected.has(a.slot));
  return {version:draft.version,sourceKey:editorMediaSourcesKey(settings??defaultVideoCustomization(),draft.photos),cost:generationCreditCost(settings)-animations.length,animations,availableAnimations};
}
export async function putEditorMusic(env:Env,agencyId:string,importId:string,id:string,bytes:Uint8Array){
  const draft=await findCreationDraft(env.DB,agencyId,importId);
  if(!draft||draft.expiresAt<=new Date().toISOString())throw new RequestFailure('NOT_FOUND');
  if(!/^[a-zA-Z0-9_-]{16,64}$/.test(id)||bytes.length>MUSIC_LIMITS.bytes)throw new RequestFailure('VALIDATION_ERROR');
  if(draft.photos.some(photo=>photo.id===id))throw new RequestFailure('CONFLICT');
  let durationMs:number,normalizationGain:number,waveform:number[];
  try{const metrics=measureMusicWav(bytes);durationMs=metrics.durationMs;waveform=metrics.waveform;normalizationGain=audioNormalizationGain(metrics.rmsDbfs,metrics.peak,-24);}catch{throw new RequestFailure('VALIDATION_ERROR',{music:'Utilisez une piste audio non silencieuse de 0,5 seconde à 5 minutes.'});}
  if(durationMs<500)throw new RequestFailure('VALIDATION_ERROR');
  const sha256=await contentHash(new Uint8Array(bytes)),asset=VideoAsset.parse({id,objectKey:`agencies/${agencyId}/imports/${importId}/music/${id}-${sha256}.wav`,
    sha256,sizeBytes:bytes.length,mime:'audio/wav',durationMs,normalizationGain});
  const previous=await env.DB.prepare('SELECT asset_json AS asset FROM editor_music_assets WHERE id=? AND agency_id=? AND import_id=?').bind(id,agencyId,importId).first<{asset:string}>();
  if(previous&&JSON.parse(previous.asset).sha256!==sha256)throw new RequestFailure('CONFLICT');
  const inserted=await env.DB.prepare(`INSERT INTO editor_music_assets(id,agency_id,import_id,asset_json,object_key,created_at)
    SELECT ?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM creation_drafts WHERE id=? AND agency_id=? AND state='needs_input')
    AND (SELECT count(*) FROM editor_music_assets WHERE agency_id=? AND import_id=?)<12
    ON CONFLICT(id) DO NOTHING RETURNING id`).bind(id,agencyId,importId,JSON.stringify(asset),asset.objectKey,new Date().toISOString(),importId,agencyId,agencyId,importId).first();
  if(!inserted&&!previous)throw new RequestFailure('CONFLICT');
  await env.MEDIA.put(asset.objectKey,bytes,{httpMetadata:{contentType:'audio/wav',cacheControl:'private, no-store'},customMetadata:{agencyId,importId,sha256}});
  const after=await findCreationDraft(env.DB,agencyId,importId);
  if(!after||after.expiresAt<=new Date().toISOString()){await env.MEDIA.delete(asset.objectKey);throw new RequestFailure('CONFLICT');}
  return {assetId:id,durationMs,normalizationGain,waveform};
}
export async function privateEditorMusic(env:Env,agencyId:string,importId:string,id:string,request:Request){
  const row=await findImport(env.DB,agencyId,importId);
  if(!row||row.status==='deleting'||row.expiresAt<=new Date().toISOString())throw new RequestFailure('NOT_FOUND');
  const stored=await env.DB.prepare('SELECT asset_json AS asset FROM editor_music_assets WHERE agency_id=? AND import_id=? AND id=?').bind(agencyId,importId,id).first<{asset:string}>();
  if(!stored)throw new RequestFailure('NOT_FOUND');
  const asset=VideoAsset.parse(JSON.parse(stored.asset));
  if(!asset.objectKey.startsWith(`agencies/${agencyId}/imports/${importId}/music/`))throw new RequestFailure('NOT_FOUND');
  const head=await env.MEDIA.head(asset.objectKey);
  if(!head||head.size!==asset.sizeBytes||head.customMetadata?.sha256!==asset.sha256)throw new RequestFailure('NOT_FOUND');
  if(new URL(request.url).searchParams.get('metadata')==='1'){
    if(head.size>MUSIC_LIMITS.bytes)throw new RequestFailure('NOT_FOUND');
    const object=await env.MEDIA.get(asset.objectKey);if(!object)throw new RequestFailure('NOT_FOUND');
    const bytes=new Uint8Array(await object.arrayBuffer());if(await contentHash(bytes)!==asset.sha256)throw new RequestFailure('NOT_FOUND');
    const metrics=measureMusicWav(bytes);
    return Response.json({assetId:id,durationMs:metrics.durationMs,waveform:metrics.waveform,normalizationGain:asset.normalizationGain??audioNormalizationGain(metrics.rmsDbfs,metrics.peak,-24)});
  }
  const headers=new Headers({'Content-Type':'audio/wav','Content-Length':String(head.size),'Accept-Ranges':'bytes'});
  const range=request.headers.get('range');let offset=0,length=head.size;
  if(range){const match=/^bytes=(\d*)-(\d*)$/.exec(range);const end=match?.[1]&&match[2]?Math.min(head.size-1,Number(match[2])):head.size-1;
    offset=match?.[1]?Number(match[1]):match?.[2]?Math.max(0,head.size-Number(match[2])):head.size;
    length=end-offset+1;
    if(!Number.isSafeInteger(offset)||!Number.isSafeInteger(length)||offset>=head.size||offset<0||length<=0)
      return new Response(null,{status:416,headers:{'Content-Range':`bytes */${head.size}`}});
    headers.set('Content-Length',String(length));headers.set('Content-Range',`bytes ${offset}-${offset+length-1}/${head.size}`);
  }
  const object=await env.MEDIA.get(asset.objectKey,{range:{offset,length}});if(!object||!('body' in object))throw new RequestFailure('NOT_FOUND');
  return new Response(object.body,{status:range?206:200,headers});
}
async function copyPhoto(env:Env,agencyId:string,draft:CreationDraftView,photo:VideoAsset,slot:number,sourcePrefix:string,signal:AbortSignal){
  signal.throwIfAborted();
  if(!photo.objectKey.startsWith(sourcePrefix)||!photo.width||!photo.height||!photo.mime.startsWith('image/'))throw new RequestFailure('NOT_FOUND');
  const object=await env.MEDIA.get(photo.objectKey);if(!object||object.size!==photo.sizeBytes)throw new RequestFailure('INSUFFICIENT_PHOTOS');
  const bytes=new Uint8Array(await object.arrayBuffer());if(await contentHash(bytes)!==photo.sha256)throw new RequestFailure('INSUFFICIENT_PHOTOS');
  const uploadId=(await contentHash(new TextEncoder().encode(`${draft.id}:${photo.id}`))).slice(0,32);
  await uploadCreationPhoto(env,agencyId,draft.id,slot,uploadId,bytes,photo.mime,async()=>({bytes,width:photo.width!,height:photo.height!,mime:photo.mime as 'image/jpeg'|'image/png'|'image/webp'}),signal);
}
async function copyMusic(env:Env,agencyId:string,draftId:string,asset:VideoAsset,sourcePrefix:string){
  if(!asset.objectKey.startsWith(sourcePrefix))throw new RequestFailure('NOT_FOUND');
  const object=await env.MEDIA.get(asset.objectKey);
  if(!object||object.size!==asset.sizeBytes)throw new RequestFailure('NOT_FOUND');
  const bytes=new Uint8Array(await object.arrayBuffer());if(await contentHash(bytes)!==asset.sha256)throw new RequestFailure('NOT_FOUND');
  const id=(await contentHash(new TextEncoder().encode(`${draftId}:${asset.id}`))).slice(0,32);
  return putEditorMusic(env,agencyId,draftId,id,bytes);
}
async function retainOriginalAnimations(env:Env,agencyId:string,m:VideoManifest,signal:AbortSignal){
  for(const clip of m.photoAnimations??[]){
    signal.throwIfAborted();const asset=clip.asset;
    if(!asset.objectKey.startsWith(`agencies/${m.agencyId}/jobs/${m.jobId}/animations/`))throw new RequestFailure('NOT_FOUND');
    const existing=await env.DB.prepare("SELECT 1 FROM animation_library WHERE agency_id=? AND source_sha256=? AND aspect_ratio=? AND mode='real' AND expires_at>?").bind(agencyId,clip.sourceSha256,m.width===1920?'16:9':'9:16',new Date().toISOString()).first();if(existing)continue;
    const real=await env.DB.prepare("SELECT 1 FROM photo_animations WHERE job_id=? AND photo_id=? AND mode='real' AND state='ready'").bind(m.jobId,clip.photoAssetId).first();if(!real)continue;
    const object=await env.MEDIA.get(asset.objectKey);if(!object||object.size!==asset.sizeBytes)throw new RequestFailure('NOT_FOUND');const bytes=new Uint8Array(await object.arrayBuffer());
    if(await contentHash(bytes)!==asset.sha256)throw new RequestFailure('NOT_FOUND');const objectKey=`agencies/${agencyId}/imports/animation-library/${asset.sha256}.mp4`,at=new Date().toISOString();
    await env.MEDIA.put(objectKey,bytes,{httpMetadata:{contentType:'video/mp4'},customMetadata:{sha256:asset.sha256,sourceSha256:clip.sourceSha256}});
    await env.DB.prepare("INSERT INTO animation_library(id,agency_id,source_sha256,aspect_ratio,model,mode,origin_job_id,asset_json,created_at,expires_at) VALUES(?,?,?,?,'gen4_turbo','real',?,?,?,?) ON CONFLICT(agency_id,source_sha256,aspect_ratio,model,mode) DO UPDATE SET asset_json=excluded.asset_json,expires_at=excluded.expires_at WHERE animation_library.state='available'")
      .bind(crypto.randomUUID(),agencyId,clip.sourceSha256,m.width===1920?'16:9':'9:16',m.jobId,JSON.stringify({...asset,objectKey}),at,new Date(Date.now()+90*86400_000).toISOString()).run();
  }
}
export async function editExistingVideo(env:Env,agencyId:string,jobId:string,key:string,signal:AbortSignal){
  const job=await ownGeneration(env,agencyId,jobId);
  if(job.status!=='ready'||job.retention!=='available'||job.expiresAt<=new Date().toISOString())throw new RequestFailure('NOT_FOUND');
  const stored=await env.DB.prepare("SELECT manifest_json AS manifest FROM video_manifests WHERE agency_id=? AND job_id=? AND state='prepared'")
    .bind(job.agencyId,jobId).first<{manifest:string}>();
  if(!stored)throw new RequestFailure('NOT_FOUND');
  const m=VideoManifest.parse(JSON.parse(stored.manifest)),input=GenerationRequest.parse(JSON.parse(job.input));
  if(m.jobId!==jobId||m.agencyId!==job.agencyId)throw new RequestFailure('NOT_FOUND');
  await retainOriginalAnimations(env,agencyId,m,signal);
  let draft=await startManualCreationDraft(env.DB,agencyId,key,`Version de la vidéo ${jobId}`);
  const seconds=([20,30,40] as const).find(s=>s*30>=m.scenes.reduce((n,scene)=>n+scene.durationFrames,0))??40;
  const sourceVoice=input.customization?.voice??'fr-FR-Chirp3-HD-Aoede';
  if(draft.data.videoCustomization?.editor){
    if(draft.data.videoCustomization.voiceSourceId||!m.audio.length)return draft;
    const voiceSourceId=await restoreVideoVoice(env,agencyId,draft.id,m,sourceVoice,seconds,signal);
    const settings={...draft.data.videoCustomization,voiceSourceId,narration:draft.data.videoCustomization.narration??m.scenes.map(s=>s.narrationText)};
    if(await updateCreationDraft(env.DB,agencyId,draft.id,draft.version,{...draft.data,videoCustomization:settings})===null)throw new RequestFailure('CONFLICT');
    return (await findCreationDraft(env.DB,agencyId,draft.id))!;
  }
  const original=m.listingId?await findImport(env.DB,job.agencyId,m.listingId):null;
  const data=original?.result?draftFromListing(GeneratableListing.parse(JSON.parse(original.result))):CreationDraftData.parse({...draft.data,
    fields:{...draft.data.fields,title:m.presentation?.title??job.title,locality:m.presentation?.locality??job.locality,transaction:m.presentation?.transaction??'sale',
      propertyType:m.presentation?.propertyType??'other',priceCents:m.presentation?.priceCents??null,area:m.presentation?.areaM2??null,rooms:m.presentation?.rooms??null,description:null}});
  for(const [slot,photo] of m.photos.entries())await copyPhoto(env,agencyId,draft,photo,slot,`agencies/${job.agencyId}/jobs/${jobId}/`,signal);
  const old=input.customization,oldOrder=old?.photoOrder??m.photos.map((_,i)=>i);
  const remap=(slot:number)=>oldOrder.indexOf(slot);
  const editor=old?.editor?EditorDocument.parse({...old.editor,clips:old.editor.clips.map(c=>({...c,photoSlot:remap(c.photoSlot)})),music:null}):
    createEditorDocument(m.photos.map((_,sourceOrder)=>({sourceOrder})),data.fields,{durationSeconds:seconds,aspectRatio:input.aspectRatio,
      voiceEnabled:input.voiceEnabled,subtitlesEnabled:input.subtitlesEnabled,agencyName:m.brand.name,logo:Boolean(m.logo)});
  if(m.music&&old?.editor?.music){const music=await copyMusic(env,agencyId,draft.id,m.music.asset,`agencies/${job.agencyId}/jobs/${jobId}/`);
    editor.music={...old.editor.music,...music};}
  const voiceSourceId=await restoreVideoVoice(env,agencyId,draft.id,m,sourceVoice,seconds,signal);
  const settings:VideoCustomization={...defaultVideoCustomization(m.brand),...old,editor,voice:sourceVoice,voiceSourceId,
    ...(voiceSourceId?{narration:m.scenes.map(s=>s.narrationText)}:{}),photoOrder:[...new Set(editor.clips.map(c=>c.photoSlot))],
    runwayClips:undefined,runwayPhotos:m.photoAnimations?.length?m.photos.flatMap((photo,slot)=>
      m.photoAnimations!.some(clip=>clip.photoAssetId===photo.id&&clip.sourceSha256===photo.sha256)?[slot]:[]):
      old?.runwayPhotos?.map(remap).filter(slot=>slot>=0)??selectedAnimationIndices(oldOrder,old)};
  draft=(await findCreationDraft(env.DB,agencyId,draft.id))!;
  if(await updateCreationDraft(env.DB,agencyId,draft.id,draft.version,{...data,videoCustomization:settings})===null)throw new RequestFailure('CONFLICT');
  return (await findCreationDraft(env.DB,agencyId,draft.id))!;
}
// Old editor copies recorded a hash of their origin before voice recovery existed.
// Match only retained jobs of this owner; keep every existing visual edit intact.
export async function recoverDraftVoice(env:Env,agencyId:string,id:string,signal:AbortSignal){
  const draft=await findCreationDraft(env.DB,agencyId,id);if(!draft)throw new RequestFailure('NOT_FOUND');
  if(!draft.data.videoCustomization?.editor||draft.data.videoCustomization.voiceSourceId)return draft;
  const row=await findImport(env.DB,agencyId,id),sourceHash=row?.input?JSON.parse(row.input).sourceHash:null;
  if(typeof sourceHash!=='string')return draft;
  const jobs=await env.DB.prepare("SELECT json_group_array(json_object('id',id,'input',input)) AS items FROM (SELECT j.id,g.input_json AS input FROM jobs j JOIN generation_runs g ON g.job_id=j.id AND g.agency_id=j.agency_id WHERE g.owner_agency_id=? AND j.status='ready' AND g.retention='available' AND g.expires_at>? ORDER BY j.created_at DESC LIMIT 500)")
    .bind(agencyId,new Date().toISOString()).first<{items:string}>();
  for(const job of JSON.parse(jobs?.items??'[]') as {id:string;input:string}[]){signal.throwIfAborted();
    if(await contentHash(new TextEncoder().encode(`Version de la vidéo ${job.id}`))!==sourceHash)continue;
    const owned=await ownGeneration(env,agencyId,job.id);
    const stored=await env.DB.prepare("SELECT manifest_json AS manifest FROM video_manifests WHERE agency_id=? AND job_id=? AND state='prepared'").bind(owned.agencyId,job.id).first<{manifest:string}>();
    if(!stored)return draft;const m=VideoManifest.parse(JSON.parse(stored.manifest));
    if(m.agencyId!==owned.agencyId||m.jobId!==job.id)throw new RequestFailure('NOT_FOUND');
    const voice=GenerationRequest.parse(JSON.parse(job.input)).customization?.voice??'fr-FR-Chirp3-HD-Aoede',seconds=([20,30,40] as const).find(s=>s*30>=m.scenes.reduce((n,scene)=>n+scene.durationFrames,0))??40;
    const voiceSourceId=await restoreVideoVoice(env,agencyId,id,m,voice,seconds,signal);if(!voiceSourceId)return draft;
    const current=(await findCreationDraft(env.DB,agencyId,id))!;
    const settings={...current.data.videoCustomization!,voiceSourceId,narration:current.data.videoCustomization!.narration??m.scenes.map(s=>s.narrationText)};
    if(await updateCreationDraft(env.DB,agencyId,id,current.version,{...current.data,videoCustomization:settings})===null)throw new RequestFailure('CONFLICT');
    return (await findCreationDraft(env.DB,agencyId,id))!;
  }
  return draft;
}
// Freeze a copy for export. The editable project remains a draft, and another
// export gets its own immutable import and job; the original MP4 is preserved.
export async function snapshotEditorExport(env:Env,agencyId:string,id:string,version:number,key:string,signal:AbortSignal){
  const previous=await env.DB.prepare('SELECT id FROM listing_imports WHERE agency_id=? AND idempotency_key=?').bind(agencyId,key).first<{id:string}>();
  if(previous){const row=await findImport(env.DB,agencyId,previous.id);
    if(row?.status==='ready'&&row.draftData){const settings=CreationDraftData.parse(JSON.parse(row.draftData)).videoCustomization;
      if(settings?.editor&&row.input&&JSON.parse(row.input).editorSource===id&&JSON.parse(row.input).editorVersion===version)return exportInput(row.id,settings);}
  }
  const source=await findCreationDraft(env.DB,agencyId,id);
  if(!source||source.expiresAt<=new Date().toISOString())throw new RequestFailure('NOT_FOUND');
  if(source.version!==version)throw new RequestFailure('CONFLICT');
  const settings=source.data.videoCustomization;
  if(!settings?.editor)throw new RequestFailure('VALIDATION_ERROR');
  // The semantic hash is checked by the normal import idempotency journal.
  const body=JSON.stringify({editorSource:id,editorVersion:version}),hash=await contentHash(new TextEncoder().encode(body));
  const started=await beginManualImport(env.DB,agencyId,key,body,hash).catch(error=>{
    if(error instanceof ImportStateFailure)throw new RequestFailure(error.code);throw error;});
  await startCreationDraft(env.DB,agencyId,started.row.id,blankCreationDraft());
  let draft=(await findCreationDraft(env.DB,agencyId,started.row.id))!;
  if(!draft)throw new RequestFailure('CONFLICT');
  for(const photo of source.photos)await copyPhoto(env,agencyId,draft,VideoAsset.parse({id:photo.id,objectKey:photo.objectKey,sha256:photo.contentHash,
    sizeBytes:photo.sizeBytes,mime:photo.mime,width:photo.width,height:photo.height}),photo.sourceOrder,`agencies/${agencyId}/imports/${id}/`,signal);
  let music=settings.editor.music;
  if(music){const stored=await env.DB.prepare('SELECT asset_json AS asset FROM editor_music_assets WHERE agency_id=? AND import_id=? AND id=?')
    .bind(agencyId,id,music.assetId).first<{asset:string}>();
    if(!stored)throw new RequestFailure('NOT_FOUND');music={...music,...await copyMusic(env,agencyId,draft.id,VideoAsset.parse(JSON.parse(stored.asset)),`agencies/${agencyId}/imports/${id}/`)};
  }
  const voiceSourceId=settings.voiceSourceId?await copyEditorVoice(env,agencyId,id,draft.id,settings.voiceSourceId,signal):undefined;
  const frozen={...settings,editor:{...settings.editor,music},...(voiceSourceId?{voiceSourceId}:{})};
  draft=(await findCreationDraft(env.DB,agencyId,draft.id))!;
  const data=CreationDraftData.parse({...source.data,provenance:Object.fromEntries(Object.entries(source.data.provenance).map(([key,value])=>[key,{...value,confirm:false}])),videoCustomization:frozen});
  if(await updateCreationDraft(env.DB,agencyId,draft.id,draft.version,data)===null)throw new RequestFailure('CONFLICT');
  draft=(await findCreationDraft(env.DB,agencyId,draft.id))!;
  await finishCreationDraft(env,agencyId,draft.id,draft.version);
  return exportInput(draft.id,frozen);
}
function exportInput(listingId:string,customization:VideoCustomization){const editor=customization.editor!;
  return GenerationRequest.parse({listingId,customization,aspectRatio:editor.aspectRatio,durationSeconds:editor.durationSeconds,
    voiceEnabled:editor.voiceEnabled,subtitlesEnabled:editor.subtitlesEnabled});
}
