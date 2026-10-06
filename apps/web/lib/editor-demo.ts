import {CreationDraftView,EditorVoicePreview,PhotoAsset,createEditorDocument,defaultVideoCustomization,emptyCreationFields,
  type AgencyProfile,type CreationFields,type EditorMusicUpload,type VideoCustomization} from '@bienvu/contracts';
import published from './editor-demo.json';
import {z} from 'zod';

export const EDITOR_DEMO_VERSION='sanary-v1';
export const demoAssetUrl=(id:string)=>`/api/editor-demo/assets/${encodeURIComponent(id)}`;
const mediaSchema=z.object({id:z.string().regex(/^demo-(photo|animation|voice)-\d+$|^demo-music$/),sha256:z.string().regex(/^[a-f0-9]{64}$/),
  sizeBytes:z.number().int().positive().max(25*1024*1024),mime:z.enum(['image/jpeg','video/mp4','audio/wav']),
  width:z.number().int().positive().optional(),height:z.number().int().positive().optional(),durationMs:z.number().int().positive().optional()});
export type DemoMedia=z.infer<typeof mediaSchema>;
export type EditorDemo={draft:CreationDraftView;voice:EditorVoicePreview|null;media:DemoMedia[]};
// Only this explicitly published snapshot is public. The source draft, its
// account, private storage keys and future edits are never queried by visitors.
export function editorDemo():EditorDemo{
  return {draft:CreationDraftView.parse(published.draft),voice:published.voice?EditorVoicePreview.parse(published.voice):null,media:mediaSchema.array().max(31).parse(published.media)};
}
export function guestAgency():AgencyProfile{
  return {id:'editor-guest',ownerUserId:'editor-guest',name:'BienVu',neutral:true,logoAssetId:null,phone:null,email:null,website:null,
    primaryColor:'#638060',secondaryColor:'#E2E9DC',createdAt:'2026-10-03T00:00:00.000Z',updatedAt:'2026-10-03T00:00:00.000Z',brandVersion:1};
}
export function newGuestDraft(id:string,kind:'demo'|'empty',voice?:VideoCustomization['voice']):CreationDraftView{
  const base=kind==='demo'?editorDemo().draft:null,agency=guestAgency(),fields=base?.data.fields??emptyCreationFields(),
    settings=base?.data.videoCustomization??{...defaultVideoCustomization(agency,voice),photoOrder:[],runwayPhotos:[],editor:createEditorDocument([],{}, {})};
  return CreationDraftView.parse({id,version:1,status:'needs_input',sourceKind:'manual',sourceUrl:null,expiresAt:'2099-01-01T00:00:00.000Z',
    data:{fields,provenance:{},originalText:null,canonicalUrl:null,warnings:[],videoCustomization:settings},
    photos:base?.photos.map(p=>({...p,agencyId:agency.id,listingId:id,objectKey:`agencies/${agency.id}/imports/${id}/${p.id}.jpg`}))??[]});
}
// Used by the publishing operator. An allowlist deliberately replaces every
// tenant identifier, source URL and private media reference before publication.
export function buildEditorDemo(input:{fields:CreationFields;settings:VideoCustomization;photos:PhotoAsset[];voice:EditorVoicePreview|null;music?:EditorMusicUpload;animations:DemoMedia[]}):EditorDemo{
  const voice=input.voice?EditorVoicePreview.parse({...input.voice,id:'demo-voice',clips:input.voice.clips.map((c,i)=>({...c,assetId:`demo-voice-${i}`}))}):null;
  const settings={...input.settings,voiceSourceId:voice?.id,editor:input.settings.editor?{...input.settings.editor,
    music:input.music&&input.settings.editor.music?{...input.settings.editor.music,...input.music,assetId:'demo-music'}:null}:undefined};
  const draft=CreationDraftView.parse({id:'editor-demo',version:1,status:'needs_input',sourceKind:'manual',sourceUrl:null,expiresAt:'2099-01-01T00:00:00.000Z',
    data:{fields:input.fields,provenance:{},originalText:null,canonicalUrl:null,warnings:[],videoCustomization:settings},
    photos:input.photos.map(p=>PhotoAsset.parse({id:`demo-photo-${p.sourceOrder}`,agencyId:'editor-demo',listingId:'editor-demo',sourceUrl:null,
      objectKey:`agencies/editor-demo/imports/editor-demo/photo-${p.sourceOrder}.jpg`,sourceOrder:p.sourceOrder,contentHash:p.contentHash,
      mime:p.mime,width:p.width,height:p.height,sizeBytes:p.sizeBytes}))});
  return {draft,voice,media:mediaSchema.array().max(31).parse(input.animations)};
}
export function demoMedia(id:string){return editorDemo().media.find(asset=>asset.id===id)??null;}
export function demoObjectKey(asset:DemoMedia){return `public/editor-demo/${EDITOR_DEMO_VERSION}/${asset.sha256}.${asset.mime==='video/mp4'?'mp4':asset.mime==='audio/wav'?'wav':'jpg'}`;}
