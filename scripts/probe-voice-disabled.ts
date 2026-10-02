// Actual native MP4 + trial derivative; synthetic listing and previously paid clip.
// No import, production admission, API speech/text or Runway creation.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {dirname,join,resolve} from 'node:path';
import {mkdir,readFile,writeFile,copyFile} from 'node:fs/promises';
import {VideoManifest,videoAssets,videoAssetFile,videoManifestHash} from '../packages/contracts/src/index';
import {renderListingVideo,createWatermarkedPreview} from '../apps/renderer/src/listing-render';
const require=createRequire(new URL('../apps/renderer/package.json',import.meta.url)),local=createRequire(require.resolve('@remotion/renderer'));
const bin=dirname(local.resolve(`@remotion/compositor-darwin-${process.arch}/package.json`));
process.env.BIENVU_FFMPEG_PATH=join(bin,'ffmpeg');process.env.BIENVU_FFPROBE_PATH=join(bin,'ffprobe');
const source=resolve('evidence/local/video-reference/cinema'),directory=resolve('evidence/local/voice-toggle/render');
await mkdir(directory,{recursive:true,mode:0o700});
const original=VideoManifest.parse(JSON.parse(await readFile(join(source,'manifest.json'),'utf8')));
const manifest=VideoManifest.parse({...original,voiceEnabled:false,subtitlesEnabled:false,audio:[],scenes:original.scenes.map(s=>({...s,audioAssetId:null}))});
for(const asset of videoAssets(manifest))await copyFile(join(source,videoAssetFile(asset)),join(directory,videoAssetFile(asset)));
await writeFile(join(directory,'manifest.json'),JSON.stringify(manifest,null,2),{mode:0o600});
const report=await renderListingVideo(manifest,directory),frames=manifest.scenes.reduce((n,s)=>n+s.durationFrames,0);
assert.equal(report.audioCodec,null);assert.equal(report.meanVolumeDb,null);
// Remotion's macOS FFmpeg has no overlay filter. The derivative is checked
// separately in the Linux renderer image, which contains the full FFmpeg.
const preview=process.platform==='darwin'?null:await createWatermarkedPreview(join(directory,'video.mp4'),directory,await videoManifestHash(manifest),frames,false);
if(preview){assert.equal(preview.audioCodec,null);assert.equal(preview.meanVolumeDb,null);assert.equal(preview.watermarked,true);}
await writeFile(join(directory,'silent-report.json'),JSON.stringify({at:new Date().toISOString(),syntheticListing:true,
  realRunwayClipReused:true,newProviderCalls:0,native:true,fullVideo:report,watermarkedDerivative:preview},null,2),{mode:0o600});
console.log(JSON.stringify({passed:true,native:true,newProviderCalls:0,report,preview}));
