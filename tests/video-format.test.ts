import {test} from 'node:test';
import assert from 'node:assert/strict';
import {GenerationRequest,VideoManifest,VideoReport,videoManifestHash} from '../packages/contracts/src/index';
import {videoFixture,videoReport} from '../fixtures/video';
import {cameraMotion} from '../packages/video/src/camera-motion';

test('formats : anciennes requêtes inchangées, dimensions strictes et aperçu de même format',async()=>{
  for(const source of [{listingId:'listing-fixture'},{url:'https://www.orpi.com/annonce-vente-test/'}]){
    assert.deepEqual(GenerationRequest.parse(source),source);
    for(const aspectRatio of ['9:16','16:9'])assert.equal(GenerationRequest.parse({...source,aspectRatio}).aspectRatio,aspectRatio);
    for(const aspectRatio of ['1:1','horizontal',null,169])assert.equal(GenerationRequest.safeParse({...source,aspectRatio}).success,false);
  }
  const {manifest}=await videoFixture('anonymous',8),hash=await videoManifestHash(manifest);
  assert.equal(await videoManifestHash(VideoManifest.parse(manifest)),hash);
  const horizontal=VideoManifest.parse({...manifest,templateVersion:'bienvu-horizontal/1',width:1920,height:1080});
  const horizontalHash=await videoManifestHash(horizontal);assert.notEqual(horizontalHash,hash);
  for(const wrong of [{width:1920,height:1920},{width:1080,height:1080},{width:1080,height:1920},{width:1280,height:720}])
    assert.equal(VideoManifest.safeParse({...horizontal,...wrong}).success,false);
  assert.equal(VideoManifest.safeParse({...horizontal,templateVersion:'bienvu-vertical/2'}).success,false);
  const report=videoReport(horizontalHash,horizontal);
  assert.equal(VideoReport.safeParse({...report,preview:{...report,watermarked:true}}).success,true);
  assert.equal(VideoReport.safeParse({...report,preview:{...report,width:1080,height:1920,watermarked:true}}).success,false);
  assert.equal(VideoReport.safeParse({...report,height:1920}).success,false);
  // Both canvases stay covered throughout every camera motion, including fades.
  for(const cinema of [false,true])for(let index=0;index<4;index++)for(let frame=0;frame<312;frame++){
    const motion=cameraMotion(frame,300,index,true,cinema);
    assert.ok(Math.abs(motion.x)<(motion.scale-1)*1920/2);
    assert.ok(Math.abs(motion.y)<(motion.scale-1)*1080/2);
  }
});
