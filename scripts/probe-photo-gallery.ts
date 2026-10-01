// Real native Remotion/FFmpeg render on a synthetic listing and demonstration
// images. Reuses previously validated Google WAVs: no new provider call.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import {makeVideoFixture} from './video-fixtures';
import {renderListingVideo,renderListingStills} from '../apps/renderer/src/listing-render';
import {videoPhotoTimeline} from '../packages/contracts/src/index';

const gallery=[...['interieur','riviera','maison'].map(name=>({path:`apps/web/public/images/landing/${name}.webp`})),
  ...['paris','sud','lyon','bordeaux'].map(name=>({path:`apps/web/public/images/studio-home/${name}.webp`})),
  {path:'apps/web/public/images/studio-home/paris.webp',flip:true}];
const {directory,manifest}=await makeVideoFixture('paid','gallery-fixture','eight-photos-20261001','bienvu-vertical/2',gallery);
assert.equal(manifest.photos.length,8);assert.ok(manifest.audio.length>=4&&manifest.audio.length<=6);
assert.deepEqual(manifest.photoTimeline,videoPhotoTimeline(manifest.photos,manifest.scenes.reduce((n,s)=>n+s.durationFrames,0)));
const report=await renderListingVideo(manifest,directory);
let at=0;const frames=manifest.photoTimeline!.map(p=>{const frame=at+Math.floor(p.durationFrames/2);at+=p.durationFrames;return frame;});
const captures=path.join(directory,'frames');await renderListingStills(manifest,directory,captures,frames);
// A contact sheet makes the eight images reviewable together.
const thumbs=await Promise.all(frames.map(frame=>sharp(path.join(captures,`frame-${frame}.png`)).resize(270,480).png().toBuffer()));
await sharp({create:{width:1080,height:960,channels:3,background:'#fff'}}).composite(thumbs.map((input,i)=>({input,left:(i%4)*270,top:Math.floor(i/4)*480})))
  .png().toFile(path.join(directory,'contact-sheet.png'));
await writeFile(path.join(directory,'gallery-report.json'),JSON.stringify({at:new Date().toISOString(),runtime:'native-remotion',
  syntheticListing:true,demonstrationPhotos:true,eighthImage:'flipped demonstration photo',newTextCalls:0,newVoiceCalls:0,
  photos:manifest.photos.length,spokenScenes:manifest.scenes.length,timeline:manifest.photoTimeline,sampledFrames:frames,report},null,2),{mode:0o600});
// Check that each complete rendered image differs, then leave the MP4 for QA.
const images=await Promise.all(frames.map(frame=>readFile(path.join(captures,`frame-${frame}.png`))));
for(let i=1;i<images.length;i++)assert.notDeepEqual(images[i],images[i-1]);
console.log(JSON.stringify({directory,photos:8,report,sampledFrames:frames}));
