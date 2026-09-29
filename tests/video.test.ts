import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {mkdtemp,readFile,writeFile,mkdir,rm,readdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {VideoManifest,videoManifestHash,videoAssets,videoAssetFile} from '../packages/contracts/src/index';
import {videoFixture,videoReport} from '../fixtures/video';
import {VideoService} from '../apps/renderer/src/video-service';
import {isFastStart,parseRange,withVideoAssets} from '../apps/renderer/src/listing-render';
import {subtitleGroups,fitFont} from '../packages/video/src/layout';

test('manifeste vidéo : droit, périmètre, timeline, sources figés',async()=>{
  const {manifest:m}=await videoFixture();
  const bad=[{...m,rights:{...m.rights,watermarked:false}}, {...m,photos:m.photos.map((p,i)=>i? p:{...p,objectKey:'agencies/other/jobs/job-fixture/photo.png'})},
    {...m,remoteUrl:'https://attacker.invalid/'},{...m,scenes:m.scenes.map((s,i)=>i?s:{...s,durationFrames:1})},
    {...m,scenes:m.scenes.map((s,i)=>i?s:{...s,photoAssetId:'not-in-this-job'})},{...m,brand:{...m.brand,id:'other'}}];
  for(const value of bad)assert.equal(VideoManifest.safeParse(value).success,false);
  assert.equal(await videoManifestHash(m),await videoManifestHash(JSON.parse(JSON.stringify(m))));
  assert.notEqual(await videoManifestHash(m),await videoManifestHash({...m,brand:{...m.brand,name:'Nouvelle agence'}}));
  assert.equal((await videoFixture('paid')).manifest.rights.watermarked,false);
});
test('sous-titres et taille : toutes les phrases conservées, longues lignes adaptées',()=>{
  const words='Une description immobilière très longue avec toutes les informations utiles. '.repeat(5).trim();
  assert.equal(subtitleGroups(words).join(' '),words);
  assert.ok(subtitleGroups(words).every(s=>s.length<=100));
  assert.ok(fitFont('W'.repeat(180),832,120,66,28)<66);
  assert.deepEqual(parseRange('bytes=2-5',10),{start:2,end:5});assert.deepEqual(parseRange('bytes=-3',10),{start:7,end:9});
  assert.equal(parseRange('bytes=10-',10),false);assert.equal(parseRange('bytes=0-1,4-5',10),false);
  const atom=(type:string)=>{const b=Buffer.alloc(8);b.writeUInt32BE(8);b.write(type,4);return b;};
  assert.equal(isFastStart(Buffer.concat([atom('ftyp'),atom('moov'),atom('mdat')])),true);
  assert.equal(isFastStart(Buffer.concat([atom('ftyp'),atom('mdat'),atom('moov')])),false);
});
test('service privé : idempotence concurrente, fichiers bornés, reprise et cleanup',async t=>{
  const root=await mkdtemp(path.join(tmpdir(),'bienvu-video-'));
  t.after(()=>rm(root,{recursive:true,force:true}));
  const {manifest,files}=await videoFixture(),id=await videoManifestHash(manifest),report=videoReport(id,manifest);
  let executions=0,active:string|null=null,complete!:()=>void;
  const gate=new Promise<void>(r=>complete=r);
  const options={root,claim:(id:string)=>{if(active)return false;active=id;return true;},release:()=>{active=null;},
    run:async(directory:string)=>{executions++;await gate;await writeFile(path.join(directory,'video.mp4'),new Uint8Array([1,2,3]));return report;}};
  let service=new VideoService(options);
  const server=createServer((req,res)=>{void service.handle(req,res);});
  await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));t.after(()=>{server.closeAllConnections();server.close();});
  const addr=server.address();assert.ok(addr&&typeof addr!=='string');const base=`http://127.0.0.1:${addr.port}`;
  const call=(path:string,init?:RequestInit)=>fetch(base+path,init);
  const submit=()=>call('/videos',{method:'POST',body:JSON.stringify({id,manifest})});
  assert.equal((await submit()).status,202);
  const missing=await call(`/videos/${id}/start`,{method:'POST'});assert.equal(missing.status,400);
  for(const asset of videoAssets(manifest)) {
    const bytes=files.get(asset.id)!;
    assert.equal((await call(`/videos/${id}/assets/${asset.id}`,{method:'PUT',body:new Uint8Array(bytes)})).status,200);
  }
  const bad=await call(`/videos/${id}/assets/${manifest.photos[0].id}`,{method:'PUT',body:new Uint8Array([0])});
  assert.equal((await bad.json() as {error:string}).error,'VIDEO_ASSET_HASH_MISMATCH');
  const requests=await Promise.all([1,2].map(()=>call(`/videos/${id}/start`,{method:'POST'})));
  assert.ok(requests.every(r=>[202,409].includes(r.status)));assert.equal(executions,1);
  assert.equal((await submit()).status,202);complete();
  let state:{status:string}={status:''};
  for(let i=0;i<40;i++){state=await (await call(`/videos/${id}`)).json() as typeof state;if(state.status==='ready')break;await new Promise(r=>setTimeout(r,10));}
  assert.equal(state.status,'ready');service=new VideoService({...options,run:async()=>{throw new Error('MUST_NOT_RENDER');}});
  assert.equal((await submit()).status,200);assert.equal(executions,1);
  const range=await call(`/videos/${id}/file`,{headers:{range:'bytes=1-2'}});assert.equal(range.status,206);assert.equal((await range.arrayBuffer()).byteLength,2);
  assert.equal((await call(`/videos/${id}`,{method:'DELETE'})).status,200);
  assert.deepEqual((await readdir(path.join(root,id))).sort(),['manifest.json','state.json']);
});
test('restart après crash : échec explicite et aucun calcul relancé',async t=>{
  const root=await mkdtemp(path.join(tmpdir(),'bienvu-video-crash-'));t.after(()=>rm(root,{recursive:true,force:true}));
  const {manifest}=await videoFixture(),id=await videoManifestHash(manifest),dir=path.join(root,id);await mkdir(dir);
  await writeFile(path.join(dir,'manifest.json'),JSON.stringify(manifest));await writeFile(path.join(dir,'state.json'),JSON.stringify({id,status:'rendering'}));
  await writeFile(path.join(dir,'raw.mp4'),'incomplete');
  const service=new VideoService({root,claim:()=>{throw new Error('MUST_NOT_RUN');},release:()=>{}});
  const server=createServer((req,res)=>{void service.handle(req,res);});await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));
  t.after(()=>{server.closeAllConnections();server.close();});const addr=server.address();assert.ok(addr&&typeof addr!=='string');
  const state=await (await fetch(`http://127.0.0.1:${addr.port}/videos/${id}`)).json() as {status:string;error:string};
  assert.equal(state.status,'failed');assert.equal(state.error,'VIDEO_RENDER_INTERRUPTED');
  assert.deepEqual((await readdir(dir)).sort(),['manifest.json','state.json']);
});
test('le renderer refuse une image modifiée avant de lancer Chromium',async t=>{
  const directory=await mkdtemp(path.join(tmpdir(),'bienvu-video-assets-'));t.after(()=>rm(directory,{recursive:true,force:true}));
  const {manifest}=await videoFixture();const photo=manifest.photos[0];await writeFile(path.join(directory,videoAssetFile(photo)),new Uint8Array(photo.sizeBytes));
  await assert.rejects(withVideoAssets(manifest,directory,async()=>{throw new Error('MUST_NOT_RENDER');}),/VIDEO_ASSET_HASH_MISMATCH/);
});
