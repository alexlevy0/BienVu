// Local composition verification, reusing the real Runway clip already paid.
// No API creation, listing import, voice request or production admission.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {dirname,join,resolve} from 'node:path';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import sharp from 'sharp';
import {VideoManifest,videoAssetFile,videoManifestHash} from '../packages/contracts/src/index';
import {renderListingStills,renderListingVideo} from '../apps/renderer/src/listing-render';

const require=createRequire(new URL('../apps/renderer/package.json',import.meta.url));
const local=createRequire(require.resolve('@remotion/renderer'));
const bin=dirname(local.resolve(`@remotion/compositor-darwin-${process.arch}/package.json`));
process.env.BIENVU_FFMPEG_PATH=join(bin,'ffmpeg');process.env.BIENVU_FFPROBE_PATH=join(bin,'ffprobe');
const exec=promisify(execFile),hash=(bytes:Uint8Array)=>createHash('sha256').update(bytes).digest('hex');
const source=resolve('evidence/remote/runway'),directory=resolve('evidence/local/video-reference/cinema');
await mkdir(directory,{recursive:true,mode:0o700});
const proof=JSON.parse(await readFile(join(source,'status.json'),'utf8'));
const original=proof.manifests.map((row:{manifest_json:string})=>VideoManifest.parse(JSON.parse(row.manifest_json)))
  .find((manifest:VideoManifest)=>manifest.photoAnimations?.length===1) as VideoManifest|undefined;
assert.ok(original,'The previously verified real clip is required');assert.equal(original.logo??null,null);
for(const [i,photo] of original.photos.entries()){
  const bytes=await readFile(join(source,`source-${i+1}.jpg`));assert.equal(hash(bytes),photo.sha256);
  await writeFile(join(directory,videoAssetFile(photo)),bytes,{mode:0o600});
}
const animation=original.photoAnimations![0],clip=await readFile(join(source,'runway-clip.mp4'));
assert.equal(hash(clip),animation.asset.sha256);await writeFile(join(directory,videoAssetFile(animation.asset)),clip,{mode:0o600});
// Recover the same scene speech from the existing AAC master; this is decoded
// audio, not a new TTS response. Original text and scene timings are preserved.
let start=0;const audio=[];
for(const [i,scene] of original.scenes.entries()){
  const asset=original.audio.find(a=>a.id===scene.audioAssetId)!,file=join(directory,`decoded-${i}.wav`);
  await exec(join(bin,'ffmpeg'),['-v','error','-ss',String(start/30),'-i',join(source,'video.mp4'),'-t',String(asset.durationMs!/1000),
    '-vn','-ac','1','-ar','48000','-c:a','pcm_s16le','-y',file],{cwd:bin,timeout:20_000});
  const bytes=await readFile(file),sha256=hash(bytes),decoded={...asset,sha256,sizeBytes:bytes.length,
    objectKey:`agencies/${original.agencyId}/jobs/${original.jobId}/audio/${sha256}.wav`};
  await writeFile(join(directory,videoAssetFile(decoded)),bytes,{mode:0o600});audio.push(decoded);start+=scene.durationFrames;
}
const manifest=VideoManifest.parse({...original,audio,visualStyle:'cinematic',subtitlesEnabled:false});
await writeFile(join(directory,'manifest.json'),JSON.stringify(manifest,null,2),{mode:0o600});
const end=manifest.scenes.reduce((n,s)=>n+s.durationFrames,0),contact=end-manifest.scenes.at(-1)!.durationFrames;
const frames=[30,145,165,370,contact+45,end-10];
await renderListingStills(manifest,directory,join(directory,'frames'),frames);
// Subtitles and trial rights are separately checked with the same media.
const trial=VideoManifest.parse({...manifest,subtitlesEnabled:true,rights:{...manifest.rights,kind:'trial',watermarked:true}});
await renderListingStills(trial,directory,join(directory,'trial'),[30,end-10]);
const bright=VideoManifest.parse({...manifest,brand:{...manifest.brand,secondaryColor:'#F6F8F0'}});
await renderListingStills(bright,directory,join(directory,'bright'),[end-10]);
const thumbnails=await Promise.all(frames.map(frame=>sharp(join(directory,'frames',`frame-${frame}.png`)).resize(270,480).png().toBuffer()));
await sharp({create:{width:thumbnails.length*270,height:480,channels:3,background:'#171714'}})
  .composite(thumbnails.map((input,i)=>({input,left:270*i,top:0}))).jpeg({quality:90}).toFile(join(directory,'contact-sheet.jpg'));
const video=process.argv.includes('--stills-only')?null:await renderListingVideo(manifest,directory);
await writeFile(join(directory,'report.json'),JSON.stringify({at:new Date().toISOString(),localRender:true,syntheticListing:true,
  realRunwayClipReused:true,newRunwayCalls:0,newVoiceCalls:0,newTextCalls:0,newCameraPromptsVerifiedWithProvider:false,
  decodedExistingGoogleAudio:true,sourceManifestHash:await videoManifestHash(original),manifestHash:await videoManifestHash(manifest),frames,video},null,2),{mode:0o600});
console.log(JSON.stringify({passed:true,localRender:true,realRunwayClipReused:true,newProviderCalls:0,video}));
