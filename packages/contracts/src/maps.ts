import {z} from 'zod';

const label=z.string().trim().min(2).max(120).refine(v=>!/[<>\u0000-\u001f\u007f]/.test(v));
export const MapLocation=z.object({latitude:z.number().finite().min(-80).max(80),longitude:z.number().finite().min(-175).max(175),
  label,precision:z.enum(['approximate','exact']),sourceType:z.enum(['municipality','street','housenumber','poi','manual'])}).strict()
  .refine(v=>v.precision!=='exact'||v.sourceType==='housenumber'||v.sourceType==='manual','Confirmez une adresse ou un repère précis.');
export type MapLocation=z.infer<typeof MapLocation>;
export const MapSearchResult=z.object({locations:z.array(MapLocation).max(5)}).strict();
export const MapView=z.enum(['plan','buildings-3d','satellite']);
export type MapView=z.infer<typeof MapView>;
export const MapZoom=z.number().finite().min(12).max(18);
const zoomFields={zoomStart:MapZoom.optional(),zoomEnd:MapZoom.optional()};
export const VideoMap=z.object({position:z.enum(['start','end']),durationSeconds:z.number().int().min(3).max(5),location:MapLocation.nullable(),view:MapView.optional(),...zoomFields}).strict();
export type VideoMap=z.infer<typeof VideoMap>;
export const ConfirmedVideoMap=VideoMap.extend({location:MapLocation});
export type ConfirmedVideoMap=z.infer<typeof ConfirmedVideoMap>;
export const MapSearch=z.object({query:label}).strict();
export const MapPreviewRequest=z.object({location:MapLocation,aspectRatio:z.enum(['9:16','16:9']),view:MapView.optional(),...zoomFields}).strict();
const MapRasterInfo=z.object({id:z.string().regex(/^[a-f0-9]{64}$/),url:z.string().regex(/^\/api\/maps\/images\/[a-f0-9]{64}$/),
  width:z.number().int().positive(),height:z.number().int().positive(),capturedAt:z.iso.datetime(),
  bounds:z.tuple([z.number(),z.number(),z.number(),z.number()]),zoom:MapZoom.optional()}).strict();
export const MapImageInfo=MapRasterInfo.extend({details:z.array(MapRasterInfo.extend({zoom:MapZoom})).max(6).optional(),
  buildingsUrl:z.string().regex(/^\/api\/maps\/images\/[a-f0-9]{64}\/buildings$/).optional(),buildingCount:z.number().int().min(0).max(2000).optional()}).strict();
export type MapImageInfo=z.infer<typeof MapImageInfo>;
const position=z.tuple([z.number().finite().min(-180).max(180),z.number().finite().min(-85).max(85)]);
const ring=z.array(position).min(4).max(2000).refine(v=>v[0][0]===v.at(-1)![0]&&v[0][1]===v.at(-1)![1]);
export const MapBuildings=z.object({type:z.literal('FeatureCollection'),features:z.array(z.object({type:z.literal('Feature'),
  properties:z.object({height:z.number().finite().positive().max(500)}).strict(),
  geometry:z.object({type:z.literal('MultiPolygon'),coordinates:z.array(z.array(ring).min(1).max(20)).min(1).max(20)}).strict()}).strict()).max(2000)}).strict()
  .refine(v=>v.features.reduce((n,f)=>n+f.geometry.coordinates.flat().reduce((sum,r)=>sum+r.length,0),0)<=80000);
