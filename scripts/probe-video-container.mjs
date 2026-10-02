// Recette du vrai serveur Linux, sans réseau extérieur ni nouveau fournisseur.
// L'image doit avoir été construite auparavant avec le lockfile du dépôt.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import {readFile,writeFile,mkdir,chmod} from 'node:fs/promises';
import {resolve} from 'node:path';
import {VideoManifest,videoManifestHash,videoAssets,videoAssetFile} from '../packages/contracts/src/index.ts';

const directory=resolve(process.argv[2]??'evidence/local/sprint-06/job-video-trial');
const image=process.argv[3]??'bienvu-video:sprint-06-final';
assert.match(image,/^[a-zA-Z0-9][a-zA-Z0-9./:_@-]+$/);
const manifest=VideoManifest.parse(JSON.parse(await readFile(`${directory}/manifest.json`,'utf8')));
const id=await videoManifestHash(manifest),folder=resolve(process.argv[4]??'evidence/local/sprint-06/container');
await mkdir(folder,{recursive:true,mode:0o700});
const env={...process.env,RENDER_TOKEN:randomBytes(32).toString('hex')};
async function docker(args,input,timeout=60_000) {
  const child=spawn('docker',args,{env,stdio:['pipe','pipe','pipe']}),chunks=[],errors=[];
  child.stdout.on('data',c=>chunks.push(c));child.stderr.on('data',c=>errors.push(c));child.stdin.end(input);
  let expired=false;const timer=setTimeout(()=>{expired=true;child.kill('SIGKILL');},timeout);
  try {const code=await new Promise((r,j)=>{child.once('error',j);child.once('close',r);});
    if(code!==0)throw new Error(expired?'LOCAL_CONTAINER_PROBE_TIMEOUT':Buffer.concat(errors).toString().slice(-1000)||'DOCKER_FAILED');
    return Buffer.concat(chunks).toString();
  }finally{clearTimeout(timer);}
}
const [imageInfo]=JSON.parse(await docker(['image','inspect',image]));
assert.equal(imageInfo.Architecture,'amd64','BUILD_IMAGE_WITH_PLATFORM_LINUX_AMD64');assert.equal(imageInfo.Os,'linux');
const availableMemory=Number((await docker(['info','--format','{{.MemTotal}}'])).trim());
assert.ok(availableMemory>=6*1024**3,'LOCAL_DOCKER_VM_NEEDS_6_GIB_FOR_THIS_PROBE');
const container=(await docker(['run','-d','--rm','--network','none','--cpus=1','--memory=6g','--env','RENDER_TOKEN',
  '-v',`${directory}:/input:ro`,image])).trim();
try {
  // Le script fixe les routes et ne transmet jamais le secret dans la CLI.
  const program=`
    import assert from 'node:assert/strict';
    import {readFile,writeFile} from 'node:fs/promises';
    import {createHash} from 'node:crypto';
    let raw='';for await(const c of process.stdin)raw+=c;const {id,manifest,assets}=JSON.parse(raw);
    const call=(route,init={})=>fetch('http://127.0.0.1:8080'+route,{...init,signal:AbortSignal.timeout(60000),headers:{Authorization:'Bearer '+process.env.RENDER_TOKEN,...init.headers}});
    for(let n=0;n<120;n++){try{if((await call('/health')).ok)break;}catch{}await new Promise(r=>setTimeout(r,500));}
    assert.equal((await fetch('http://127.0.0.1:8080/health')).status,401);
    const start=performance.now();
    const replies=await Promise.all([1,2].map(()=>call('/videos',{method:'POST',body:JSON.stringify({id,manifest})})));
    assert.ok(replies.every(r=>r.status===202));
    const acceptanceMs=performance.now()-start;
    for(const {asset,file} of assets){
      const r=await call('/videos/'+id+'/assets/'+asset.id,{method:'PUT',body:await readFile('/input/'+file)});assert.equal(r.status,200);
    }
    assert.equal((await call('/videos/'+id+'/start',{method:'POST'})).status,202);
    let state;for(let n=0;n<120;n++){state=await (await call('/videos/'+id)).json();if(['failed','ready'].includes(state.status))break;await new Promise(r=>setTimeout(r,5000));}
    assert.equal(state.status,'ready',JSON.stringify(state));
    const bytes=Buffer.from(await (await call('/videos/'+id+'/file')).arrayBuffer());
    assert.equal(createHash('sha256').update(bytes).digest('hex'),state.report.sha256);
    const range=await call('/videos/'+id+'/file',{headers:{Range:'bytes=0-1023'}});assert.equal(range.status,206);assert.equal((await range.arrayBuffer()).byteLength,1024);
    assert.equal((await call('/videos',{method:'POST',body:JSON.stringify({id,manifest})})).status,200);
    await writeFile('/tmp/video-probe.mp4',bytes,{mode:0o600});
    assert.equal((await call('/videos/'+id,{method:'DELETE'})).status,200);
    console.log(JSON.stringify({at:new Date().toISOString(),source:'docker-linux-amd64-local',network:'none',cpuLimit:1,memory:'6g',syntheticListing:true,syntheticPhotos:true,newProviderCalls:0,acceptanceMs,rangeVerified:true,readyReplay:true,report:state.report}));
  `;
  const assets=videoAssets(manifest).map(asset=>({asset,file:videoAssetFile(asset)}));
  const output=await docker(['exec','-i',container,'node','--input-type=module','-e',program],JSON.stringify({id,manifest,assets}),650_000);
  const report={...JSON.parse(output.trim()),image:{reference:image,id:imageInfo.Id,architecture:imageInfo.Architecture}};
  await writeFile(`${folder}/report.json`,JSON.stringify(report,null,2)+'\n',{mode:0o600});
  await docker(['cp',`${container}:/tmp/video-probe.mp4`,`${folder}/video.mp4`]);await chmod(`${folder}/video.mp4`,0o600);
  console.log(JSON.stringify(report));
}finally {
  try {await writeFile(`${folder}/container.log`,await docker(['logs',container]),{mode:0o600});}
  finally {await docker(['stop','-t','2',container]);}
}
