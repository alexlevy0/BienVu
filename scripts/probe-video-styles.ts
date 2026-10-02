// Native renderer with demonstration photos + previously validated Aoede WAVs.
// New model/TTS calls: zero. This is not an extracted listing or a new voice test.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {dirname,join} from 'node:path';
import {writeFile} from 'node:fs/promises';
import sharp from 'sharp';
import {makeVideoFixture} from './video-fixtures';
import {renderListingStills,renderListingVideo} from '../apps/renderer/src/listing-render';
import {VideoManifest,videoManifestHash} from '../packages/contracts/src/index';
if(process.platform==='darwin'){
  const require=createRequire(new URL('../apps/renderer/package.json',import.meta.url)),local=createRequire(require.resolve('@remotion/renderer'));
  const bin=dirname(local.resolve(`@remotion/compositor-darwin-${process.arch}/package.json`));
  process.env.BIENVU_FFMPEG_PATH=join(bin,'ffmpeg');process.env.BIENVU_FFPROBE_PATH=join(bin,'ffprobe');
}
const gallery=['paris','lyon','bordeaux','sud'].map(name=>({path:`apps/web/public/images/studio-home/${name}.webp`})),report=[];
const captures=[];
for(const style of ['editorial','minimal','cinematic'] as const){
  const {directory,manifest:base}=await makeVideoFixture('paid','styles-fixture',`style-${style}-20261001`,'bienvu-vertical/2',gallery);
  const manifest=VideoManifest.parse({...base,visualStyle:style,photoMotion:style!=='minimal',photoTransition:style==='minimal'?'cut':'fade',brand:{...base.brand,primaryColor:'#E1E8D9',secondaryColor:'#171714'}});
  const frames=manifest.scenes.reduce((n,s)=>n+s.durationFrames,0);
  await writeFile(join(directory,'manifest.json'),JSON.stringify(manifest,null,2),{mode:0o600});
  await renderListingStills(manifest,directory,join(directory,'frames'),[30,frames-30]);
  for(const frame of [30,frames-30])captures.push(await sharp(join(directory,'frames',`frame-${frame}.png`)).resize(270,480).png().toBuffer());
  const video=style==='cinematic'?await renderListingVideo(manifest,directory):null;
  if(video){assert.equal(video.width,1080);assert.equal(video.height,1920);assert.equal(video.audioCodec,'aac');assert.ok((video.meanVolumeDb??-Infinity)>-45);}
  report.push({style,manifestHash:await videoManifestHash(manifest),photos:manifest.photos.length,stills:[30,frames-30],video});
}
await sharp({create:{width:1620,height:480,channels:3,background:'#fff'}}).composite(captures.map((input,i)=>({input,left:i*270,top:0}))).png().toFile('evidence/local/video-customizer/styles-contact-sheet.png');
await writeFile('evidence/local/video-customizer/styles-report.json',JSON.stringify({at:new Date().toISOString(),syntheticListing:true,demonstrationPhotos:true,existingGoogleAoedeAudio:true,newVoiceCalls:0,newTextCalls:0,report},null,2),{mode:0o600});
console.log(JSON.stringify({passed:true,styles:report.map(r=>({style:r.style,photos:r.photos,mp4:!!r.video}))}));
