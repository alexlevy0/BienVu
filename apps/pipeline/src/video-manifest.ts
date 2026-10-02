import {EntityId, GenerationRequest, PreparedNarration, PhotoAnimation, VideoAsset, VideoManifest, VideoFailure, videoAssets, videoManifestHash, videoPresentation, videoPhotoTimeline,videoDimensions} from '@bienvu/contracts';
import {findNarration, type Database} from '@bienvu/db';
import {scriptContext, validateScript, type ScriptContext} from '@bienvu/narration';
import type {NarrationBucket} from './narration';

export type FrozenVideo = {hash: string; manifest: VideoManifest; state: 'preparing' | 'prepared'};
type Row = {manifest: string; hash: string; sources: string; attempt: number; state: FrozenVideo['state']; expires: string};
type Source = {id: string; key: string};
export const videoBytesHash = async (b: Uint8Array) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new Uint8Array(b)))].map(n=>n.toString(16).padStart(2,'0')).join('');
function fail(code: string): never {throw new VideoFailure(code);}
const row = (db: Database, agency: string, job: string) => db.prepare(`SELECT manifest_json AS manifest,manifest_hash AS hash,
  sources_json AS sources,job_attempt AS attempt,state,expires_at AS expires FROM video_manifests WHERE agency_id=? AND job_id=?`)
  .bind(agency,job).first<Row>();
export async function getJobVideo(db: Database, agency: string, job: string): Promise<FrozenVideo | null> {
  EntityId.parse(agency); EntityId.parse(job);
  const stored=await row(db,agency,job); if(!stored)return null;
  if(stored.expires<=new Date().toISOString())fail('VIDEO_EXPIRED');
  const manifest=VideoManifest.parse(JSON.parse(stored.manifest));
  if(manifest.agencyId!==agency||manifest.jobId!==job||await videoManifestHash(manifest)!==stored.hash)fail('VIDEO_MANIFEST_INVALID');
  return {manifest,hash:stored.hash,state:stored.state};
}

