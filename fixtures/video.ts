import {createHash} from 'node:crypto';
import sharp from 'sharp';
import {VideoManifest,type VideoReport} from '../packages/contracts/src/index';
import {compileScript,scriptContext,DEFAULT_SCRIPT_MODEL} from '../packages/narration/src/index';
import {voiceSceneTiming} from '../packages/voice/src/index';
import {narrationListing,narrationBrand,fixturePlan} from './narration';
import {toneFixture} from './voice';
const sha=(b:Uint8Array)=>createHash('sha256').update(b).digest('hex');
// Les tests automatisés restent indépendants des WAV Google et des preuves locales.
export async function videoFixture(kind:'trial'|'paid'|'anonymous'='trial') {
  const listing=narrationListing(true),jobId='job-fixture',prefix=`agencies/${listing.agencyId}/jobs/${jobId}/`,files=new Map<string,Uint8Array>();
  for(const [i,p] of listing.photos.entries()) {
    const bytes=await sharp({create:{width:640+i,height:360,channels:3,background:{r:50+i*70,g:90,b:160}}}).png().toBuffer();
    Object.assign(p,{contentHash:sha(bytes),sizeBytes:bytes.length,width:640+i,height:360,objectKey:`${prefix}photos/${sha(bytes)}.png`});files.set(p.id,bytes);
  }
  const brand=kind==='anonymous'?{...narrationBrand,name:'BienVu',neutral:true as const,primaryColor:'#E1E8D9',secondaryColor:'#171714',phone:null,email:null,website:null}:{...narrationBrand},context=await scriptContext(listing,brand),script=compileScript(context,fixturePlan(context),DEFAULT_SCRIPT_MODEL);
  const bytes=toneFixture(4500),durationFrames=voiceSceneTiming(script.scenes.map(()=>4500));
  const audio=script.scenes.map((_,i)=>{const id=`audio-${i}`;files.set(id,bytes);return {id,objectKey:`${prefix}audio/${i}.wav`,sha256:sha(bytes),sizeBytes:bytes.length,mime:'audio/wav',durationMs:4500};});
  const manifest=VideoManifest.parse({schemaVersion:2,templateVersion:'bienvu-vertical/1',agencyId:listing.agencyId,jobId,listingId:listing.id,
    brand,contact:context.contact,logo:null,width:1080,height:1920,fps:30,disclosure:script.disclosure,
    rights:kind==='anonymous'?{kind,watermarked:false}:{kind,allocationId:'allocation-fixture',watermarked:kind==='trial'},
    photos:listing.photos.map(p=>({id:p.id,objectKey:p.objectKey,sha256:p.contentHash,sizeBytes:p.sizeBytes,mime:p.mime,width:p.width,height:p.height})),audio,
    scenes:script.scenes.map((s,i)=>({...s,audioAssetId:audio[i].id,durationFrames:durationFrames[i]}))});
  return {manifest,files,listing,script};
}
export function videoReport(id:string,manifest:VideoManifest,bytes:Uint8Array=new Uint8Array([1,2,3])):VideoReport {
  const frames=manifest.scenes.reduce((n,s)=>n+s.durationFrames,0),at=new Date().toISOString();
  return {id,manifestHash:id,sha256:sha(bytes),sizeBytes:bytes.length,width:1080,height:1920,fps:30,codec:'h264',audioCodec:'aac',
    durationFrames:frames,durationSeconds:frames/30,fastStart:true,watermarked:manifest.rights.watermarked,meanVolumeDb:-20,
    startedAt:at,endedAt:at,renderAndVerifySeconds:0};
}
