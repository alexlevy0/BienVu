import {z} from 'zod';
import {EntityId,EditorVoiceSource,NarrationAudio,VideoAsset} from '@bienvu/contracts';
import {findCreationDraft,type Database} from '@bienvu/db';
import {measureVoiceWav} from '../../../packages/voice/src/audio';
import {demoMedia,demoObjectKey,editorDemo,type DemoMedia} from './editor-demo';
import origin from './editor-demo-origin.json';
import {contentHash} from './manual-listings';
import {uploadCreationPhoto} from './creation-drafts';
import {persistVoice} from './editor-voice';
import {putEditorMusic} from './video-editor';
import {RequestFailure} from './http';
type Env={DB:Database;MEDIA:Pick<R2Bucket,'head'|'get'|'put'|'delete'>};
type DemoOrigins={voice:{originJobId:string;durationFrames:number[]};animations:Record<string,string>};
const copyInput=z.object({draftId:EntityId,photos:z.array(z.object({id:EntityId,slot:z.number().int().min(0).max(11)}).strict()).max(12),
  voice:z.boolean(),music:z.boolean()}).strict().refine(input=>new Set(input.photos.map(p=>p.id)).size===input.photos.length&&new Set(input.photos.map(p=>p.slot)).size===input.photos.length);
export function demoByteRange(value:string,size:number):{offset:number;length:number}|null{
  const match=/^bytes=(\d*)-(\d*)$/.exec(value);if(!match||!match[1]&&!match[2])return null;
  const start=match[1]?Number(match[1]):Math.max(0,size-Number(match[2])),end=match[1]&&match[2]?Math.min(size-1,Number(match[2])):size-1;
  if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start<0||start>=size||end<start||!match[1]&&Number(match[2])===0)return null;
  return {offset:start,length:end-start+1};
}
export async function publicDemoMedia(bucket:Pick<R2Bucket,'head'|'get'>,id:string,request:Request){
  const asset=demoMedia(id),safeHeaders={'X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'};
  if(!asset)return new Response(null,{status:404,headers:safeHeaders});
  const key=demoObjectKey(asset),head=await bucket.head(key);if(!head||head.size!==asset.sizeBytes)return new Response(null,{status:404,headers:safeHeaders});
  const etag=`"${asset.sha256}"`,headers=new Headers({...safeHeaders,'Content-Type':asset.mime,'Content-Length':String(asset.sizeBytes),
    'Accept-Ranges':'bytes','ETag':etag,'Cache-Control':'public, max-age=86400','Content-Security-Policy':"default-src 'none'; sandbox"});
  if(request.headers.get('if-none-match')===etag){headers.delete('Content-Length');return new Response(null,{status:304,headers});}
  const range=request.headers.get('range'),useRange=Boolean(range&&(!request.headers.has('if-range')||request.headers.get('if-range')===etag)),
    parsed=useRange?demoByteRange(range!,head.size):{offset:0,length:head.size};
  if(!parsed)return new Response(null,{status:416,headers:{...safeHeaders,'Content-Range':`bytes */${head.size}`}});
  if(useRange){headers.set('Content-Range',`bytes ${parsed.offset}-${parsed.offset+parsed.length-1}/${head.size}`);headers.set('Content-Length',String(parsed.length));}
  if(request.method==='HEAD')return new Response(null,{status:useRange?206:200,headers});
  const object=await bucket.get(key,{range:parsed});if(!object)return new Response(null,{status:404,headers:safeHeaders});
  return new Response(object.body,{status:useRange?206:200,headers});
}
async function verified(env:Env,asset:DemoMedia,signal:AbortSignal){signal.throwIfAborted();const object=await env.MEDIA.get(demoObjectKey(asset));
  if(!object||object.size!==asset.sizeBytes)throw new RequestFailure('NOT_FOUND');const bytes=new Uint8Array(await object.arrayBuffer());
  if(await contentHash(bytes)!==asset.sha256)throw new RequestFailure('NOT_FOUND');return bytes;}
