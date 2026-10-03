import {z} from 'zod';

// Portable, bounded timeline data. No URLs, object keys, HTML or render code
// supplied by a client: media references resolve through the owning import.
const id=z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/);
const frame=z.number().int().min(0).max(1199);
const duration=z.number().int().min(15).max(1200);
export const EditorCamera=z.object({motion:z.enum(['still','zoom-in','zoom-out','pan-left','pan-right','custom']),
  intensity:z.enum(['subtle','normal','dynamic']),start:z.object({x:z.number().min(0).max(100),y:z.number().min(0).max(100),scale:z.number().min(1).max(1.4)}).strict(),
  end:z.object({x:z.number().min(0).max(100),y:z.number().min(0).max(100),scale:z.number().min(1).max(1.4)}).strict()}).strict();
export type EditorCamera=z.infer<typeof EditorCamera>;
export const EditorClip=z.object({id,photoSlot:z.number().int().min(0).max(11),durationFrames:duration,camera:EditorCamera.optional()}).strict();
export type EditorClip=z.infer<typeof EditorClip>;
export const EditorLayer=z.object({id,kind:z.enum(['text','logo']),text:z.string().max(240),
  startFrame:frame,durationFrames:duration,x:z.number().min(2).max(98),y:z.number().min(2).max(98),
  width:z.number().min(10).max(96),fontSize:z.number().int().min(20).max(200),
  font:z.enum(['sans','serif','display']),bold:z.boolean(),italic:z.boolean(),align:z.enum(['left','center','right']),
  color:z.string().regex(/^#[a-fA-F0-9]{6}$/),background:z.boolean(),shadow:z.boolean(),
  animation:z.enum(['none','fade','rise'])}).strict();
export type EditorLayer=z.infer<typeof EditorLayer>;
export const EditorDocument=z.object({version:z.literal(1),aspectRatio:z.enum(['9:16','16:9']),
  durationSeconds:z.union([z.literal(20),z.literal(30),z.literal(40)]),
  clips:z.array(EditorClip).max(24),layers:z.array(EditorLayer).max(16),
  photosVisible:z.boolean(),textsVisible:z.boolean(),voiceEnabled:z.boolean(),subtitlesEnabled:z.boolean(),
  voiceVolume:z.number().min(0.05).max(1),
  audioMix:z.object({ducking:z.boolean(),normalize:z.boolean(),duckLevel:z.number().min(.05).max(.8),fadeInFrames:z.number().int().min(0).max(90),fadeOutFrames:z.number().int().min(0).max(90)}).strict().optional(),
  music:z.object({assetId:id,name:z.string().min(1).max(100),durationMs:z.number().int().min(500).max(40000),
    volume:z.number().min(0).max(1),startFrame:frame,trimFromFrame:frame,normalizationGain:z.number().min(.1).max(4).optional()}).strict().nullable(),
}).strict().superRefine((doc,ctx)=>{
  const total=doc.durationSeconds*30;
  if(new Set(doc.clips.map(c=>c.id)).size!==doc.clips.length||new Set(doc.layers.map(l=>l.id)).size!==doc.layers.length)
    ctx.addIssue({code:'custom',message:'Chaque élément de la timeline doit avoir un identifiant unique.'});
  if(doc.clips.length&&doc.clips.reduce((n,c)=>n+c.durationFrames,0)!==total)
    ctx.addIssue({code:'custom',message:'Les photos doivent couvrir toute la vidéo.'});
  if(doc.layers.some(l=>l.startFrame+l.durationFrames>total))ctx.addIssue({code:'custom',message:'Un texte dépasse la fin de la vidéo.'});
  if(!doc.voiceEnabled&&doc.subtitlesEnabled)ctx.addIssue({code:'custom',message:'Les sous-titres nécessitent une voix off.'});
  if(doc.music&&(doc.music.startFrame>total-15||doc.music.trimFromFrame>Math.floor(doc.music.durationMs*30/1000)-15))
    ctx.addIssue({code:'custom',message:'Le début de la musique est hors de la piste.'});
});
export type EditorDocument=z.infer<typeof EditorDocument>;
export const editorFrames=(doc:Pick<EditorDocument,'durationSeconds'>)=>doc.durationSeconds*30;
export function rebalanceEditorClips(total:number,clips:EditorClip[]):EditorClip[]{
  if(!clips.length)return [];
  const minimum=15,remaining=total-minimum*clips.length;
  if(remaining<0||clips.length>24)throw new Error('EDITOR_TIMELINE_TOO_LONG');
  const weights=clips.map(c=>Math.max(0,c.durationFrames-minimum)),sum=weights.reduce((n,w)=>n+w,0);
  let used=0;
  return clips.map((clip,i)=>{const previous=used;used+=sum?weights[i]:1;
    const divisor=sum||clips.length;
    return {...clip,durationFrames:minimum+Math.floor(used*remaining/divisor)-Math.floor(previous*remaining/divisor)};
  });
}
export function editorClipStarts(doc:Pick<EditorDocument,'clips'>){let at=0;return doc.clips.map(clip=>{
  const startFrame=at;at+=clip.durationFrames;return {...clip,startFrame};});}
export function editorActiveClip(doc:EditorDocument,at:number){return editorClipStarts(doc).find(c=>at>=c.startFrame&&at<c.startFrame+c.durationFrames)??doc.clips.at(-1);}
export function editorFont(font:EditorLayer['font']){return font==='serif'?'"BienVu Serif", Georgia, serif':font==='display'?'"BienVu Display", Impact, sans-serif':'"BienVu Video", Arial, sans-serif';}
export function editorLayerStyle(layer:EditorLayer,at:number){
  const elapsed=at-layer.startFrame,end=layer.durationFrames-elapsed;
  const opacity=layer.animation==='none'?1:Math.max(0,Math.min(1,elapsed/10,end/10));
  return {position:'absolute' as const,left:`${layer.x}%`,top:`${layer.y}%`,width:`${layer.width}%`,
    transform:`translate(-50%, -50%)${layer.animation==='rise'?` translateY(${Math.max(0,1-elapsed/12)*28}px)`:''}`,
    opacity,fontSize:layer.fontSize,fontFamily:editorFont(layer.font),fontWeight:layer.bold?700:400,fontStyle:layer.italic?'italic':'normal',
    textAlign:layer.align,color:layer.color,lineHeight:1.15,whiteSpace:'pre-wrap' as const,overflowWrap:'anywhere' as const,
    padding:layer.background?'16px 22px':'0',background:layer.background?'rgba(15,21,17,.7)':'transparent',
    textShadow:layer.shadow?'0 3px 14px rgba(0,0,0,.55)':'none',boxSizing:'border-box' as const};
}
export function editorCaptionStyle(width:number){
  return {position:'absolute' as const,left:'8%',right:'8%',top:'58%',transform:'translateY(-50%)',
    fontFamily:'"BienVu Video", Arial, sans-serif',fontSize:width===1920?42:44,color:'#fff',background:'#111c',
    padding:'15px 24px',textAlign:'center' as const,lineHeight:1.22,whiteSpace:'pre-wrap' as const};
}
export function newEditorLayer(id:string,text:string,total:number,kind:EditorLayer['kind']='text'):EditorLayer{
  return {id,kind,text:text.slice(0,240),startFrame:0,durationFrames:total,x:50,y:75,width:84,fontSize:64,
    font:'serif',bold:true,italic:false,align:'center',color:'#FFFFFF',background:false,shadow:true,animation:'fade'};
}
export function createEditorDocument(photos:{sourceOrder:number}[],fields:{title?:string|null;locality?:string|null;area?:number|null;rooms?:number|null;priceCents?:number|null},
  options:{durationSeconds?:20|30|40;aspectRatio?:'9:16'|'16:9';voiceEnabled?:boolean;subtitlesEnabled?:boolean;agencyName?:string;logo?:boolean}={}):EditorDocument{
  const durationSeconds=options.durationSeconds??20,total=durationSeconds*30;
  const clips=photos.map((p,i)=>({id:`photo-${p.sourceOrder}`,photoSlot:p.sourceOrder,
    durationFrames:Math.floor((i+1)*total/photos.length)-Math.floor(i*total/photos.length)}));
  const layer=(key:string,text:string,y:number,size:number,font:EditorLayer['font']='serif')=>({...newEditorLayer(key,text,total),y,fontSize:size,font});
  const information=[fields.area!=null?`${fields.area.toLocaleString('fr-FR')} m²`:'',fields.rooms!=null?`${fields.rooms} pièce${fields.rooms>1?'s':''}`:''].filter(Boolean).join(' · ');
  const layers=[...(fields.locality?[layer('locality',fields.locality.toLocaleUpperCase('fr-FR'),9,36,'sans')]:[]),
    ...(fields.title?[layer('title',fields.title,19,94)]:[]),...(information?[layer('facts',information,75,60)]:[]),
    ...(fields.priceCents?[layer('price',`${(fields.priceCents/100).toLocaleString('fr-FR')} €`,84,86)]:[]),
    ...(options.agencyName?[layer('agency',options.agencyName,93,36,'sans')]:[]),
    ...(options.logo?[{...newEditorLayer('logo','Logo de l’agence',total,'logo'),y:91,x:15,width:15}]:[])];
  return EditorDocument.parse({version:1,aspectRatio:options.aspectRatio??'9:16',durationSeconds,clips,layers,
    photosVisible:true,textsVisible:true,voiceEnabled:options.voiceEnabled!==false,subtitlesEnabled:options.voiceEnabled!==false&&options.subtitlesEnabled!==false,
    voiceVolume:1,music:null,audioMix:{ducking:true,normalize:true,duckLevel:.25,fadeInFrames:15,fadeOutFrames:30}});
}
export function resizeEditorDocument(doc:EditorDocument,seconds:20|30|40):EditorDocument{
  const ratio=seconds/doc.durationSeconds,total=seconds*30;
  const clips=rebalanceEditorClips(total,doc.clips);
  return EditorDocument.parse({...doc,durationSeconds:seconds,clips,layers:doc.layers.map(l=>{
    const startFrame=Math.min(total-15,Math.round(l.startFrame*ratio));return {...l,startFrame,durationFrames:Math.max(15,Math.min(total-startFrame,Math.round(l.durationFrames*ratio)))};}),
    music:doc.music?{...doc.music,startFrame:Math.min(total-15,Math.round(doc.music.startFrame*ratio))}:null});
}
export function splitEditorClip(doc:EditorDocument,id:string,at:number,newId:string):EditorDocument{
  const clip=editorClipStarts(doc).find(c=>c.id===id);if(!clip||doc.clips.length>=24)return doc;
  const before=at-clip.startFrame,after=clip.durationFrames-before;if(before<15||after<15)return doc;
  return EditorDocument.parse({...doc,clips:doc.clips.flatMap(c=>c.id===id?[{...c,durationFrames:before},{...c,id:newId,durationFrames:after}]:[c])});
}
export function resizeEditorClip(doc:EditorDocument,id:string,frames:number):EditorDocument{
  const index=doc.clips.findIndex(c=>c.id===id);if(index<0||doc.clips.length<2)return doc;
  const other=index===doc.clips.length-1?index-1:index+1,clip=doc.clips[index],neighbour=doc.clips[other],
    next=Math.max(15,Math.min(clip.durationFrames+neighbour.durationFrames-15,Math.round(frames))),delta=next-clip.durationFrames;
  return EditorDocument.parse({...doc,clips:doc.clips.map((c,i)=>i===index?{...c,durationFrames:next}:i===other?{...c,durationFrames:c.durationFrames-delta}:c)});
}
export function editorHasAudio(m:{voiceEnabled?:boolean;editor?:EditorDocument;music?:{asset:unknown}|null}){
  return m.voiceEnabled!==false||Boolean(m.music&&m.editor?.music&&(m.editor.music.volume>0));
}
export function editorPhotoMotion(at:number,durationFrames:number,index:number,enabled=true,camera?:EditorCamera){
  const progress=Math.max(0,Math.min(1,at/Math.max(1,durationFrames-1)));
  if(camera){const ease=progress*progress*(3-2*progress),amount={subtle:.04,normal:.08,dynamic:.14}[camera.intensity];
    let start=camera.start,end=camera.end;
    if(camera.motion!=='custom'&&camera.motion!=='still'){const scale=1+amount;start={x:50,y:50,scale:camera.motion==='zoom-out'?scale:1};end={x:50,y:50,scale:camera.motion==='zoom-in'?scale:1};
      if(camera.motion.startsWith('pan-')){start={x:camera.motion==='pan-left'?65:35,y:50,scale};end={x:100-start.x,y:50,scale};}}
    if(!enabled||camera.motion==='still')end=start;
    const scale=start.scale+(end.scale-start.scale)*ease,x=start.x+(end.x-start.x)*ease,y=start.y+(end.y-start.y)*ease;
    return {scale,translate:`${(50-x)*(scale-1)}% ${(50-y)*(scale-1)}%`,objectPosition:`${x}% ${y}%`};}
  return {scale:enabled?1.035+progress*.045:1,translate:enabled?`${(index%2?-1:1)*(progress-.5)*18}px 0px`:'0px 0px'};
}
