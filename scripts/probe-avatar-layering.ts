// Real Remotion frames with synthetic media only. No import, model call or credit debit.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {dirname,join,resolve} from 'node:path';
import sharp from 'sharp';
import {VideoManifest,videoAssetFile,videoPhotoTimeline,defaultAvatarCustomization,createEditorDocument,type VideoAsset} from '../packages/contracts/src/index';
import {voiceSceneTiming} from '../packages/voice/src/index';
import {videoFixture} from '../fixtures/video';
import {renderListingStills} from '../apps/renderer/src/listing-render';

const require=createRequire(new URL('../apps/renderer/package.json',import.meta.url)),local=createRequire(require.resolve('@remotion/renderer')),
  bin=dirname(local.resolve(`@remotion/compositor-darwin-${process.arch}/package.json`)),exec=promisify(execFile),
  directory=resolve('evidence/local/avatar-layering'),hash=(bytes:Uint8Array)=>createHash('sha256').update(bytes).digest('hex');
process.env.BIENVU_FFMPEG_PATH=join(bin,'ffmpeg');process.env.BIENVU_FFPROBE_PATH=join(bin,'ffprobe');
await mkdir(directory,{recursive:true});
const clipFile=join(directory,'synthetic-avatar.mp4'),portraitFile=join(directory,'synthetic-avatar.png');
await sharp({create:{width:720,height:1280,channels:3,background:'#ff0000'}}).png().toFile(portraitFile);
await exec(join(bin,'ffmpeg'),['-v','error','-loop','1','-framerate','30','-i',portraitFile,'-t','4.5','-an','-c:v','libx264','-pix_fmt','yuv420p','-y',clipFile],{cwd:bin,timeout:30000});
const clipBytes=await readFile(clipFile),clip:VideoAsset={id:'synthetic-avatar',objectKey:'agencies/agency-fixture/jobs/job-fixture/avatar.mp4',
  sha256:hash(clipBytes),sizeBytes:clipBytes.length,mime:'video/mp4',width:720,height:1280,durationMs:4500};
