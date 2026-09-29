// Real Remotion + FFmpeg, local synthetic images/audio. Zero external providers.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import {videoFixture} from '../fixtures/video';
import {videoAssets,videoAssetFile} from '../packages/contracts/src/index';
import {renderListingVideo} from '../apps/renderer/src/listing-render';
const exec=promisify(execFile),require=createRequire(new URL('../apps/renderer/package.json',import.meta.url));
const directory=path.resolve('evidence/local/anonymous-video');await mkdir(directory,{recursive:true});
const dockerOption=process.argv.indexOf('--docker-ffmpeg');
if(dockerOption>=0){
  const image=process.argv[dockerOption+1];if(!image||!/^[a-zA-Z0-9][a-zA-Z0-9_./:-]+$/.test(image))throw Error('Provide an existing local renderer image tag');
  const docker=process.env.BIENVU_DOCKER_PATH??(process.platform==='darwin'?'/Applications/Docker.app/Contents/Resources/bin/docker':'docker');
  const inspected=await exec(docker,['image','inspect','--format','{{.Id}} {{.Os}}/{{.Architecture}}',image],{timeout:15_000});
  const [imageId,platform]=inspected.stdout.trim().split(' ');
  if(!/^sha256:[a-f0-9]{64}$/.test(imageId)||!/^linux\/(amd64|arm64)$/.test(platform))throw Error('LOCAL_LINUX_IMAGE_REQUIRED');
  const quote=(value:string)=>"'"+value.replaceAll("'","'\\''")+"'";
  const bin=path.join(directory,'bin');await mkdir(bin,{recursive:true});
  for(const program of ['ffmpeg','ffprobe']){
    const wrapper=path.join(bin,program);
    await writeFile(wrapper,`#!/bin/sh\nexec ${quote(docker)} run --pull=never --platform ${platform} --rm --network none --cpus=2 --memory=1g --user=0 --entrypoint /usr/bin/${program} -v ${quote(directory+':'+directory)} ${quote(imageId)} "$@"\n`,{mode:0o700});
    process.env[program==='ffmpeg'?'BIENVU_FFMPEG_PATH':'BIENVU_FFPROBE_PATH']=wrapper;
  }
}else if(process.platform==='darwin'){
  const local=createRequire(require.resolve('@remotion/renderer')),bin=path.dirname(local.resolve(`@remotion/compositor-darwin-${process.arch}/package.json`));
  process.env.BIENVU_FFMPEG_PATH??=path.join(bin,'ffmpeg');process.env.BIENVU_FFPROBE_PATH??=path.join(bin,'ffprobe');
}
const ffmpeg=process.env.BIENVU_FFMPEG_PATH??'ffmpeg';
const filters=await exec(ffmpeg,['-hide_banner','-filters'],{timeout:30_000,cwd:path.dirname(ffmpeg)});
if(!/\boverlay\b/.test(filters.stdout))throw Error('Full FFmpeg with overlay required: set BIENVU_FFMPEG_PATH/BIENVU_FFPROBE_PATH or use --docker-ffmpeg <existing-image>');
const fixture=await videoFixture('anonymous');
for(const asset of videoAssets(fixture.manifest))await writeFile(path.join(directory,videoAssetFile(asset)),fixture.files.get(asset.id)!);
await writeFile(path.join(directory,'manifest.json'),JSON.stringify(fixture.manifest,null,2));
const report=await renderListingVideo(fixture.manifest,directory);assert.equal(report.watermarked,false);assert.equal(report.preview?.watermarked,true);assert.notEqual(report.sha256,report.preview?.sha256);
assert.equal((await readFile(path.join(directory,'progress.txt'),'utf8')).trim(),'95');
const frames=[0,Math.floor(report.durationFrames/2),report.durationFrames-1],comparisons=[];
for(const frame of frames){const samples=[];
  for(const variant of ['video','preview']){
    const file=path.join(directory,`${variant}-${frame}.png`);
    await exec(ffmpeg,['-v','error','-i',path.join(directory,`${variant}.mp4`),'-vf',`select=eq(n\\,${frame})`,'-frames:v','1','-y',file],{timeout:30_000,cwd:path.dirname(ffmpeg)});
    samples.push(await sharp(file).extract({left:210,top:690,width:660,height:112}).removeAlpha().raw().toBuffer());
  }
  let delta=0;for(let i=0;i<samples[0].length;i++)delta+=Math.abs(samples[0][i]-samples[1][i]);delta/=samples[0].length;
  assert.ok(delta>20,`Watermark absent at frame ${frame}: ${delta}`);comparisons.push({frame,meanPixelDifference:delta});
}
const audioHashes=[];
for(const variant of ['video','preview']){
  const {stdout}=await exec(ffmpeg,['-v','error','-i',path.join(directory,`${variant}.mp4`),'-map','0:a:0','-c:a','copy','-f','adts','pipe:1'],{encoding:'buffer',maxBuffer:2_000_000,timeout:30_000,cwd:path.dirname(ffmpeg)});
  audioHashes.push(createHash('sha256').update(stdout).digest('hex'));
}
assert.equal(audioHashes[0],audioHashes[1]);
const proof={at:new Date().toISOString(),environment:'local-remotion-ffmpeg',providers:'synthetic fixtures',externalCalls:0,newPaidCalls:0,
  masterSeconds:report.renderAndVerifySeconds,derivativeSeconds:report.preview!.renderAndVerifySeconds,durationSeconds:report.durationSeconds,
  meanVolumeDb:report.meanVolumeDb,identicalAAC:true,comparisons,masterSha256:report.sha256,previewSha256:report.preview!.sha256};
await writeFile(path.join(directory,'verification.json'),JSON.stringify(proof,null,2));console.log(JSON.stringify(proof));
