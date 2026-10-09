// Local proof with open IGN data and synthetic media. Never submits a customer job or a TTS/animation request.
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {createRequire} from 'node:module';
import {videoFixture} from '../fixtures/video';
import {VideoManifest,videoAssets,videoAssetFile,videoPhotoTimeline,createEditorDocument,mapDefaultZooms,mapRasterLevels,DEFAULT_VIDEO_MAP} from '../packages/contracts/src/index';
import {geocodeMap,fetchMapPlate,fetchMapBuildings,mapHash} from '../packages/maps/src/index';

const require=createRequire(new URL('../apps/renderer/package.json',import.meta.url));
if(process.platform==='darwin'){
  const rendererRequire=createRequire(require.resolve('@remotion/renderer')),
    bin=dirname(rendererRequire.resolve(`@remotion/compositor-darwin-${process.arch}/package.json`));
  process.env.BIENVU_FFPROBE_PATH??=resolve(bin,'ffprobe');process.env.BIENVU_FFMPEG_PATH??=resolve(bin,'ffmpeg');
}
const render=process.argv.includes('--render'),defaultMap=process.argv.includes('--default-map'),view=process.argv.includes('--3d')?'buildings-3d' as const:process.argv.includes('--satellite')||defaultMap?'satellite' as const:'plan' as const,
  custom=process.argv.includes('--zooms')||view==='satellite',zoomOut=process.argv.includes('--zoom-out'),{renderListingVideo,renderListingStills}=await import('../apps/renderer/src/listing-render');
const location=(await geocodeMap('Lyon 6e')).find(l=>l.sourceType==='municipality');if(!location)throw Error('MAP_PROBE_GEOCODE_FAILED');
const base=resolve(defaultMap?'evidence/local/default-video-map-2026-10-09/render':`evidence/local/maps${view==='buildings-3d'?'-3d':view==='satellite'?'-satellite':''}${custom?'-zoom':''}${zoomOut?'-out':''}`);await mkdir(base,{recursive:true,mode:0o700});
const buildingData=view==='buildings-3d'?await fetchMapBuildings(location):undefined;
const reports=[];
for(const aspectRatio of ['9:16','16:9'] as const){
  const defaults=defaultMap?{zoomStart:DEFAULT_VIDEO_MAP.zoomStart,zoomEnd:DEFAULT_VIDEO_MAP.zoomEnd}:mapDefaultZooms(view,location.precision),zooms=custom?(zoomOut?{zoomStart:defaults.zoomEnd,zoomEnd:defaults.zoomStart}:defaults):{},
    levels=custom?mapRasterLevels({view,...zooms},location.precision):[],
    {manifest:m,files}=await videoFixture('paid',4),{bytes,geometry,mime}=await fetchMapPlate(location,aspectRatio,fetch,view,levels[0]),sha256=await mapHash(bytes),
    directory=resolve(base,aspectRatio==='9:16'?'portrait':'landscape'),total=600,position=aspectRatio==='9:16'?'start':'end';
  await mkdir(directory,{recursive:true,mode:0o700});
  const settings={position,durationSeconds:4,location:geometry.location,view,...zooms},
    asset={id:'map-probe',objectKey:`agencies/${m.agencyId}/jobs/${m.jobId}/map/${sha256}.${mime==='image/jpeg'?'jpg':'png'}`,sha256,sizeBytes:bytes.length,mime,width:geometry.width,height:geometry.height};
  const editor=aspectRatio==='16:9'?createEditorDocument(m.photos.map((_,sourceOrder)=>({sourceOrder})),{title:'Une nouvelle adresse',locality:'Lyon 6e',area:65,rooms:3},
    {durationSeconds:(total/30) as 20|30|40,aspectRatio,agencyName:m.brand.name}):undefined;
  const buildings=buildingData?{id:'buildings-probe',objectKey:`agencies/${m.agencyId}/jobs/${m.jobId}/map/buildings.json`,mime:'application/json' as const,sha256:await mapHash(buildingData.bytes),sizeBytes:buildingData.bytes.length}:undefined;
  const details=[];
  for(const zoom of levels.slice(1)){
    const layer=await fetchMapPlate(location,aspectRatio,fetch,view,zoom),hash=await mapHash(layer.bytes),image={...asset,id:`map-detail-${zoom}`,objectKey:`agencies/${m.agencyId}/jobs/${m.jobId}/map/${hash}.jpg`,sha256:hash,sizeBytes:layer.bytes.length,mime:layer.mime};
    files.set(image.id,layer.bytes);details.push({zoom,asset:image});
  }
  const manifest=VideoManifest.parse({...m,templateVersion:aspectRatio==='16:9'?'bienvu-horizontal/1':m.templateVersion,
    durationSeconds:20,scenes:m.scenes.map((scene,i)=>({...scene,durationFrames:Math.floor((i+1)*total/m.scenes.length)-Math.floor(i*total/m.scenes.length)})),
    width:aspectRatio==='16:9'?1920:1080,height:aspectRatio==='16:9'?1080:1920,visualStyle:'cinematic',
    map:{settings,asset,capturedAt:new Date().toISOString(),...(buildings?{buildings}:{}),...(custom?{rasterZoom:levels[0],details}:{})},photoTimeline:videoPhotoTimeline(m.photos,total,[],120),...(editor?{editor}:{})});
  if(buildings&&buildingData)files.set(buildings.id,buildingData.bytes);
  files.set(asset.id,bytes);await writeFile(resolve(directory,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
  for(const media of videoAssets(manifest))await writeFile(resolve(directory,videoAssetFile(media)),files.get(media.id)!);
  const start=position==='start'?0:total-120;
  await renderListingStills(manifest,directory,resolve(directory,'stills'),[start,start+60,start+119,position==='start'?120:0]);
  if(render)reports.push({aspectRatio,position,report:await renderListingVideo(manifest,directory)});
}
await writeFile(resolve(base,'proof.json'),JSON.stringify({at:new Date().toISOString(),view,customZoom:custom,zoomOut,buildingCount:buildingData?.data.features.length,newAiProviderCalls:0,provider:view==='satellite'?'IGN BD ORTHO':'IGN Plan IGN et BD TOPO',source:'https://data.geopf.fr/wms-r',reports},null,2)+'\n');
console.log(JSON.stringify({directory:base,geocoder:true,formats:2,reports}));