await writeFile(join(directory,videoAssetFile(clip)),clipBytes);
const report:unknown[]=[],contactSheets:Buffer[]=[];
for(const aspectRatio of ['9:16','16:9'] as const){
  const {manifest:source,files,listing}=await videoFixture('paid',8),width=aspectRatio==='16:9'?1920:1080,height=aspectRatio==='16:9'?1080:1920,
    timing=voiceSceneTiming(source.audio.map(a=>a.durationMs!),30),
    base=VideoManifest.parse({...source,width,height,durationSeconds:30,scenes:source.scenes.map((s,i)=>({...s,durationFrames:timing[i]})),
      photoTimeline:videoPhotoTimeline(source.photos,900),templateVersion:aspectRatio==='16:9'?'bienvu-horizontal/1':'bienvu-vertical/2'});
  for(const asset of [...base.photos,...base.audio])await writeFile(join(directory,videoAssetFile(asset)),files.get(asset.id)!);
  const settings={...defaultAvatarCustomization('synthetic-avatar'),appearance:'card' as const,width:100,x:50,y:50,moments:'both' as const};
  let start=0;
  const clips=base.scenes.flatMap((scene,i)=>{const from=start;start+=scene.durationFrames;if(i!==0&&i!==base.scenes.length-1)return [];
    const audio=base.audio.find(a=>a.id===scene.audioAssetId)!;return [{id:`avatar-${i}`,moment:i===0?'intro' as const:'outro' as const,
      startFrame:from,durationFrames:135,audioAssetId:audio.id,audioSha256:audio.sha256,lookId:settings.lookId,engine:settings.engine,transparent:false,asset:clip}];});
  const variants:{name:string;manifest:VideoManifest;frame:number;region:{left:number;top:number;width:number;height:number}}[]=[];
  for(const visualStyle of ['editorial','minimal','cinematic'] as const){
    const bottom=aspectRatio==='16:9'?(visualStyle==='cinematic'?80:480):visualStyle==='cinematic'?520:visualStyle==='minimal'?780:675;
    variants.push({name:visualStyle,manifest:VideoManifest.parse({...base,visualStyle}),frame:30,
      region:{left:Math.round(width*.22),top:Math.max(0,height-bottom-230),width:Math.round(width*.56),height:240}});
  }
  if(aspectRatio==='9:16'){
    const {manifest:legacy,files:legacyFiles}=await videoFixture('paid');
    for(const asset of [...legacy.photos,...legacy.audio])await writeFile(join(directory,videoAssetFile(asset)),legacyFiles.get(asset.id)!);
    variants.push({name:'legacy',manifest:legacy,frame:30,region:{left:180,top:1290,width:720,height:250}});
  }
  const editor=createEditorDocument(listing.photos,listing,{aspectRatio,durationSeconds:base.durationSeconds??30,agencyName:'Agence de recette'});
  variants.push({name:'editor',manifest:VideoManifest.parse({...base,editor}),frame:30,
    region:{left:Math.round(width*.22),top:Math.round(height*.58)-100,width:Math.round(width*.56),height:200}});
  const mapBytes=await sharp({create:{width:width*2,height:height*2,channels:3,background:'#486C89'}}).png().toBuffer(),mapAsset:VideoAsset={
    id:`map-${width}`,objectKey:`agencies/agency-fixture/jobs/job-fixture/map-${width}.png`,sha256:hash(mapBytes),sizeBytes:mapBytes.length,mime:'image/png',width:width*2,height:height*2};
  await writeFile(join(directory,videoAssetFile(mapAsset)),mapBytes);
  variants.push({name:'map',manifest:VideoManifest.parse({...base,photoTimeline:videoPhotoTimeline(base.photos,780),map:{settings:{position:'start',durationSeconds:4,view:'plan',
    location:{latitude:45.75,longitude:4.85,label:'Lyon',precision:'exact',sourceType:'manual'}},asset:mapAsset,capturedAt:new Date().toISOString()}}),frame:30,
    region:{left:Math.round(width*.22),top:Math.round(height*.27)-100,width:Math.round(width*.56),height:200}});
  const outroStart=base.scenes.slice(0,-1).reduce((n,s)=>n+s.durationFrames,0);
  variants.push({name:'cinematic-outro',manifest:VideoManifest.parse({...base,visualStyle:'cinematic'}),frame:outroStart+30,
    region:aspectRatio==='9:16'?{left:240,top:490,width:600,height:200}:{left:430,top:70,width:1050,height:240}});
  for(const variant of variants){
    const label=`${width}-${variant.name}`,without=join(directory,label,'without'),withAvatar=join(directory,label,'with');
    await renderListingStills(variant.manifest,directory,without,[variant.frame]);
    const manifest=VideoManifest.parse({...variant.manifest,avatar:{settings,clips:clips.filter(c=>variant.frame>=c.startFrame&&variant.frame<c.startFrame+c.durationFrames)}});
    await renderListingStills(manifest,directory,withAvatar,[variant.frame]);
    const baseline=await sharp(join(without,`frame-${variant.frame}.png`)).removeAlpha().raw().toBuffer(),actual=await sharp(join(withAvatar,`frame-${variant.frame}.png`)).removeAlpha().raw().toBuffer();
    let textPixels=0,preserved=0,avatarPixels=0;
    for(let y=variant.region.top;y<variant.region.top+variant.region.height;y++)for(let x=variant.region.left;x<variant.region.left+variant.region.width;x++){
      const offset=(y*width+x)*3;
      if(baseline[offset]>248&&baseline[offset+1]>248&&baseline[offset+2]>248){textPixels++;
        if(actual[offset]>240&&actual[offset+1]>240&&actual[offset+2]>240)preserved++;}
    }
    for(let offset=0;offset<actual.length;offset+=3)if(actual[offset]>220&&actual[offset+1]<35&&actual[offset+2]<35)avatarPixels++;
    assert.ok(textPixels>100,`${label}: fixture has readable text`);
    assert.ok(preserved/textPixels>.98,`${label}: avatar obscures text (${preserved}/${textPixels})`);
    assert.ok(avatarPixels>10000,`${label}: avatar remains visible above the background`);
    report.push({label,textPixels,preserved,avatarPixels,passed:true});
    contactSheets.push(await sharp(join(withAvatar,`frame-${variant.frame}.png`)).resize(216,384,{fit:'contain',background:'#e1e9da'}).png().toBuffer());
    console.log(JSON.stringify(report.at(-1)));
  }
}
const columns=5,rows=Math.ceil(contactSheets.length/columns);
await sharp({create:{width:216*columns,height:384*rows,channels:3,background:'#e1e9da'}}).composite(contactSheets.map((input,i)=>({input,left:(i%columns)*216,top:Math.floor(i/columns)*384})))
  .png().toFile(join(directory,'contact-sheet.png'));
await writeFile(join(directory,'report.json'),JSON.stringify({at:new Date().toISOString(),newProviderCalls:0,syntheticMedia:true,checks:report},null,2));
