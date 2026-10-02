// Actual landscape MP4 and all three styles, using already saved media.
// No import, provider request, customer quota or production admission.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {dirname,join,resolve} from 'node:path';
import {mkdir,readFile,writeFile,copyFile} from 'node:fs/promises';
import {VideoManifest,videoAssets,videoAssetFile,videoPhotoTimeline} from '../packages/contracts/src/index';
import {voiceSceneTiming} from '../packages/voice/src/index';
import {renderListingVideo,renderListingStills,verifyVideoArtifact} from '../apps/renderer/src/listing-render';
const require=createRequire(new URL('../apps/renderer/package.json',import.meta.url)),local=createRequire(require.resolve('@remotion/renderer'));
const bin=dirname(local.resolve(`@remotion/compositor-darwin-${process.arch}/package.json`));
process.env.BIENVU_FFMPEG_PATH=join(bin,'ffmpeg');process.env.BIENVU_FFPROBE_PATH=join(bin,'ffprobe');
const source=resolve('evidence/local/video-reference/cinema'),folder=resolve('evidence/local/video-format/render');
await mkdir(folder,{recursive:true,mode:0o700});
const original=VideoManifest.parse(JSON.parse(await readFile(join(source,'manifest.json'),'utf8')));
const timing=voiceSceneTiming(original.audio.map(a=>a.durationMs!),20),frames=600;
const manifest=VideoManifest.parse({...original,templateVersion:'bienvu-horizontal/1',width:1920,height:1080,durationSeconds:20,
  scenes:original.scenes.map((s,i)=>({...s,durationFrames:timing[i]})),photoTimeline:videoPhotoTimeline(original.photos,frames,original.photoAnimations?.map(a=>a.photoAssetId))});
for(const asset of videoAssets(manifest))await copyFile(join(source,videoAssetFile(asset)),join(folder,videoAssetFile(asset)));
await writeFile(join(folder,'manifest.json'),JSON.stringify(manifest,null,2),{mode:0o600});
const report=await renderListingVideo(manifest,folder);
assert.equal(report.width,1920);assert.equal(report.height,1080);assert.equal(report.durationFrames,600);assert.equal(report.audioCodec,'aac');
await assert.rejects(verifyVideoArtifact(join(folder,'video.mp4'),report.id,600,false,new Date().toISOString(),performance.now(),true),/VIDEO_MP4_INVALID/);
const stills=[30,300,590];
for(const visualStyle of ['cinematic','editorial','minimal'] as const){
  await renderListingStills(VideoManifest.parse({...manifest,visualStyle}),folder,join(folder,visualStyle),stills);
}
await writeFile(join(folder,'validation.json'),JSON.stringify({at:new Date().toISOString(),report,stills,styles:['cinematic','editorial','minimal'],newProviderCalls:0,syntheticListing:true,savedVoiceAndClipReused:true,portraitExpectationRejected:true},null,2),{mode:0o600});
console.log(JSON.stringify({passed:true,report,newProviderCalls:0}));
