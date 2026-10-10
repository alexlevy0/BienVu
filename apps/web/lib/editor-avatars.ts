import {AvatarPreviewClip,VideoManifest,editorCanReuseVoice,avatarMoments,type VideoCustomization} from '@bienvu/contracts';
import {findCreationDraft,findEditorVoiceSource,type Database} from '@bienvu/db';
import {RequestFailure} from './http';

// Recover files from the voice's original generation, with the exact WAV hash.
// No avatar URL or source job is accepted from the browser.
export async function editorAvatarClips(db:Database,agency:string,id:string,settings:VideoCustomization){
  if(!settings.avatar||!settings.voiceSourceId)return [];
  const voice=await findEditorVoiceSource(db,agency,id,settings.voiceSourceId);
  if(!voice||!editorCanReuseVoice(settings,voice.preview))return [];
  const row=await db.prepare('SELECT manifest_json AS manifest FROM video_manifests WHERE agency_id=? AND job_id=?')
    .bind(agency,voice.originJobId).first<{manifest:string}>();if(!row)return [];
  const manifest=VideoManifest.parse(JSON.parse(row.manifest));if(manifest.agencyId!==agency||manifest.jobId!==voice.originJobId)return [];
  return (manifest.avatar?.clips??[]).filter(clip=>clip.lookId===settings.avatar!.lookId&&clip.engine===settings.avatar!.engine&&clip.transparent===(settings.avatar!.appearance==='cutout')
    &&avatarMoments(settings.avatar).includes(clip.moment)&&(clip.moment==='full'?
      clip.durationFrames===voice.preview.durationSeconds*30&&clip.sourceAudio?.sources.length===voice.audio.length&&clip.sourceAudio.sources.every((part,i)=>
        part.audioSha256===voice.audio[i].sha256&&part.durationMs===voice.audio[i].durationMs&&part.startFrame===voice.preview.clips[i].startFrame):
      clip.audioSha256===voice.audio[clip.moment==='intro'?0:voice.audio.length-1].sha256))
    .map(clip=>AvatarPreviewClip.parse({id:clip.id,moment:clip.moment,startFrame:clip.startFrame,durationFrames:clip.durationFrames,audioSha256:clip.audioSha256,
      lookId:clip.lookId,engine:clip.engine,transparent:clip.transparent,width:clip.asset.width,height:clip.asset.height,...(clip.sourceAudio?{sources:clip.sourceAudio.sources}:{}),url:`/api/imports/${id}/avatar-clips/${clip.id}`}));
}
export async function editorAvatarMedia(request:Request,env:{DB:Database;MEDIA:R2Bucket},agency:string,id:string,clipId:string){
  const draft=await findCreationDraft(env.DB,agency,id),settings=draft?.data.videoCustomization;
  if(!settings||!(await editorAvatarClips(env.DB,agency,id,settings)).some(c=>c.id===clipId))throw new RequestFailure('NOT_FOUND');
  const voice=await findEditorVoiceSource(env.DB,agency,id,settings.voiceSourceId!);if(!voice)throw new RequestFailure('NOT_FOUND');
  const row=await env.DB.prepare('SELECT manifest_json AS manifest FROM video_manifests WHERE agency_id=? AND job_id=?').bind(agency,voice.originJobId).first<{manifest:string}>();
  const clip=row?VideoManifest.parse(JSON.parse(row.manifest)).avatar?.clips.find(c=>c.id===clipId):null;
  if(!clip||!clip.asset.objectKey.startsWith(`agencies/${agency}/jobs/${voice.originJobId}/avatars/`))throw new RequestFailure('NOT_FOUND');
  const head=await env.MEDIA.head(clip.asset.objectKey);if(!head||head.size!==clip.asset.sizeBytes||head.customMetadata?.sha256!==clip.asset.sha256)throw new RequestFailure('NOT_FOUND');
  let offset=0,length=head.size;const range=request.headers.get('range');
  if(range){const match=/^bytes=(\d+)-(\d*)$/.exec(range);if(!match)throw new RequestFailure('VALIDATION_ERROR');offset=Number(match[1]);length=Math.min(head.size-1,match[2]?Number(match[2]):head.size-1)-offset+1;
    if(!Number.isSafeInteger(offset)||offset<0||offset>=head.size||length<=0)return new Response(null,{status:416,headers:{'Content-Range':`bytes */${head.size}`}});}
  const object=await env.MEDIA.get(clip.asset.objectKey,{range:{offset,length}});if(!object)throw new RequestFailure('NOT_FOUND');
  return new Response(object.body,{status:range?206:200,headers:{'Content-Type':clip.asset.mime,'Content-Length':String(length),'Accept-Ranges':'bytes',...(range?{'Content-Range':`bytes ${offset}-${offset+length-1}/${head.size}`}:{})}});
}
