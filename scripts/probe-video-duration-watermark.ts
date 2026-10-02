// Native Linux ARM64 FFmpeg on an ARM Mac; the production image is separately
// verified as AMD64. Exercise the actual renderer helper without x86 emulation.
import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {VideoManifest,videoManifestHash} from '../packages/contracts/src/index';
import {createWatermarkedPreview} from '../apps/renderer/src/listing-render';
const root=resolve('evidence/local/video-duration'),source=join(root,'render'),directory=join(root,'native-linux');
await mkdir(directory,{recursive:true,mode:0o700});
const image='bienvu-ffmpeg:duration-test-20261002',probe=crypto.randomUUID();
for(const tool of ['ffmpeg','ffprobe']){
  const file=join(directory,`${tool}.mjs`);
  const args=['run','--rm','--label',`bienvu.duration-probe=${probe}`,'--platform','linux/arm64','--network','none','--cpus','2','--memory','768m',
    '--user',`${process.getuid!()}:${process.getgid!()}`,'--mount',`type=bind,src=${root},dst=${root}`,'-w',directory,image,tool];
  await writeFile(file,`#!${process.execPath}\nimport {spawnSync} from 'node:child_process';\nconst result=spawnSync('/usr/local/bin/docker',[...${JSON.stringify(args)},...process.argv.slice(2)],{stdio:'inherit'});process.exit(result.status??1);\n`,{mode:0o700});
  process.env[tool==='ffmpeg'?'BIENVU_FFMPEG_PATH':'BIENVU_FFPROBE_PATH']=file;
}
const manifest=VideoManifest.parse(JSON.parse(await readFile(join(source,'manifest.json'),'utf8')));
assert.equal(manifest.durationSeconds,40);
try{
const report=await createWatermarkedPreview(join(source,'video.mp4'),directory,await videoManifestHash(manifest),1200,true);
assert.equal(report.durationFrames,1200);assert.equal(report.audioCodec,'aac');assert.equal(report.watermarked,true);
await writeFile(join(directory,'report.json'),JSON.stringify({at:new Date().toISOString(),linux:true,architecture:'arm64',
  productionArchitecture:'amd64',actualRendererHelper:true,fullVideoRendered:false,watermarkProduced:true,newProviderCalls:0,report},null,2),{mode:0o600});
console.log(JSON.stringify({passed:true,linux:true,architecture:'arm64',newProviderCalls:0,report}));

}finally{const ids=execFileSync('/usr/local/bin/docker',['ps','-q','--filter',`label=bienvu.duration-probe=${probe}`],{encoding:'utf8'}).trim().split(/\s+/).filter(Boolean);if(ids.length)execFileSync('/usr/local/bin/docker',['rm','-f',...ids],{stdio:'ignore'});}
