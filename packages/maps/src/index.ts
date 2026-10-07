import {MapLocation,MapSearch,MapPreviewRequest,MapBuildings,mapPublicLocation,mapPlaneGeometry,mapRasterLevels,type MapImageInfo,type MapView,type VideoMap} from '@bienvu/contracts';
import type {Database} from '@bienvu/db';
import {imageSize} from 'image-size';

// Workers support manual redirects; reject all non-2xx responses rather than following a new host.
export class MapFailure extends Error {
  constructor(readonly code:'MAP_UNAVAILABLE'|'MAP_RATE_LIMIT'){super(code);}
}
export interface MapBucket {
  get(key:string):Promise<{size:number;arrayBuffer():Promise<ArrayBuffer>}|null>;
  put(key:string,value:Uint8Array,options:{httpMetadata:{contentType:string}}):Promise<unknown>;
}
export type MapEnvironment={DB:Database;MEDIA:MapBucket};
export const mapHash=async(bytes:Uint8Array)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new Uint8Array(bytes))),n=>n.toString(16).padStart(2,'0')).join('');
async function bounded(response:Response,limit:number){
  if(!response.ok||!response.body)throw new MapFailure('MAP_UNAVAILABLE');
  if(Number(response.headers.get('content-length')??0)>limit){await response.body.cancel();throw new MapFailure('MAP_UNAVAILABLE');}
  const reader=response.body.getReader(),parts:Uint8Array[]=[];let size=0;
  try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;
    if(size>limit){await reader.cancel();throw new MapFailure('MAP_UNAVAILABLE');}parts.push(value);}}
  finally{reader.releaseLock();}
  const bytes=new Uint8Array(size);let offset=0;for(const part of parts){bytes.set(part,offset);offset+=part.length;}return bytes;
}
export async function geocodeMap(query:string,transport:typeof fetch=fetch):Promise<MapLocation[]>{
  const {query:q}=MapSearch.parse({query}),url=new URL('https://data.geopf.fr/geocodage/search');
  url.search=new URLSearchParams({q,limit:'5',index:'address'}).toString();
  try{
    const response=await transport(url,{redirect:'manual',signal:AbortSignal.timeout(10000)});
    const json=JSON.parse(new TextDecoder().decode(await bounded(response,100_000))) as {features?:unknown[]};
    if(!Array.isArray(json.features))throw new MapFailure('MAP_UNAVAILABLE');
    const locations:MapLocation[]=[];
    for(const item of json.features.slice(0,5)){
      const f=item as {geometry?:{type?:string;coordinates?:number[]};properties?:{label?:string;type?:string}};
      if(f.geometry?.type!=='Point'||!Array.isArray(f.geometry.coordinates)||!f.properties)continue;
      const type=f.properties.type,sourceType=type==='housenumber'?'housenumber':type==='street'?'street':'municipality';
      const parsed=MapLocation.safeParse({latitude:f.geometry.coordinates[1],longitude:f.geometry.coordinates[0],label:f.properties.label,
        sourceType,precision:sourceType==='housenumber'?'exact':'approximate'});
      if(parsed.success)locations.push(parsed.data);
    }
    return locations;
  }catch(error){if(error instanceof MapFailure)throw error;throw new MapFailure('MAP_UNAVAILABLE');}
}
export async function fetchMapPlate(location:MapLocation,aspectRatio:'9:16'|'16:9',transport:typeof fetch=fetch,view:MapView='plan',plateZoom?:number){
  const geometry=mapPlaneGeometry(location,aspectRatio,view,plateZoom),url=new URL('https://data.geopf.fr/wms-r');
  url.search=new URLSearchParams({SERVICE:'WMS',VERSION:'1.3.0',REQUEST:'GetMap',LAYERS:view==='satellite'?'ORTHOIMAGERY.ORTHOPHOTOS':'GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2',
    STYLES:'normal',CRS:'EPSG:3857',BBOX:geometry.box.join(','),WIDTH:String(geometry.width),HEIGHT:String(geometry.height),FORMAT:'image/jpeg'}).toString();
  try{
    const response=await transport(url,{redirect:'manual',signal:AbortSignal.timeout(20000)});
    const mime=response.headers.get('content-type')?.split(';')[0];
    if(mime!=='image/jpeg'&&mime!=='image/png')throw new MapFailure('MAP_UNAVAILABLE');
    const bytes=await bounded(response,8*1024*1024),size=imageSize(bytes);
    if(size.width!==geometry.width||size.height!==geometry.height||(mime==='image/jpeg'?size.type!=='jpg':size.type!=='png'))throw new MapFailure('MAP_UNAVAILABLE');
    return {bytes,geometry,mime};
  }catch(error){if(error instanceof MapFailure)throw error;throw new MapFailure('MAP_UNAVAILABLE');}
}
export async function fetchMapBuildings(input:MapLocation,transport:typeof fetch=fetch){
  const geometry=mapPlaneGeometry(input,'9:16','buildings-3d'),x=(geometry.box[0]+geometry.box[2])/2,y=(geometry.box[1]+geometry.box[3])/2,
    url=new URL('https://data.geopf.fr/wfs/ows');
  url.search=new URLSearchParams({SERVICE:'WFS',VERSION:'2.0.0',REQUEST:'GetFeature',TYPENAMES:'BDTOPO_V3:batiment',
    SRSNAME:'EPSG:4326',BBOX:[x-900,y-900,x+900,y+900,'urn:ogc:def:crs:EPSG::3857'].join(','),COUNT:'2000',PROPERTYNAME:'geometrie,hauteur',OUTPUTFORMAT:'application/json'}).toString();
  try{
    const response=await transport(url,{redirect:'manual',signal:AbortSignal.timeout(20000)});
    if(!response.headers.get('content-type')?.startsWith('application/json'))throw new MapFailure('MAP_UNAVAILABLE');
    const raw=JSON.parse(new TextDecoder().decode(await bounded(response,4*1024*1024))) as {numberMatched?:number;features?:unknown[]};
    if(!Array.isArray(raw.features)||raw.features.length>2000||(raw.numberMatched??0)>2000)throw new MapFailure('MAP_UNAVAILABLE');
    const features:MapBuildings['features']=[];
    for(const item of raw.features){
      const f=item as {geometry?:{type?:string;coordinates?:number[][][][]};properties?:{hauteur?:number}};
      if(f.geometry?.type!=='MultiPolygon'||!Array.isArray(f.geometry.coordinates)||typeof f.properties?.hauteur!=='number'||f.properties.hauteur<=0)continue;
      const feature={type:'Feature' as const,properties:{height:f.properties.hauteur},geometry:{type:'MultiPolygon' as const,
        coordinates:f.geometry.coordinates.map(p=>p.map(r=>r.map(c=>[c[0],c[1]] as [number,number])))}};
      features.push(feature);
    }
    const data=MapBuildings.parse({type:'FeatureCollection',features}),bytes=new TextEncoder().encode(JSON.stringify(data));
    if(bytes.length>4*1024*1024)throw new MapFailure('MAP_UNAVAILABLE');return {bytes,data};
  }catch(error){if(error instanceof MapFailure)throw error;throw new MapFailure('MAP_UNAVAILABLE');}
}
// Atomic fixed windows, shared across isolates. No raw IP, address or search text is stored here.
export async function mapRateLimit(db:Database,bucket:string,limit:number,expires:number){
  const row=await db.prepare(`INSERT INTO map_request_limits(bucket,used,expires_at) VALUES (?,1,?)
    ON CONFLICT(bucket) DO UPDATE SET used=used+1 WHERE used<? RETURNING used`).bind(bucket,expires,limit).first<{used:number}>();
  if(!row)throw new MapFailure('MAP_RATE_LIMIT');
}
export async function limitMapRequest(db:Database,identity:string,now=Date.now()){
  const minute=Math.floor(now/60000),day=Math.floor(now/86400000);
  await mapRateLimit(db,`visitor:${identity}:${minute}`,12,(minute+1)*60000);
  await mapRateLimit(db,`requests:${minute}`,50,(minute+1)*60000);
  await mapRateLimit(db,`requests-day:${day}`,1000,(day+1)*86400000);
  await db.prepare('DELETE FROM map_request_limits WHERE expires_at<?').bind(now-86400000).run();
}
type Row={state:'preparing'|'ready'|'failed';objectKey:string|null;sha256:string|null;sizeBytes:number|null;capturedAt:string|null;mime:'image/png'|'image/jpeg'|null;
  buildingsKey:string|null;buildingsSha256:string|null;buildingsSize:number|null;buildingCount:number|null};
