// Linux decoder/rendering check with fixture or previously paid media; no provider access.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {readFile,writeFile,mkdir,chmod} from 'node:fs/promises';
import {resolve} from 'node:path';
import {VideoManifest,videoAssets,videoAssetFile} from '../packages/contracts/src/index.ts';

const source=resolve(process.argv[3]??'evidence/local/sprint-06/runway-mixed-local');
const folder=resolve(process.argv[4]??'evidence/local/runway/linux');
const image=process.argv[2]??'bienvu-renderer:runway-20261001';
assert.match(image,/^[a-zA-Z0-9][a-zA-Z0-9./:_@-]+$/);
await mkdir(folder,{recursive:true,mode:0o700});
async function docker(args,input,timeout=30_000){
  const child=spawn('docker',args,{stdio:['pipe','pipe','pipe']}),out=[],errors=[];
  child.stdout.on('data',c=>out.push(c));child.stderr.on('data',c=>errors.push(c));child.stdin.end(input);
  let expired=false;const timer=setTimeout(()=>{expired=true;child.kill('SIGKILL');},timeout);
  try{const code=await new Promise((r,j)=>{child.once('error',j);child.once('close',r);});
    if(code!==0)throw Error(expired?'DOCKER_PROBE_TIMEOUT':Buffer.concat(errors).toString().slice(-1500)||'DOCKER_PROBE_FAILED');
    return Buffer.concat(out).toString();
  }finally{clearTimeout(timer);}
}
const [info]=JSON.parse(await docker(['image','inspect',image]));
assert.equal(info.Os,'linux');assert.equal(info.Architecture,'amd64');
const memory=Number((await docker(['info','--format','{{.MemTotal}}'])).trim());
assert.ok(memory>=3*1024**3,'LINUX_PROBE_REQUIRES_3_GIB');
const manifest=VideoManifest.parse(JSON.parse(await readFile(`${source}/manifest.json`,'utf8')));
const existingProof=JSON.parse(await readFile(`${source}/report.json`,'utf8').catch(()=> '{}'));
const realRunwayClipReused=existingProof.realRunwayClipReused===true;
assert.equal(manifest.photoAnimations.length,1);
const assets=await Promise.all(videoAssets(manifest).map(async asset=>({file:videoAssetFile(asset),
  bytes:(await readFile(`${source}/${videoAssetFile(asset)}`)).toString('base64')})));
// Bytes travel over stdin into this disposable container, without changing
// the host's private file permissions or bypassing the image's node user.
const container=`bienvu-runway-linux-probe-${Date.now()}`;
try{
  await docker(['run','-d','--rm','--name',container,'--label','bienvu.probe=runway-linux',
    '--network','none','--cpus=2','--memory=3g','--entrypoint','sleep',image,'600'],undefined,120_000);
  const program=`
    import assert from 'node:assert/strict';
    import {mkdir,writeFile} from 'node:fs/promises';
    import {withVideoAssets,renderListingStills} from './apps/renderer/src/listing-render.ts';
    let raw='';for await(const c of process.stdin)raw+=c;
    const {manifest,assets,realRunwayClipReused}=JSON.parse(raw),source='/tmp/animation-input',output='/tmp/animation-stills';
    await mkdir(source,{recursive:true,mode:0o700});
    for(const a of assets)await writeFile(source+'/'+a.file,Buffer.from(a.bytes,'base64'),{mode:0o600});
    await withVideoAssets(manifest,source,async props=>{
      const id=manifest.photoAnimations[0].asset.id;
      const response=await fetch(props.media[id],{headers:{Range:'bytes=0-31'}});
      assert.equal(response.status,206);assert.equal((await response.arrayBuffer()).byteLength,32);
    });
    const frames=manifest.visualStyle==='cinematic'?[30,156,manifest.scenes.reduce((n,s)=>n+s.durationFrames,0)-10]:[30,156];await renderListingStills(manifest,source,output,frames);
    console.log(JSON.stringify({at:new Date().toISOString(),linux:true,fixtures:true,simulatedRunwayClip:!realRunwayClipReused,realRunwayClipReused,
      network:'none',user:process.getuid(),cpuLimit:2,memory:'3g',newProviderCalls:0,
      fullVideoRendered:false,assetsValidated:true,rangeValidated:true,frames}));
  `;
  const stdout=await docker(['exec','-i',container,'node','--import','tsx','--input-type=module','-e',program],
    JSON.stringify({manifest,assets,realRunwayClipReused}),320_000);
  const report={...JSON.parse(stdout.trim()),image:{reference:image,id:info.Id,architecture:info.Architecture}};
  for(const frame of report.frames){await docker(['cp',`${container}:/tmp/animation-stills/frame-${frame}.png`,`${folder}/frame-${frame}.png`]);await chmod(`${folder}/frame-${frame}.png`,0o600);}
  await writeFile(`${folder}/report.json`,JSON.stringify(report,null,2)+'\n',{mode:0o600});
  console.log(JSON.stringify(report));
}finally{await docker(['rm','-f',container],undefined,60_000).catch(()=>{});}
