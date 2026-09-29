import {readFile,writeFile,mkdir,copyFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import sharp from 'sharp';
import {PreparedNarration,VideoManifest,videoAssetFile,type VideoAsset} from '../packages/contracts/src/index';
import {narrationBrand,narrationListing} from '../fixtures/narration';
import {compileScript,DEFAULT_SCRIPT_MODEL,scriptContext} from '../packages/narration/src/index';

const hash=(bytes:Uint8Array)=>createHash('sha256').update(bytes).digest('hex');
export async function makeVideoFixture(kind:'trial'|'paid'='trial', agencyId=`s06-${kind}`,jobId=`job-video-${kind}`) {
  const directory=path.resolve(`evidence/local/sprint-06/${jobId}`);await mkdir(directory,{recursive:true,mode:0o700});
  const source=path.resolve('evidence/remote/sprint-05/naturalness'), proof=JSON.parse(await readFile(path.join(source,'run.json'),'utf8'));
  if(proof.providerMock===true || proof.humanListening?.status!=='validated')throw new Error('VALIDATED_VOICE_REQUIRED');
  const prepared=PreparedNarration.parse(proof.response.result),listing=narrationListing(true);
  listing.id=`listing-${jobId}`;listing.agencyId=agencyId;
  const prefix=`agencies/${agencyId}/jobs/${jobId}/`;
  const photos:VideoAsset[]=[];
  for(const [index,name] of ['interieur','riviera','maison'].entries()) {
    const bytes=await sharp(`apps/web/public/images/landing/${name}.webp`).jpeg({quality:90}).toBuffer();
    const meta=await sharp(bytes).metadata();
    const asset:VideoAsset={id:`photo-${index+1}`,objectKey:`${prefix}photos/${hash(bytes)}.jpg`,sha256:hash(bytes),
      sizeBytes:bytes.length,mime:'image/jpeg',width:meta.width!,height:meta.height!};
    photos.push(asset);await writeFile(path.join(directory,videoAssetFile(asset)),bytes,{mode:0o600});
  }
  listing.photos=photos.map((p,i)=>({id:p.id,agencyId,listingId:listing.id,sourceUrl:null,objectKey:p.objectKey,contentHash:p.sha256,
    width:p.width!,height:p.height!,mime:'image/jpeg',sizeBytes:p.sizeBytes,sourceOrder:i}));
  const logoBytes=await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><path d="M34 96V34h62M160 34h62v62M222 160v62h-62M96 222H34v-62" fill="none" stroke="${kind==='trial'?'#ffffff':'#142c24'}" stroke-width="14"/><text x="128" y="154" font-family="sans-serif" font-size="72" font-weight="700" text-anchor="middle" fill="${kind==='trial'?'#ffffff':'#142c24'}">BV</text></svg>`)).png().toBuffer();
  const logo:VideoAsset={id:`logo-${agencyId}`,objectKey:`${prefix}brand/${hash(logoBytes)}.png`,sha256:hash(logoBytes),sizeBytes:logoBytes.length,
    mime:'image/png',width:256,height:256};
  await writeFile(path.join(directory,videoAssetFile(logo)),logoBytes,{mode:0o600});
  const brand={...narrationBrand,id:agencyId,ownerUserId:`owner-${agencyId}`,logoAssetId:logo.id};
  const ctx=await scriptContext(listing,brand),script=compileScript(ctx,{scenes:prepared.script.scenes.map(s=>({copyId:s.copyId,photoAssetId:s.photoAssetId}))},DEFAULT_SCRIPT_MODEL);
  if(script.scenes.some((s,i)=>s.narrationText!==prepared.script.scenes[i].narrationText))throw new Error('CACHED_VOICE_TEXT_MISMATCH');
  const audio:VideoAsset[]=[];
  for(const [i,original] of prepared.audio.entries()) {
    const bytes=await readFile(path.join(source,`scene-${i+1}.wav`));
    if(bytes.length!==original.sizeBytes||hash(bytes)!==original.sha256)throw new Error('CACHED_VOICE_HASH_MISMATCH');
    const a:VideoAsset={id:`audio-${i+1}`,objectKey:`${prefix}audio/${original.sha256}.wav`,sha256:original.sha256,
      sizeBytes:bytes.length,mime:'audio/wav',durationMs:original.durationMs};
    audio.push(a);await copyFile(path.join(source,`scene-${i+1}.wav`),path.join(directory,videoAssetFile(a)));
  }
  const manifest=VideoManifest.parse({schemaVersion:2,templateVersion:'bienvu-vertical/1',agencyId,jobId,listingId:listing.id,brand,contact:ctx.contact,
    logo,width:1080,height:1920,fps:30,disclosure:script.disclosure,rights:{kind,allocationId:`allocation-${jobId}`,watermarked:kind==='trial'},
    photos,audio,scenes:script.scenes.map((s,i)=>({...s,audioAssetId:audio[i].id,durationFrames:prepared.durationFrames[i]}))});
  await writeFile(path.join(directory,'manifest.json'),JSON.stringify(manifest,null,2)+'\n',{mode:0o600});
  await writeFile(path.join(directory,'fixture.json'),JSON.stringify({syntheticListing:true,syntheticImages:true,voice:'existing_real_google_audio',
    sourceListingId:prepared.script.listingId,sourceProviderMock:false,newTtsCalls:0,newTextCalls:0,listing,script},null,2)+'\n',{mode:0o600});
  return {directory,manifest};
}
