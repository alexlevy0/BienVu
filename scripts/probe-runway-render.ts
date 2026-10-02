// Rendering regression only: FFmpeg simulates a Runway output. No Runway,
// OpenAI or Google request; previously validated narration is reused.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {dirname,join,resolve} from 'node:path';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import sharp from 'sharp';
import {makeVideoFixture} from './video-fixtures';
import {renderListingStills,renderListingVideo,withVideoAssets} from '../apps/renderer/src/listing-render';
import {VideoManifest,PhotoAnimation,videoAssetFile,videoManifestHash,videoPhotoTimeline} from '../packages/contracts/src/index';
const require=createRequire(new URL('../apps/renderer/package.json',import.meta.url));
if(process.platform==='darwin'){
  const local=createRequire(require.resolve('@remotion/renderer')),bin=dirname(local.resolve(`@remotion/compositor-darwin-${process.arch}/package.json`));
  process.env.BIENVU_FFMPEG_PATH=join(bin,'ffmpeg');process.env.BIENVU_FFPROBE_PATH=join(bin,'ffprobe');
}
const exec=promisify(execFile),output=resolve('evidence/local/runway');await mkdir(output,{recursive:true,mode:0o700});
const gallery=['paris','lyon','bordeaux','sud'].map(name=>({path:`apps/web/public/images/studio-home/${name}.webp`}));
const {directory,manifest:base}=await makeVideoFixture('paid','runway-render-fixture','runway-mixed-local','bienvu-vertical/2',gallery);
const clipFile=join(directory,'animated-fixture.mp4');
const clipFrames=join(directory,'clip-frames');await mkdir(clipFrames,{recursive:true,mode:0o700});
// Remotion's bundled FFmpeg omits zoompan. Build bounded camera frames with
// Sharp, then encode them with the exact H.264 decoder contract instead.
const original=await sharp(join(directory,videoAssetFile(base.photos[0]))).resize(800,1424,{fit:'cover'}).raw().toBuffer({resolveWithObject:true});
for(let frame=0;frame<120;frame++){
  const t=frame/119,e=t*t*(3-2*t),image=await sharp(original.data,{raw:original.info})
    .extract({left:Math.round(16+48*e),top:Math.round(90-40*e),width:720,height:1280}).jpeg({quality:88}).toBuffer();
  await writeFile(join(clipFrames,`frame-${String(frame).padStart(3,'0')}.jpg`),image,{mode:0o600});
}
await exec(process.env.BIENVU_FFMPEG_PATH??'ffmpeg',['-v','error','-framerate','24','-i',join(clipFrames,'frame-%03d.jpg'),
  '-t','5','-an','-c:v','libx264','-threads','1','-pix_fmt','yuv420p','-movflags','+faststart','-y',clipFile],{cwd:dirname(process.env.BIENVU_FFMPEG_PATH??resolve('ffmpeg')),timeout:60_000,maxBuffer:128_000});
const bytes=await readFile(clipFile),sha256=createHash('sha256').update(bytes).digest('hex');
const animation=PhotoAnimation.parse({photoAssetId:base.photos[0].id,sourceSha256:base.photos[0].sha256,provider:'runway',model:'gen4_turbo',
  asset:{id:'simulated-runway-clip',objectKey:`agencies/${base.agencyId}/jobs/${base.jobId}/animations/${sha256}.mp4`,sha256,
    sizeBytes:bytes.length,mime:'video/mp4',width:720,height:1280,durationMs:5000}});
await writeFile(join(directory,videoAssetFile(animation.asset)),bytes,{mode:0o600});
const manifest=VideoManifest.parse({...base,photoAnimations:[animation],photoTimeline:videoPhotoTimeline(base.photos,base.scenes.reduce((n,s)=>n+s.durationFrames,0),[animation.photoAssetId]),photoMotion:true,photoTransition:'fade',visualStyle:'editorial',brand:{...base.brand,primaryColor:'#E1E8D9',secondaryColor:'#171714'}});
await writeFile(join(directory,'manifest.json'),JSON.stringify(manifest,null,2),{mode:0o600});
// A signed local media URL supports range delivery for video decoding.
await withVideoAssets(manifest,directory,async props=>{
  const response=await fetch(props.media[animation.asset.id],{headers:{Range:'bytes=0-31'}});
  assert.equal(response.status,206);assert.equal((await response.arrayBuffer()).byteLength,32);
});
const end=manifest.scenes.reduce((n,s)=>n+s.durationFrames,0),change=manifest.photoTimeline![0].durationFrames;
const frames=[30,change-1,change+6,change+14,Math.floor(end/2),end-30];
await renderListingStills(manifest,directory,join(output,'frames'),frames);
const video=await renderListingVideo(manifest,directory);
assert.equal(video.width,1080);assert.equal(video.height,1920);assert.equal(video.audioCodec,'aac');assert.ok((video.meanVolumeDb??-Infinity)>-45);
// Longer than the clip: playback slows and the final frame holds for the fade.
const longer=structuredClone(manifest);longer.photoTimeline![0].durationFrames+=30;longer.photoTimeline![1].durationFrames-=30;
const prolonged=VideoManifest.parse(longer);await renderListingStills(prolonged,directory,join(output,'slow'),[change+20,change+36]);
const stills=await Promise.all(frames.map(frame=>sharp(join(output,'frames',`frame-${frame}.png`)).resize(270,480).png().toBuffer()));
await sharp({create:{width:stills.length*270,height:480,channels:3,background:'#fff'}})
  .composite(stills.map((input,i)=>({input,left:i*270,top:0}))).png().toFile(join(output,'contact-sheet.png'));
await writeFile(join(output,'render-report.json'),JSON.stringify({at:new Date().toISOString(),fixtures:true,simulatedRunwayClip:true,
  existingValidatedGoogleAudio:true,newRunwayCalls:0,newVoiceCalls:0,newTextCalls:0,frames,rangeValidated:true,
  manifestHash:await videoManifestHash(manifest),video,file:join(directory,'video.mp4')},null,2),{mode:0o600});
console.log(JSON.stringify({passed:true,simulatedRunwayClip:true,photos:manifest.photos.length,clips:1,video}));
