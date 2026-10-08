// Local H.264/Remotion regression only. Synthetic audio and simulated clips;
// no provider, import, admission or remote database request.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {dirname,join,resolve} from 'node:path';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import sharp from 'sharp';
import {videoFixture} from '../fixtures/video';
import {toneFixture} from '../fixtures/voice';
import {VideoManifest,PhotoAnimation,videoAssets,videoAssetFile,videoManifestHash,videoPhotoTimeline,createEditorDocument} from '../packages/contracts/src/index';
import {renderListingStills,renderListingVideo,withVideoAssets} from '../apps/renderer/src/listing-render';

const require=createRequire(new URL('../apps/renderer/package.json',import.meta.url));
if(process.platform==='darwin'){
  const local=createRequire(require.resolve('@remotion/renderer')),bin=dirname(local.resolve(`@remotion/compositor-darwin-${process.arch}/package.json`));
  process.env.BIENVU_FFMPEG_PATH=join(bin,'ffmpeg');process.env.BIENVU_FFPROBE_PATH=join(bin,'ffprobe');
}
const directory=resolve('evidence/local/runway-duration-2026-10-09/render'),exec=promisify(execFile),hash=(b:Uint8Array)=>createHash('sha256').update(b).digest('hex');
await mkdir(directory,{recursive:true,mode:0o700});
const clipFile=join(directory,'source-two-seconds.mp4');
const framesDirectory=join(directory,'source-frames');await mkdir(framesDirectory,{recursive:true,mode:0o700});
for(let frame=0;frame<60;frame++)await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="720" height="1280"><rect width="720" height="1280" fill="#36594b"/><rect x="${30+frame*7}" y="400" width="180" height="400" fill="#cbd4a9"/><text x="40" y="100" fill="white" font-size="60">${frame}</text></svg>`))
  .jpeg({quality:85}).toFile(join(framesDirectory,`frame-${String(frame).padStart(3,'0')}.jpg`));
await exec(process.env.BIENVU_FFMPEG_PATH??'ffmpeg',['-v','error','-framerate','30','-i',join(framesDirectory,'frame-%03d.jpg'),
  '-t','2','-an','-c:v','libx264','-threads','1','-pix_fmt','yuv420p','-movflags','+faststart','-y',clipFile],
  {cwd:dirname(process.env.BIENVU_FFMPEG_PATH??resolve('ffmpeg')),timeout:60_000,maxBuffer:128_000});
const clip=await readFile(clipFile),fixture=await videoFixture('paid',10),base=fixture.manifest;
const animations=base.photos.map((photo,i)=>PhotoAnimation.parse({photoAssetId:photo.id,sourceSha256:photo.sha256,provider:'runway',model:'gen4_turbo',
  asset:{id:`short-animation-${i}`,objectKey:`agencies/${base.agencyId}/jobs/${base.jobId}/animations/${hash(clip)}.mp4`,sha256:hash(clip),
    sizeBytes:clip.length,mime:'video/mp4',width:720,height:1280,durationMs:2000}}));
const tone=toneFixture(2500),audio=base.audio.map(asset=>({...asset,sha256:hash(tone),sizeBytes:tone.length,durationMs:2500}));
for(const asset of audio)fixture.files.set(asset.id,tone);
const scenes=base.scenes.map((s,i)=>({...s,durationFrames:Math.floor((i+1)*600/base.scenes.length)-Math.floor(i*600/base.scenes.length)}));
const manifest=VideoManifest.parse({...base,audio,scenes,durationSeconds:20,photoAnimations:animations,photoTransition:'fade',
  photoTimeline:videoPhotoTimeline(base.photos,600,base.photos.map(p=>p.id)),visualStyle:'cinematic'});
for(const asset of videoAssets(manifest))await writeFile(join(directory,videoAssetFile(asset)),asset.mime==='video/mp4'?clip:fixture.files.get(asset.id)!,{mode:0o600});
await writeFile(join(directory,'manifest.json'),JSON.stringify(manifest,null,2),{mode:0o600});
await withVideoAssets(manifest,directory,async props=>{
  const response=await fetch(props.media[animations[0].asset.id],{headers:{Range:'bytes=0-31'}});
  assert.equal(response.status,206);assert.equal((await response.arrayBuffer()).byteLength,32);
});
await renderListingStills(manifest,directory,join(directory,'gallery'),[30,59,66,599]);
const report=await renderListingVideo(manifest,directory);
assert.equal(report.durationFrames,600);assert.ok(Math.abs(report.durationSeconds-20)<.12);
const editor=createEditorDocument(base.photos.map((_p,i)=>({sourceOrder:i})),{});editor.textsVisible=false;
editor.clips=editor.clips.map((c,i)=>({...c,durationFrames:i===0?200:i===1?40:45}));
const edited=VideoManifest.parse({...manifest,editor});
const editorDirectory=join(directory,'editor');await mkdir(editorDirectory,{recursive:true,mode:0o700});
for(const asset of videoAssets(edited))await writeFile(join(editorDirectory,videoAssetFile(asset)),await readFile(join(directory,videoAssetFile(asset))),{mode:0o600});
await writeFile(join(editorDirectory,'manifest.json'),JSON.stringify(edited,null,2),{mode:0o600});
await renderListingStills(edited,editorDirectory,join(editorDirectory,'frames'),[59,72,160,205]);
assert.equal(hash(await readFile(join(editorDirectory,'frames/frame-72.png'))),hash(await readFile(join(editorDirectory,'frames/frame-160.png'))),
  'A longer editor slot holds the real last frame of the two-second clip');
const result={passed:true,fixtures:true,simulatedRunway:true,newProviderCalls:0,animationSeconds:2,photos:10,
  rangeValidated:true,editorLastFrameHeld:true,manifestHash:await videoManifestHash(manifest),video:report};
await writeFile(join(directory,'report.json'),JSON.stringify(result,null,2),{mode:0o600});
console.log(JSON.stringify(result));