// Copy only published demo assets into a verified member's own draft. Requests
// cannot name private source drafts, R2 paths, voice sources or animation jobs.
export async function copyDemoMedia(env:Env,agencyId:string,body:unknown,signal:AbortSignal,demo=editorDemo(),provenance:DemoOrigins=origin){
  const parsed=copyInput.safeParse(body);if(!parsed.success)throw new RequestFailure('VALIDATION_ERROR');const input=parsed.data;
  if(input.photos.some(p=>!demo.draft.photos.some(source=>source.id===p.id)))throw new RequestFailure('VALIDATION_ERROR');
  let draft=await findCreationDraft(env.DB,agencyId,input.draftId);if(!draft||draft.expiresAt<=new Date().toISOString())throw new RequestFailure('NOT_FOUND');
  for(const photo of input.photos){const source=demo.draft.photos.find(p=>p.id===photo.id)!,asset=demo.media.find(m=>m.id===source.id)!;
    const bytes=await verified(env,asset,signal),id=(await contentHash(new TextEncoder().encode(`${draft.id}:${source.id}:public-demo`))).slice(0,32);
    await uploadCreationPhoto(env,agencyId,draft.id,photo.slot,id,bytes,source.mime,async()=>({bytes,width:source.width,height:source.height,mime:source.mime}),signal);
    const animation=demo.media.find(m=>m.id===`demo-animation-${source.sourceOrder}`);if(!animation)continue;
    const frames=await verified(env,animation,signal),objectKey=`agencies/${agencyId}/imports/animation-library/${animation.sha256}.mp4`,at=new Date().toISOString();
    const video=VideoAsset.parse({...animation,id:(await contentHash(new TextEncoder().encode(`${agencyId}:${animation.sha256}:public-demo`))).slice(0,32),objectKey});
    await env.MEDIA.put(objectKey,frames,{httpMetadata:{contentType:'video/mp4'},customMetadata:{sha256:animation.sha256,sourceSha256:source.contentHash}});
    const originJobId=provenance.animations[animation.id];if(!originJobId)throw new RequestFailure('NOT_FOUND');
    await env.DB.prepare("INSERT INTO animation_library(id,agency_id,source_sha256,aspect_ratio,model,mode,origin_job_id,asset_json,created_at,expires_at) VALUES(?,?,?,?,'gen4_turbo','real',?,?,?,?) ON CONFLICT(agency_id,source_sha256,aspect_ratio,model,mode) DO UPDATE SET asset_json=excluded.asset_json,expires_at=excluded.expires_at WHERE animation_library.state='available'")
      .bind(crypto.randomUUID(),agencyId,source.contentHash,demo.draft.data.videoCustomization!.editor!.aspectRatio,originJobId,JSON.stringify(video),at,new Date(Date.now()+90*86400_000).toISOString()).run();
  }
  let voiceSourceId:string|undefined;
  if(input.voice&&demo.voice){const id=(await contentHash(new TextEncoder().encode(`${draft.id}:public-demo-voice`))).slice(0,32),buffers:Uint8Array[]=[],audio:EditorVoiceSource['audio']=[];
    for(const clip of demo.voice.clips){const asset=demo.media.find(m=>m.id===clip.assetId)!,bytes=await verified(env,asset,signal),metrics=measureVoiceWav(bytes),
      assetId=(await contentHash(new TextEncoder().encode(`${id}:${clip.assetId}`))).slice(0,32);
      if(metrics.durationMs!==clip.durationMs)throw new RequestFailure('NOT_FOUND');
      audio.push(NarrationAudio.parse({id:assetId,objectKey:`agencies/${agencyId}/imports/${draft.id}/voice/${assetId}-${asset.sha256}.wav`,cacheKey:asset.sha256,
        sha256:asset.sha256,sizeBytes:asset.sizeBytes,durationMs:metrics.durationMs,sampleRate:metrics.sampleRate,channels:metrics.channels,rmsDbfs:metrics.rmsDbfs}));buffers.push(bytes);}
    voiceSourceId=await persistVoice(env,agencyId,draft.id,EditorVoiceSource.parse({preview:{...demo.voice,id,clips:demo.voice.clips.map((c,i)=>({...c,assetId:audio[i].id}))},
      audio,originJobId:provenance.voice.originJobId,durationFrames:provenance.voice.durationFrames}),buffers);
  }
  const musicAsset=input.music?demo.media.find(m=>m.id==='demo-music'):null,music=musicAsset?await putEditorMusic(env,agencyId,draft.id,
    (await contentHash(new TextEncoder().encode(`${draft.id}:public-demo-music`))).slice(0,32),await verified(env,musicAsset,signal)):undefined;
  draft=(await findCreationDraft(env.DB,agencyId,draft.id))!;if(!draft)throw new RequestFailure('NOT_FOUND');return {draft,voiceSourceId,music};
}