export type MapBuildings=z.infer<typeof MapBuildings>;
export function mapPublicLocation(input:MapLocation):MapLocation {
  const location=MapLocation.parse(input);
  if(location.precision==='exact')return location;
  const label=['housenumber','manual'].includes(location.sourceType)?location.label.replace(/^\d+(?:\s*[-/]\s*\d+)?(?:\s*(?:bis|ter|quater|[a-z]))?\s+/i,''):location.label;
  return {...location,label,latitude:Math.round(location.latitude*1000)/1000,longitude:Math.round(location.longitude*1000)/1000};
}
export function mapInterval(map:VideoMap|undefined,total:number){
  const durationFrames=map?map.durationSeconds*30:0,startFrame=map?.position==='end'?total-durationFrames:0;
  return {startFrame,durationFrames,photoStartFrame:map?.position==='start'?durationFrames:0,photoFrames:total-durationFrames};
}
export function mapFrame(map:VideoMap|undefined,total:number,frame:number):number|null {
  if(!map)return null;const interval=mapInterval(map,total);
  return frame>=interval.startFrame&&frame<interval.startFrame+interval.durationFrames?frame-interval.startFrame:null;
}
export function mapZoomScale(frame:number,duration:number){
  return .52+.48*mapZoomProgress(frame,duration);
}
function mapZoomProgress(frame:number,duration:number){const t=Math.max(0,Math.min(1,frame/Math.max(1,duration-24)));return t*t*(3-2*t);}
type ZoomSettings=Pick<VideoMap,'view'|'zoomStart'|'zoomEnd'>;
export function mapDefaultZooms(view:MapView='plan',precision:MapLocation['precision']='approximate'){
  return view==='buildings-3d'?{zoomStart:15.5,zoomEnd:17}:view==='satellite'?{zoomStart:15,zoomEnd:17}:
    precision==='exact'?{zoomStart:15,zoomEnd:16}:{zoomStart:13,zoomEnd:14};
}
export function mapZooms(settings:ZoomSettings,precision:MapLocation['precision']='approximate'){
  const defaults=mapDefaultZooms(settings.view,precision);return {zoomStart:settings.zoomStart??defaults.zoomStart,zoomEnd:settings.zoomEnd??defaults.zoomEnd};
}
export function mapRasterLevels(settings:ZoomSettings,precision:MapLocation['precision']='approximate'){
  const {zoomStart,zoomEnd}=mapZooms(settings,precision),min=Math.floor(Math.min(zoomStart,zoomEnd)),max=Math.floor(Math.max(zoomStart,zoomEnd));
  return Array.from({length:max-min+1},(_,i)=>min+i);
}
export function mapZoomAt(settings:ZoomSettings,frame:number,duration:number,precision:MapLocation['precision']='approximate'){
  const {zoomStart,zoomEnd}=mapZooms(settings,precision);return zoomStart+(zoomEnd-zoomStart)*mapZoomProgress(frame,duration);
}
export function mapRasterScale(settings:VideoMap,frame:number,plateZoom?:number){
  return plateZoom===undefined?mapZoomScale(frame,settings.durationSeconds*30):2**(mapZoomAt(settings,frame,settings.durationSeconds*30,settings.location?.precision)-plateZoom);
}
export function mapRasterOpacity(view:MapView|undefined,zoom:number,plateZoom:number){
  const start=plateZoom+(view==='buildings-3d'?0:-.75);return Math.max(0,Math.min(1,(zoom-start)/.25));
}
// Same fixed plate and camera in the browser and in offline video exports.
export function mapPlaneGeometry(input:MapLocation,aspectRatio:'9:16'|'16:9',view:MapView='plan',plateZoom?:number){
  const location=mapPublicLocation(input),width=aspectRatio==='16:9'?3840:2160,height=aspectRatio==='16:9'?2160:3840;
  const radius=6378137,x=radius*location.longitude*Math.PI/180,y=radius*Math.log(Math.tan(Math.PI/4+location.latitude*Math.PI/360));
  // Explicit zooms use the same 512 px world as MapLibre. The 3D plate covers four viewports to include the pitched horizon.
  const zoom=plateZoom===undefined?(view==='buildings-3d'?16:location.precision==='exact'?17:15):plateZoom+(view==='buildings-3d'?0:1),
    metersPerPixel=2*Math.PI*radius/(256*2**zoom),halfX=width*metersPerPixel/2,halfY=height*metersPerPixel/2;
  const box:[number,number,number,number]=[x-halfX,y-halfY,x+halfX,y+halfY];
  const lon=(v:number)=>v/radius*180/Math.PI,lat=(v:number)=>(2*Math.atan(Math.exp(v/radius))-Math.PI/2)*180/Math.PI;
  const bounds:[number,number,number,number]=[lon(box[0]),lat(box[1]),lon(box[2]),lat(box[3])];
  return {width,height,box,bounds,location,zoom};
}
export const mapAttribution=(capturedAt:string)=>`© IGN · Plan IGN · ${capturedAt.slice(0,4)}`;
export function mapCredits(capturedAt:string,view:MapView='plan'){
  return `Cartographie : IGN, ${view==='satellite'?'BD ORTHO (photographies aériennes)':'Plan IGN'}${view==='buildings-3d'?' et BD TOPO (bâtiments et hauteurs)':''}. Licence Ouverte 2.0. Données consultées le ${capturedAt.slice(0,10)}. Sources et mises à jour : https://geoservices.ign.fr/${view==='satellite'?'bdortho':'planign'}${view==='buildings-3d'?' ; https://geoservices.ign.fr/bdtopo':''}.`;
}
export function mapBuildingCamera(location:MapLocation,frame:number,duration:number,settings?:ZoomSettings){
  // Preserve frozen legacy cameras; new projects save both endpoints explicitly.
  const zoom=settings&&(settings.zoomStart!==undefined||settings.zoomEnd!==undefined)?mapZoomAt(settings,frame,duration,location.precision):17.1+mapZoomProgress(frame,duration)*.75;
  return {center:[location.longitude,location.latitude] as [number,number],zoom,pitch:52,bearing:-12};
}
type RasterDetail={url:string;bounds:[number,number,number,number];zoom:number};
export function mapRasterStyle(plate:string,bounds:[number,number,number,number],details:RasterDetail[]=[],view:MapView='plan'){
  const [west,south,east,north]=bounds;
  const sources=Object.fromEntries(details.map((d,i)=>{const [w,s,e,n]=d.bounds;return [`detail-${i}`,{type:'image' as const,url:d.url,coordinates:[[w,n],[e,n],[e,s],[w,s]] as [[number,number],[number,number],[number,number],[number,number]]}];}));
  return {version:8 as const,
    sources:{plate:{type:'image' as const,url:plate,coordinates:[[west,north],[east,north],[east,south],[west,south]] as [[number,number],[number,number],[number,number],[number,number]]},
      ...sources},layers:[{id:'background',type:'background' as const,paint:{'background-color':'#e8eee1'}},
      {id:'plate',type:'raster' as const,source:'plate',paint:{'raster-fade-duration':0}},
      ...details.map((d,i)=>{const start=d.zoom+(view==='buildings-3d'?0:-.75);return {id:`detail-${i}`,type:'raster' as const,source:`detail-${i}`,paint:{'raster-fade-duration':0,'raster-opacity-transition':{duration:0},
        'raster-opacity':['interpolate',['linear'],['zoom'],start,0,start+.25,1] as ['interpolate',['linear'],['zoom'],number,number,number,number]}};})]};
}
// Fixed local sources: no external tiles, sprites or fonts are needed by the 3D render.
export function mapBuildingStyle(plate:string,bounds:[number,number,number,number],buildings:string|MapBuildings,color:string,details:RasterDetail[]=[]){
  const raster=mapRasterStyle(plate,bounds,details,'buildings-3d');
  return {...raster,light:{anchor:'viewport' as const,color:'#ffffff',intensity:.45,position:[1.5,160,40] as [number,number,number]},
    sources:{...raster.sources,buildings:{type:'geojson' as const,data:buildings}},layers:[...raster.layers,
      {id:'buildings',type:'fill-extrusion' as const,source:'buildings',paint:{'fill-extrusion-color':color,'fill-extrusion-height':['get','height'] as ['get','height'],'fill-extrusion-base':0,'fill-extrusion-opacity':.95,'fill-extrusion-vertical-gradient':true}}]};
}
export function mapInk(primary:string,secondary:string){
  const readable=(color:string)=>{const values=(color.match(/[a-f\d]{2}/gi)??[]).map(h=>parseInt(h,16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);
    return values.length===3&&1.05/(values[0]*.2126+values[1]*.7152+values[2]*.0722+.05)>=4.5;};
  return readable(secondary)?secondary:readable(primary)?primary:'#183021';
}
