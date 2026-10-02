// Actual local MP4, synthetic listing and already paid WAV/Runway assets.
// No provider request, production admission or customer quota is used.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {dirname,join,resolve} from 'node:path';
import {mkdir,readFile,writeFile,copyFile} from 'node:fs/promises';
import {VideoManifest,videoAssets,videoAssetFile,videoPhotoTimeline} from '../packages/contracts/src/index';
import {voiceSceneTiming} from '../packages/voice/src/index';
import {renderListingVideo,renderListingStills} from '../apps/renderer/src/listing-render';
const require=createRequire(new URL('../apps/renderer/package.json',import.meta.url)),local=createRequire(require.resolve('@remotion/renderer'));
const bin=dirname(local.resolve(`@remotion/compositor-darwin-${process.arch}/package.json`));
process.env.BIENVU_FFMPEG_PATH=join(bin,'ffmpeg');process.env.BIENVU_FFPROBE_PATH=join(bin,'ffprobe');
const source=resolve('evidence/local/video-reference/cinema'),directory=resolve('evidence/local/video-duration/render');
await mkdir(directory,{recursive:true,mode:0o700});
const original=VideoManifest.parse(JSON.parse(await readFile(join(source,'manifest.json'),'utf8')));
const timing=voiceSceneTiming(original.audio.map(a=>a.durationMs!),40);
const manifest=VideoManifest.parse({...original,durationSeconds:40,scenes:original.scenes.map((s,i)=>({...s,durationFrames:timing[i]})),
  photoTimeline:videoPhotoTimeline(original.photos,1200,original.photoAnimations?.map(a=>a.photoAssetId))});
for(const asset of videoAssets(manifest))await copyFile(join(source,videoAssetFile(asset)),join(directory,videoAssetFile(asset)));
await writeFile(join(directory,'manifest.json'),JSON.stringify(manifest,null,2),{mode:0o600});
const report=await renderListingVideo(manifest,directory);
assert.equal(report.durationFrames,1200);assert.equal(report.audioCodec,'aac');assert.ok(Math.abs(report.durationSeconds-40)<=.12);
const stills=[30,600,1190];await renderListingStills(manifest,directory,directory,stills);
await writeFile(join(directory,'report.json'),JSON.stringify({at:new Date().toISOString(),syntheticListing:true,
  realVoiceAndRunwayAssetsReused:true,newProviderCalls:0,native:true,stills,report},null,2),{mode:0o600});
console.log(JSON.stringify({passed:true,native:true,newProviderCalls:0,report}));