export async function findMapImage(db:Database,id:string){
  if(!/^[a-f0-9]{64}$/.test(id))return null;
  return db.prepare('SELECT state,object_key AS objectKey,sha256,size_bytes AS sizeBytes,captured_at AS capturedAt,mime,buildings_key AS buildingsKey,buildings_sha256 AS buildingsSha256,buildings_size AS buildingsSize,building_count AS buildingCount FROM map_images WHERE id=?').bind(id).first<Row>();
}
async function prepareMapLayer(env:MapEnvironment,input:MapLocation,aspectRatio:'9:16'|'16:9',transport:typeof fetch,view:MapView,plateZoom?:number,withBuildings=view==='buildings-3d'){
  const request=MapPreviewRequest.parse({location:input,aspectRatio,view,...(plateZoom===undefined?{}:{zoomStart:plateZoom})}),location=mapPublicLocation(request.location),geometry=mapPlaneGeometry(location,aspectRatio,view,plateZoom),
    version=plateZoom===undefined?(view==='plan'?'ign-plan-v1':'ign-buildings-v1'):`ign-zoom-v1-${view}-${withBuildings?'buildings':'raster'}`;
  // Only the public geographical background is shared; labels and agency identity are never baked into it.
  const id=await mapHash(new TextEncoder().encode(JSON.stringify([version,location.latitude,location.longitude,location.precision,aspectRatio,...(plateZoom===undefined?[]:[plateZoom])])));
  let row=await findMapImage(env.DB,id);
  if(row?.state!=='ready'){
    const now=Date.now(),owner=crypto.randomUUID();
    const claimed=await env.DB.prepare(`INSERT INTO map_images(id,state,owner,lease_until) VALUES (?,'preparing',?,?)
      ON CONFLICT(id) DO UPDATE SET state='preparing',owner=excluded.owner,lease_until=excluded.lease_until
      WHERE map_images.state!='ready' AND map_images.lease_until<? RETURNING owner`).bind(id,owner,now+45000,now).first<{owner:string}>();
    if(claimed?.owner===owner){
      try{
        const day=Math.floor(now/86400000);await mapRateLimit(env.DB,`plates:${day}`,300,(day+1)*86400000);
        const [plate,buildingData]=await Promise.all([fetchMapPlate(location,aspectRatio,transport,view,plateZoom),withBuildings?fetchMapBuildings(location,transport):undefined]);
        const {bytes,mime}=plate,sha256=await mapHash(bytes),objectKey=`maps/${version}/${id}/${sha256}.${mime==='image/jpeg'?'jpg':'png'}`,capturedAt=new Date().toISOString();
        let buildingsKey:string|null=null,buildingsSha256:string|null=null,buildingsSize:number|null=null,buildingCount:number|null=null;
        if(buildingData){
          buildingsSha256=await mapHash(buildingData.bytes);buildingsKey=`maps/${version}/${id}/${buildingsSha256}.json`;
          buildingsSize=buildingData.bytes.length;buildingCount=buildingData.data.features.length;
          await env.MEDIA.put(buildingsKey,buildingData.bytes,{httpMetadata:{contentType:'application/json'}});
        }
        await env.MEDIA.put(objectKey,bytes,{httpMetadata:{contentType:mime}});
        await env.DB.prepare(`UPDATE map_images SET state='ready',object_key=?,sha256=?,size_bytes=?,captured_at=?,mime=?,buildings_key=?,buildings_sha256=?,buildings_size=?,building_count=?
          WHERE id=? AND state='preparing' AND owner=?`).bind(objectKey,sha256,bytes.length,capturedAt,mime,buildingsKey,buildingsSha256,buildingsSize,buildingCount,id,owner).run();
      }catch(error){await env.DB.prepare("UPDATE map_images SET state='failed',lease_until=? WHERE id=? AND owner=? AND state='preparing'").bind(Date.now()+5000,id,owner).run();throw error;}
    }else{
      for(let i=0;i<12;i++){await new Promise(resolve=>setTimeout(resolve,500));row=await findMapImage(env.DB,id);if(row?.state!=='preparing')break;}
    }
    row=await findMapImage(env.DB,id);
  }
  if(!row||row.state!=='ready'||!row.objectKey||!row.sha256||!row.sizeBytes||!row.capturedAt||!row.mime)throw new MapFailure('MAP_UNAVAILABLE');
  if(withBuildings&&(!row.buildingsKey||!row.buildingsSha256||!row.buildingsSize||row.buildingCount===null))throw new MapFailure('MAP_UNAVAILABLE');
  const buildings=row.buildingsKey&&row.buildingsSha256&&row.buildingsSize?{objectKey:row.buildingsKey,sha256:row.buildingsSha256,sizeBytes:row.buildingsSize}:undefined;
  const info:MapImageInfo={id,url:`/api/maps/images/${id}`,width:geometry.width,height:geometry.height,capturedAt:row.capturedAt,bounds:geometry.bounds,
    ...(plateZoom===undefined?{}:{zoom:plateZoom}),
    ...(buildings?{buildingsUrl:`/api/maps/images/${id}/buildings`,buildingCount:row.buildingCount!}:{})};
  return {info,objectKey:row.objectKey,sha256:row.sha256,sizeBytes:row.sizeBytes,mime:row.mime,...(buildings?{buildings}:{})};
}
export async function prepareMapImage(env:MapEnvironment,input:MapLocation,aspectRatio:'9:16'|'16:9',transport:typeof fetch=fetch,view:MapView='plan',zooms:Pick<VideoMap,'zoomStart'|'zoomEnd'>={}){
  const request=MapPreviewRequest.parse({location:input,aspectRatio,view,...zooms});
  if(view!=='satellite'&&request.zoomStart===undefined&&request.zoomEnd===undefined)return prepareMapLayer(env,input,aspectRatio,transport,view);
  // Local levels retain detail throughout wide zooms, in either direction. No internet is needed at render time.
  const levels=mapRasterLevels(request,input.precision),base=await prepareMapLayer(env,input,aspectRatio,transport,view,levels[0]),details=[];
  for(let i=1;i<levels.length;i+=2){
    const batch=await Promise.all(levels.slice(i,i+2).map(zoom=>prepareMapLayer(env,input,aspectRatio,transport,view,zoom,false)));
    details.push(...batch);
  }
  return {...base,details,info:{...base.info,details:details.map(d=>({...d.info,zoom:d.info.zoom!}))}};
}
