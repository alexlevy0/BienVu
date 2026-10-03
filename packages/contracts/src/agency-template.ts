import {z} from 'zod';
import {EditorDocument,createEditorDocument,rebalanceEditorClips,type EditorLayer} from './editor';
import {VideoCustomization,defaultVideoCustomization} from './customization';
const binding=z.enum(['title','locality','facts','price','agency','logo','static']);
export const AgencyTemplate=z.object({version:z.literal(1),settings:VideoCustomization.omit({editor:true,photoOrder:true,runwayClips:true,runwayPhotos:true,narration:true,voiceSourceId:true}),
 document:EditorDocument,bindings:z.array(z.object({id:z.string(),field:binding}).strict()).max(16)}).strict();
export type AgencyTemplate=z.infer<typeof AgencyTemplate>;
export function captureAgencyTemplate(settings:VideoCustomization&{editor:EditorDocument}):AgencyTemplate{
 const {editor,photoOrder,runwayClips,runwayPhotos,narration,voiceSourceId,...style}=settings;
 const bindings=editor.layers.map(layer=>({id:layer.id,field:layer.kind==='logo'?'logo' as const:['title','locality','facts','price','agency'].includes(layer.id)?layer.id as z.infer<typeof binding>:'static' as const}));
 return AgencyTemplate.parse({version:1,settings:style,document:{...editor,music:null,layers:editor.layers.map(layer=>({...layer,text:bindings.find(b=>b.id===layer.id)?.field==='static'?layer.text:''}))},bindings});
}
export function applyAgencyTemplate(template:AgencyTemplate,photos:{sourceOrder:number}[],fields:Parameters<typeof createEditorDocument>[1],agency:{name:string;logoAssetId?:string|null}){
 const t=AgencyTemplate.parse(template),base=createEditorDocument(photos,fields,{durationSeconds:t.document.durationSeconds,aspectRatio:t.document.aspectRatio,agencyName:agency.name,logo:Boolean(agency.logoAssetId),voiceEnabled:t.document.voiceEnabled,subtitlesEnabled:t.document.subtitlesEnabled});
 const clips=rebalanceEditorClips(base.durationSeconds*30,base.clips.map((clip,i)=>({...clip,camera:t.document.clips[i%Math.max(1,t.document.clips.length)]?.camera})));
 const layers=t.document.layers.flatMap(layer=>{const field=t.bindings.find(b=>b.id===layer.id)?.field??'static';if(field==='static')return [layer];
  const source=base.layers.find(l=>l.id===field);return source?[{...layer,text:source.text,kind:source.kind} as EditorLayer]:[];});
 const editor=EditorDocument.parse({...base,clips,layers,voiceVolume:t.document.voiceVolume,audioMix:t.document.audioMix,photosVisible:t.document.photosVisible,textsVisible:t.document.textsVisible});
 return {...defaultVideoCustomization(),...t.settings,photoOrder:photos.map(p=>p.sourceOrder),runwayPhotos:[],editor};
}