// Les seuls paramètres appelants sont le périmètre déjà authentifié du job.
// Aucun droit, texte, logo, URL ou timing n'est accepté du navigateur.
export async function prepareJobVideo(env: {DB: Database; MEDIA: NarrationBucket}, agency: string, job: string): Promise<FrozenVideo> {
  EntityId.parse(agency); EntityId.parse(job);
  const entitlement=await env.DB.prepare(`SELECT j.attempt,j.listing_id AS listingId,a.id AS allocationId,
    g.input_json AS generationInput,g.preview_provision_cents AS previewProvisionCents,IIF(g.anonymous_session_id IS NOT NULL,'anonymous',a.kind) AS kind
    FROM jobs j JOIN reservations r ON r.id=j.reservation_id AND r.job_id=j.id AND r.agency_id=j.agency_id
    LEFT JOIN allocations a ON a.id=r.allocation_id LEFT JOIN generation_runs g ON g.job_id=j.id
    WHERE j.agency_id=? AND j.id=? AND ((r.status='reserved' AND a.reserved>0)
      OR (g.anonymous_session_id IS NOT NULL AND g.retention='available' AND r.status='unfunded'))
    AND j.status IN ('scripting','voicing','rendering','retry_wait')`)
    .bind(agency,job).first<{attempt:number;listingId:string;allocationId:string|null;generationInput:string|null;previewProvisionCents:number;kind:'trial'|'paid'|'free'|'anonymous'}>();
  if(!entitlement)fail('VIDEO_NOT_AUTHORIZED');
  let stored=await row(env.DB,agency,job);
  if(!stored) {
    const narration=await findNarration(env.DB,agency,job);
    if(!narration||narration.state!=='prepared'||narration.jobAttempt!==entitlement.attempt||narration.expiresAt<=new Date().toISOString())fail('VIDEO_NARRATION_NOT_READY');
    const snapshot=JSON.parse(narration.snapshot) as {listing:unknown;brand:unknown;contact:ScriptContext['contact'];copyVersion?:ScriptContext['copyVersion'];customNarration?:string[]};
    const input=entitlement.generationInput?GenerationRequest.parse(JSON.parse(entitlement.generationInput)):undefined;
    const context=await scriptContext(snapshot.listing,snapshot.brand,snapshot.contact,snapshot.copyVersion??'factual-copy/1',snapshot.customNarration,input?.durationSeconds);
    if(context.listing.agencyId!==agency||context.listing.id!==entitlement.listingId||context.brand.id!==agency)fail('VIDEO_SCOPE_INVALID');
    const prepared=PreparedNarration.parse(JSON.parse(narration.result!));
    validateScript(context,prepared.script);
    const prefix=`agencies/${agency}/jobs/${job}/`, sources:Source[]=[];
    const photos=context.listing.photos.map(p=>{
      if(!p.objectKey.startsWith(`agencies/${agency}/imports/${context.listing.id}/`)&&!p.objectKey.startsWith(prefix))fail('VIDEO_SCOPE_INVALID');
      const asset=VideoAsset.parse({id:p.id,objectKey:`${prefix}photos/${p.contentHash}.${p.mime==='image/jpeg'?'jpg':p.mime==='image/png'?'png':'webp'}`,
        sha256:p.contentHash,sizeBytes:p.sizeBytes,mime:p.mime,width:p.width,height:p.height});
      sources.push({id:asset.id,key:p.objectKey});return asset;
    });
    let logo:VideoAsset|null=null;
    if(context.brand.logoAssetId) {
      const asset=await env.DB.prepare(`SELECT id,object_key AS objectKey,content_hash AS sha256,size_bytes AS sizeBytes,mime,width,height
        FROM media_assets WHERE agency_id=? AND id=? AND kind='brand' AND job_id IS NULL`)
        .bind(agency,context.brand.logoAssetId).first();
      if(!asset)fail('VIDEO_LOGO_MISSING');
      const source=VideoAsset.parse(asset);
      if(!source.objectKey.startsWith(`agencies/${agency}/brand/`))fail('VIDEO_SCOPE_INVALID');
      logo={...source,objectKey:`${prefix}brand/${source.sha256}.${source.mime==='image/png'?'png':source.mime==='image/jpeg'?'jpg':'webp'}`};
      sources.push({id:logo.id,key:source.objectKey});
    }
    const audio=prepared.audio.map(a=>{
      if(!a.objectKey.startsWith(`${prefix}audio/`))fail('VIDEO_SCOPE_INVALID');
      sources.push({id:a.id,key:a.objectKey});
      return VideoAsset.parse({id:a.id,objectKey:a.objectKey,sha256:a.sha256,sizeBytes:a.sizeBytes,mime:'audio/wav',durationMs:a.durationMs});
    });
    const customization=input?.customization;
    if((prepared.voiceEnabled!==false)!==(input?.voiceEnabled!==false))fail('VIDEO_SCOPE_INVALID');
    if(prepared.durationSeconds!==input?.durationSeconds)fail('VIDEO_SCOPE_INVALID');
    const animations:PhotoAnimation[]=[];
    if(customization?.runwayClips){
      const rows=await env.DB.prepare("SELECT json_group_array(json(animation_json)) AS data FROM (SELECT animation_json FROM photo_animations WHERE agency_id=? AND job_id=? AND state='ready' ORDER BY slot)")
        .bind(agency,job).first<{data:string}>();
      for(const row of JSON.parse(rows?.data??'[]')){const animation=PhotoAnimation.parse(row);
        const original=photos.find(p=>p.id===animation.photoAssetId&&p.sha256===animation.sourceSha256);
        if(!original)fail('VIDEO_SCOPE_INVALID');
        animations.push(animation);sources.push({id:animation.asset.id,key:animation.asset.objectKey});}
    }
    const manifest=VideoManifest.parse({schemaVersion:2,templateVersion:input?.aspectRatio==='16:9'?'bienvu-horizontal/1':'bienvu-vertical/2',agencyId:agency,jobId:job,listingId:context.listing.id,
      brand:context.brand,contact:context.contact,logo,...videoDimensions(input?.aspectRatio),fps:30,disclosure:prepared.script.disclosure,
      rights:entitlement.kind==='anonymous'?{kind:'anonymous',watermarked:false,previewProvisionCents:entitlement.previewProvisionCents}:{kind:entitlement.kind,allocationId:entitlement.allocationId,watermarked:entitlement.kind==='trial'},photos,audio,
      scenes:prepared.script.scenes.map((s,i)=>({...s,audioAssetId:audio[i]?.id??null,durationFrames:prepared.durationFrames[i]})),
      photoTimeline:videoPhotoTimeline(photos,prepared.durationFrames.reduce((n,frames)=>n+frames,0),animations.map(a=>a.photoAssetId)),
      presentation:videoPresentation(context.listing),
      subtitlesEnabled:input?.voiceEnabled===false?false:input?.subtitlesEnabled??true,
      ...(input?.voiceEnabled===false?{voiceEnabled:false}:{}),
      ...(input?.durationSeconds!==undefined?{durationSeconds:input.durationSeconds}:{}),
      ...(customization?{visualStyle:customization.style,photoMotion:customization.photoMotion,photoTransition:customization.transition}:{visualStyle:'cinematic'}),
      ...(animations.length?{photoAnimations:animations}:{})});
    const at=new Date().toISOString(),hash=await videoManifestHash(manifest);
    await env.DB.prepare(`INSERT INTO video_manifests(job_id,agency_id,job_attempt,manifest_hash,manifest_json,sources_json,state,created_at,expires_at)
      SELECT ?,?,?,?,?,?,'preparing',?,? WHERE EXISTS(SELECT 1 FROM jobs j JOIN reservations r ON r.id=j.reservation_id AND r.agency_id=j.agency_id
      WHERE j.id=? AND j.agency_id=? AND j.attempt=? AND (r.status='reserved' OR (r.status='unfunded' AND EXISTS(SELECT 1 FROM generation_runs WHERE job_id=j.id AND anonymous_session_id IS NOT NULL AND retention='available'))) AND j.status IN ('scripting','voicing','rendering','retry_wait'))
      ON CONFLICT(job_id) DO NOTHING`)
      .bind(job,agency,entitlement.attempt,hash,JSON.stringify(manifest),JSON.stringify(sources),at,new Date(Date.now()+30*86400_000).toISOString(),
        job,agency,entitlement.attempt).run();
    stored=await row(env.DB,agency,job);
  }
  if(!stored||stored.attempt!==entitlement.attempt)fail('VIDEO_CONFLICT');
  const frozen=await getJobVideo(env.DB,agency,job);if(!frozen)fail('VIDEO_CONFLICT');
  if(frozen.state==='prepared')return frozen;
  const sources=JSON.parse(stored.sources) as Source[];
  for(const asset of videoAssets(frozen.manifest)) {
    const source=sources.find(s=>s.id===asset.id);if(!source)fail('VIDEO_SOURCE_MISSING');
    const object=await env.MEDIA.get(source.key);
    if(!object||object.size!==asset.sizeBytes)fail('VIDEO_ASSET_MISSING');
    const bytes=new Uint8Array(await object.arrayBuffer());
    if(await videoBytesHash(bytes)!==asset.sha256)fail('VIDEO_ASSET_HASH_MISMATCH');
    if(asset.objectKey!==source.key)await env.MEDIA.put(asset.objectKey,bytes,{httpMetadata:{contentType:asset.mime},customMetadata:{manifestHash:frozen.hash}});
  }
  await env.DB.prepare("UPDATE video_manifests SET state='prepared' WHERE agency_id=? AND job_id=? AND manifest_hash=?").bind(agency,job,frozen.hash).run();
  return {...frozen,state:'prepared'};
}
