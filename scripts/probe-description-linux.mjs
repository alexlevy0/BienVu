// Renderer compatibility only: one real Linux still with a description reference.
// Reuses private local assets; no provider call or complete new MP4.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {readFile,writeFile,mkdir,chmod} from 'node:fs/promises';
import {resolve} from 'node:path';
import {VideoManifest,videoAssets,videoAssetFile} from '../packages/contracts/src/index.ts';
const image=process.argv[2]??'bienvu-renderer:description-20261002';
assert.match(image,/^[a-zA-Z0-9][a-zA-Z0-9./:_@-]+$/);
const source=resolve('evidence/local/video-duration/render'),folder=resolve('evidence/local/narration-description/linux');
await mkdir(folder,{recursive:true,mode:0o700});
async function docker(args,input,timeout=60_000){
  const child=spawn('docker',args,{stdio:['pipe','pipe','pipe']}),out=[],errors=[];
  child.stdout.on('data',c=>out.push(c));child.stderr.on('data',c=>errors.push(c));child.stdin.end(input);
  const timer=setTimeout(()=>child.kill('SIGKILL'),timeout);
  try{const code=await new Promise((r,j)=>{child.once('error',j);child.once('close',r);});
    if(code!==0)throw Error(Buffer.concat(errors).toString().slice(-1000)||'DOCKER_PROBE_FAILED');
    return Buffer.concat(out).toString();
  }finally{clearTimeout(timer);}
}
const [info]=JSON.parse(await docker(['image','inspect',image]));
assert.equal(info.Os,'linux');assert.equal(info.Architecture,'amd64');
const raw=JSON.parse(await readFile(source+'/manifest.json','utf8'));
Object.assign(raw.scenes[1],{kind:'gallery',copyId:'gallery/description-0',
  narrationText:'Un rafraîchissement est à prévoir pour plus de modernité.',
  captionText:'Un rafraîchissement est à prévoir pour plus de modernité.',factRefs:['description']});
raw.subtitlesEnabled=true;raw.visualStyle='editorial';
const manifest=VideoManifest.parse(raw),frame=manifest.scenes[0].durationFrames+30;
const assets=await Promise.all(videoAssets(manifest).map(async a=>({file:videoAssetFile(a),bytes:(await readFile(source+'/'+videoAssetFile(a))).toString('base64')})));
const container=`bienvu-description-linux-${Date.now()}`;
try{
  await docker(['run','-d','--rm','--name',container,'--label','bienvu.probe=narration-description','--network','none','--cpus=2','--memory=3g','--user','node','--entrypoint','sleep',image,'600'],undefined,120_000);
  const program=`
    import assert from 'node:assert/strict';
    import {mkdir,writeFile} from 'node:fs/promises';
    import {VideoManifest} from './packages/contracts/src/index.ts';
    import {renderListingStills} from './apps/renderer/src/listing-render.ts';
    let raw='';for await(const c of process.stdin)raw+=c;
    const input=JSON.parse(raw),manifest=VideoManifest.parse(input.manifest),source='/tmp/description-input';
    assert.ok(manifest.scenes.some(s=>s.factRefs.includes('description')));
    await mkdir(source,{recursive:true,mode:0o700});
    for(const a of input.assets)await writeFile(source+'/'+a.file,Buffer.from(a.bytes,'base64'),{mode:0o600});
    await renderListingStills(manifest,source,'/tmp/description-still',[input.frame]);
    console.log(JSON.stringify({at:new Date().toISOString(),descriptionContract:true,linux:true,architecture:'amd64',
      network:'none',user:process.getuid(),frame:input.frame,source:'synthetic',assetsReused:true,
      newProviderCalls:0,fullVideoRendered:false}));`;
  const stdout=await docker(['exec','-i',container,'node','--import','tsx','--input-type=module','-e',program],JSON.stringify({manifest,assets,frame}),240_000);
  const report={...JSON.parse(stdout.trim()),image:{reference:image,id:info.Id,architecture:info.Architecture}};
  await docker(['cp',`${container}:/tmp/description-still/frame-${frame}.png`,`${folder}/frame-${frame}.png`]);
  await chmod(`${folder}/frame-${frame}.png`,0o600);
  await writeFile(folder+'/report.json',JSON.stringify(report,null,2),{mode:0o600});console.log(JSON.stringify(report));
}finally{await docker(['rm','-f',container],undefined,60_000).catch(()=>{});}
