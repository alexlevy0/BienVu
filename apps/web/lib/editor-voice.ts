import {NarrationAudio,audioNormalizationGain,type VideoManifest} from '@bienvu/contracts';
import {EditorVoiceSource,findEditorVoiceSource,type Database} from '@bienvu/db';
import {measureVoiceWav} from '../../../packages/voice/src/audio';
import {contentHash} from './manual-listings';
import {RequestFailure} from './http';

type Env={DB:Database;MEDIA:Pick<R2Bucket,'get'|'head'|'put'|'delete'>};
function waveform(bytes:Uint8Array){
  const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);let offset=12,start=0,length=0;
  while(offset+8<=bytes.length){const size=view.getUint32(offset+4,true);
    if(String.fromCharCode(...bytes.subarray(offset,offset+4))==='data'){start=offset+8;length=size;break;}offset+=8+size+size%2;}
  const samples=length/2,peaks=Array.from({length:64},(_,i)=>{let peak=0;
    for(let s=Math.floor(i*samples/64);s<Math.floor((i+1)*samples/64);s++)peak=Math.max(peak,Math.abs(view.getInt16(start+s*2,true))/32768);
    return peak;});const maximum=Math.max(...peaks,.0001);return peaks.map(p=>Number((p/maximum).toFixed(3)));
}
async function persistVoice(env:Env,agencyId:string,importId:string,source:EditorVoiceSource,buffers:Uint8Array[]){
  const json=JSON.stringify(EditorVoiceSource.parse(source));
  const old=await findEditorVoiceSource(env.DB,agencyId,importId,source.preview.id);
  if(old&&JSON.stringify(old)!==json)throw new RequestFailure('CONFLICT');
  const inserted=await env.DB.prepare(`INSERT INTO editor_voice_sources(id,agency_id,import_id,source_json,created_at)
    SELECT ?,?,?,?,? WHERE EXISTS(SELECT 1 FROM creation_drafts WHERE id=? AND agency_id=? AND state='needs_input')
    ON CONFLICT(id) DO NOTHING RETURNING id`).bind(source.preview.id,agencyId,importId,json,new Date().toISOString(),importId,agencyId).first();
  if(!inserted&&!old)throw new RequestFailure('CONFLICT');
  for(const [i,asset] of source.audio.entries())await env.MEDIA.put(asset.objectKey,buffers[i],{
    httpMetadata:{contentType:'audio/wav',cacheControl:'private, no-store'},customMetadata:{agencyId,importId,sha256:asset.sha256}});
  if(!await findEditorVoiceSource(env.DB,agencyId,importId,source.preview.id)){
    await env.MEDIA.delete(source.audio.map(a=>a.objectKey));throw new RequestFailure('CONFLICT');}
  return source.preview.id;
}
export async function restoreVideoVoice(env:Env,agencyId:string,importId:string,m:VideoManifest,voice:string,seconds:20|30|40,signal:AbortSignal){
  if(m.voiceEnabled===false||!m.audio.length)return undefined;
  const id=(await contentHash(new TextEncoder().encode(`${importId}:${m.jobId}:voice`))).slice(0,32),audio:EditorVoiceSource['audio']=[],buffers:Uint8Array[]=[],clips:EditorVoiceSource['preview']['clips']=[];
  let at=0;
  for(const scene of m.scenes){signal.throwIfAborted();const original=m.audio.find(a=>a.id===scene.audioAssetId);
    // The caller has verified ownership of the job. A claimed trial keeps its
    // immutable files in the original anonymous scope; the copy belongs here.
    if(!original||!original.objectKey.startsWith(`agencies/${m.agencyId}/jobs/${m.jobId}/audio/`))throw new RequestFailure('NOT_FOUND');
    const object=await env.MEDIA.get(original.objectKey);if(!object||object.size!==original.sizeBytes)throw new RequestFailure('NOT_FOUND');
    const bytes=new Uint8Array(await object.arrayBuffer()),sha=await contentHash(bytes),metrics=measureVoiceWav(bytes);
    if(sha!==original.sha256||metrics.durationMs!==original.durationMs)throw new RequestFailure('NOT_FOUND');
    const assetId=(await contentHash(new TextEncoder().encode(`${id}:${original.id}`))).slice(0,32);
    audio.push(NarrationAudio.parse({id:assetId,cacheKey:sha,objectKey:`agencies/${agencyId}/imports/${importId}/voice/${assetId}-${sha}.wav`,
      sha256:sha,sizeBytes:bytes.length,durationMs:metrics.durationMs,sampleRate:metrics.sampleRate,channels:metrics.channels,rmsDbfs:metrics.rmsDbfs}));buffers.push(bytes);
    clips.push({assetId,startFrame:at,durationMs:metrics.durationMs,text:scene.narrationText,waveform:waveform(bytes),normalizationGain:audioNormalizationGain(metrics.rmsDbfs,metrics.peak)});at+=scene.durationFrames;
  }
  const durationFrames=m.scenes.map(s=>s.durationFrames);durationFrames[durationFrames.length-1]+=seconds*30-at;
  const source=EditorVoiceSource.parse({preview:{id,voice,durationSeconds:seconds,clips},originJobId:m.jobId,audio,durationFrames});
  return persistVoice(env,agencyId,importId,source,buffers);
}
export async function copyEditorVoice(env:Env,agencyId:string,fromImport:string,toImport:string,sourceId:string,signal:AbortSignal){
  const source=await findEditorVoiceSource(env.DB,agencyId,fromImport,sourceId);if(!source)throw new RequestFailure('NOT_FOUND');
  const id=(await contentHash(new TextEncoder().encode(`${toImport}:${sourceId}:voice`))).slice(0,32),buffers:Uint8Array[]=[],audio:EditorVoiceSource['audio']=[];
  for(const asset of source.audio){signal.throwIfAborted();const object=await env.MEDIA.get(asset.objectKey);
    if(!object||object.size!==asset.sizeBytes)throw new RequestFailure('NOT_FOUND');const bytes=new Uint8Array(await object.arrayBuffer());
    if(await contentHash(bytes)!==asset.sha256||measureVoiceWav(bytes).durationMs!==asset.durationMs)throw new RequestFailure('NOT_FOUND');
    const assetId=(await contentHash(new TextEncoder().encode(`${id}:${asset.id}`))).slice(0,32);
    audio.push({...asset,id:assetId,objectKey:`agencies/${agencyId}/imports/${toImport}/voice/${assetId}-${asset.sha256}.wav`});buffers.push(bytes);
  }
  return persistVoice(env,agencyId,toImport,{...source,preview:{...source.preview,id,clips:source.preview.clips.map((c,i)=>({...c,assetId:audio[i].id}))},audio},buffers);
}
export async function editorVoicePreview(env:Env,agencyId:string,importId:string,id:string){
  const source=await findEditorVoiceSource(env.DB,agencyId,importId,id);if(!source)throw new RequestFailure('NOT_FOUND');return source.preview;
}
export async function privateEditorVoice(env:Env,agencyId:string,importId:string,id:string,assetId:string,request:Request){
  const source=await findEditorVoiceSource(env.DB,agencyId,importId,id),asset=source?.audio.find(a=>a.id===assetId);
  if(!asset)throw new RequestFailure('NOT_FOUND');
  const head=await env.MEDIA.head(asset.objectKey);if(!head||head.size!==asset.sizeBytes||head.customMetadata?.sha256!==asset.sha256)throw new RequestFailure('NOT_FOUND');
  const headers=new Headers({'Content-Type':'audio/wav','Content-Length':String(head.size),'Accept-Ranges':'bytes','Cache-Control':'private, no-store'});
  const range=request.headers.get('range');let offset=0,length=head.size;
  if(range){const match=/^bytes=(\d*)-(\d*)$/.exec(range),end=match?.[1]&&match[2]?Math.min(head.size-1,Number(match[2])):head.size-1;
    offset=match?.[1]?Number(match[1]):match?.[2]?Math.max(0,head.size-Number(match[2])):head.size;length=end-offset+1;
    if(!Number.isSafeInteger(offset)||!Number.isSafeInteger(length)||offset>=head.size||offset<0||length<=0)return new Response(null,{status:416,headers:{'Content-Range':`bytes */${head.size}`}});
    headers.set('Content-Length',String(length));headers.set('Content-Range',`bytes ${offset}-${offset+length-1}/${head.size}`);}
  const object=await env.MEDIA.get(asset.objectKey,{range:{offset,length}});if(!object)throw new RequestFailure('NOT_FOUND');
  return new Response(object.body,{status:range?206:200,headers});
}
