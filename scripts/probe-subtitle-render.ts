// Real Remotion frames; synthetic listing/audio and existing demonstration photos.
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import sharp from 'sharp';
import {videoFixture} from '../fixtures/video';
import {VideoManifest,videoAssetFile,videoManifestHash,videoPresentation} from '../packages/contracts/src/index';
import {renderListingStills} from '../apps/renderer/src/listing-render';

const output=path.resolve('evidence/local/subtitles'),media=path.join(output,'media');
await mkdir(media,{recursive:true,mode:0o700});
const fixture=await videoFixture('paid');
for(const asset of fixture.manifest.audio)await writeFile(path.join(media,videoAssetFile(asset)),fixture.files.get(asset.id)!,{mode:0o600});
const names=['paris','sud','lyon'];
for(const [index,asset] of fixture.manifest.photos.entries()){
  const bytes=await sharp(`apps/web/public/images/studio-home/${names[index]}.webp`).jpeg({quality:90}).toBuffer();
  const info=await sharp(bytes).metadata(),hash=createHash('sha256').update(bytes).digest('hex');
  Object.assign(asset,{mime:'image/jpeg',sha256:hash,sizeBytes:bytes.length,width:info.width!,height:info.height!,
    objectKey:`agencies/${fixture.manifest.agencyId}/jobs/${fixture.manifest.jobId}/photos/${hash}.jpg`});
  await writeFile(path.join(media,videoAssetFile(asset)),bytes,{mode:0o600});
}
const total=fixture.manifest.scenes.reduce((n,s)=>n+s.durationFrames,0),frames=[15,total-16];
const report=[];
for(const templateVersion of ['bienvu-vertical/1','bienvu-vertical/2'] as const){
  const model=VideoManifest.parse({...fixture.manifest,templateVersion,
    ...(templateVersion==='bienvu-vertical/2'?{presentation:videoPresentation(fixture.listing)}:{})});
  const root=path.join(output,templateVersion.endsWith('/2')?'editorial':'legacy');
  const hashes=[];
  for(const subtitlesEnabled of [true,false]){
    const manifest=VideoManifest.parse({...model,subtitlesEnabled}),directory=path.join(root,subtitlesEnabled?'enabled':'disabled');
    await mkdir(directory,{recursive:true,mode:0o700});
    await writeFile(path.join(directory,'manifest.json'),JSON.stringify(manifest,null,2),{mode:0o600});
    hashes.push(await videoManifestHash(manifest));
    await renderListingStills(manifest,media,directory,frames);
  }
  assert.notEqual(hashes[0],hashes[1]);
  const top=templateVersion.endsWith('/2')?880:1260,height=templateVersion.endsWith('/2')?470:280;
  for(const frame of frames){
    const on=path.join(root,'enabled',`frame-${frame}.png`),off=path.join(root,'disabled',`frame-${frame}.png`);
    const region=(file:string,y:number,h:number)=>sharp(file).extract({left:0,top:y,width:1080,height:h}).raw().toBuffer();
    assert.notDeepEqual(await region(on,top,height),await region(off,top,height));
    assert.deepEqual(await region(on,0,top),await region(off,0,top));
    assert.deepEqual(await region(on,top+height,1920-top-height),await region(off,top+height,1920-top-height));
  }
  report.push({templateVersion,frames,onlySubtitleRegionChanged:true,distinctHashes:true});
}
const result={fixture:true,syntheticListingAndAudio:true,demonstrationPhotos:true,newProviderCalls:0,report};
await writeFile(path.join(output,'stills-report.json'),JSON.stringify(result,null,2));
console.log(JSON.stringify(result));
