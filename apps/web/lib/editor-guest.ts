import {z} from 'zod';
import {CreationDraftView,CreationFields,EditorDocument,EditorVoicePreview,VideoCustomization,PhotoAsset,EntityId,
  audioNormalizationGain,type EditorMusicUpload,type VideoCustomization as Settings} from '@bienvu/contracts';
import {measureMusicWav} from '../../../packages/voice/src/audio';
import {editorDemo,demoAssetUrl,newGuestDraft,EDITOR_DEMO_VERSION} from './editor-demo';
import {editorResponse,editorMediaSourcesKey,type EditorResources} from './editor-client';

const draftSchema=CreationDraftView.extend({data:CreationDraftView.shape.data.extend({fields:CreationFields.extend({
  title:z.string().max(200).nullable(),locality:z.string().max(200).nullable(),priceCents:z.number().finite().max(100_000_000_000).nullable(),
  area:z.number().finite().max(100_000).nullable(),rooms:z.number().finite().max(100).nullable()})})});
const recordSchema=z.object({version:z.literal(1),demoVersion:z.literal(EDITOR_DEMO_VERSION),kind:z.enum(['demo','empty']),draft:draftSchema,
  savedAt:z.number().finite(),handoff:z.boolean(),connectionKey:EntityId.nullable().default(null),transfer:z.object({agencyId:EntityId,draftId:EntityId,signature:z.string().regex(/^[a-f0-9]{64}$/)}).nullable()});
export type GuestEditorRecord=z.infer<typeof recordSchema>&{files:{id:string;blob:Blob}[]};
export type GuestEditorPort={persisted:boolean;photoUrls:Record<string,string>;voiceUrls:Record<string,string>;voice:EditorVoicePreview|null;
  resources(settings:Settings,photos:PhotoAsset[]):EditorResources;
  save(draft:CreationDraftView):Promise<void>;upload(photo:{id:string;slot:number;file:File}):Promise<PhotoAsset>;
  remove(id:string):Promise<void>;music(id:string,wav:Blob):Promise<EditorMusicUpload>;connect():Promise<void>;choose():void};

export function newGuestRecord(kind:'demo'|'empty',id:string=crypto.randomUUID()):GuestEditorRecord{
  return {version:1,demoVersion:EDITOR_DEMO_VERSION,kind,draft:newGuestDraft(id,kind),savedAt:Date.now(),files:[],handoff:false,connectionKey:null,transfer:null};
}
export function parseGuestRecord(value:unknown):GuestEditorRecord|null{
  const parsed=recordSchema.safeParse(value);if(!parsed.success||!value||typeof value!=='object')return null;
  const files=(value as GuestEditorRecord).files;
  if(parsed.data.savedAt>Date.now()+60_000||Date.now()-parsed.data.savedAt>30*86400_000||!Array.isArray(files)||files.length>24||
    files.some(f=>!EntityId.safeParse(f?.id).success||!(f.blob instanceof Blob)||f.blob.size>15_000_000)||
    files.reduce((n,f)=>n+f.blob.size,0)>65_000_000||new Set(files.map(f=>f.id)).size!==files.length)return null;
  // Never accept arbitrary remote media or tenant metadata from local storage.
  const draft=parsed.data.draft,allowed=new Set(editorDemo().draft.photos.map(p=>p.id));
  if(draft.photos.some(p=>p.agencyId!=='editor-guest'||p.listingId!==draft.id||p.sourceUrl!==null||
    !files.some(f=>f.id===p.id)&&!(parsed.data.kind==='demo'&&allowed.has(p.id))))return null;
  const music=draft.data.videoCustomization?.editor?.music;
  if(music&&!files.some(f=>f.id===music.assetId)&&!(parsed.data.kind==='demo'&&music.assetId==='demo-music'))return null;
  return {...parsed.data,files};
}
async function database(){return new Promise<IDBDatabase>((resolve,reject)=>{
  const request=indexedDB.open('bienvu-guest-editor',1);request.onupgradeneeded=()=>request.result.createObjectStore('projects');
  request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(new Error('Le stockage local est indisponible. Vos retouches restent ouvertes dans cet onglet.'));
});}
export async function readGuestRecord(){const db=await database();try{return await new Promise<GuestEditorRecord|null>((resolve,reject)=>{
  const tx=db.transaction('projects','readonly'),request=tx.objectStore('projects').get('current');let record:GuestEditorRecord|null=null;
  request.onsuccess=()=>{record=parseGuestRecord(request.result);};tx.oncomplete=()=>resolve(record);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);
});}finally{db.close();}}
export async function writeGuestRecord(record:GuestEditorRecord){const db=await database();try{await new Promise<void>((resolve,reject)=>{
  const tx=db.transaction('projects','readwrite');tx.objectStore('projects').put(record,'current');tx.oncomplete=()=>resolve();
  tx.onerror=()=>reject(new Error('L’enregistrement local a échoué. Gardez cet onglet ouvert et réessayez.'));tx.onabort=()=>reject(new Error('L’enregistrement local a été interrompu.'));
});}finally{db.close();}}
export function guestResources(settings:Settings,photos:PhotoAsset[]):EditorResources{
  const demo=editorDemo(),format=settings.editor?.aspectRatio,availableAnimations=format===demo.draft.data.videoCustomization?.editor?.aspectRatio?photos.flatMap(photo=>{
    const source=demo.draft.photos.find(p=>p.id===photo.id&&p.contentHash===photo.contentHash),asset=source&&demo.media.find(m=>m.id===`demo-animation-${source.sourceOrder}`);
    return asset?[{slot:photo.sourceOrder,url:demoAssetUrl(asset.id)}]:[];
  }):[];
  return {version:1,sourceKey:editorMediaSourcesKey(settings,photos),cost:0,availableAnimations,animations:availableAnimations.filter(a=>settings.runwayPhotos?.includes(a.slot))};
}
export async function guestPhoto(file:File,id:string,slot:number,draftId:string):Promise<{asset:PhotoAsset;blob:Blob}>{
  if(!['image/jpeg','image/png','image/webp'].includes(file.type)||!file.size||file.size>10*1024*1024)throw Error('Utilisez une photo JPG, PNG ou WebP de moins de 10 Mo.');
  let bitmap:ImageBitmap;try{bitmap=await createImageBitmap(file);}catch{throw Error('Cette image ne peut pas être lue.');}
  try{if(bitmap.width<640||bitmap.height<360||bitmap.width*bitmap.height>16_000_000)throw Error('Choisissez une image de 640 × 360 pixels minimum et de 16 millions de pixels maximum.');
    const ratio=Math.min(1,2048/Math.max(bitmap.width,bitmap.height)),width=Math.round(bitmap.width*ratio),height=Math.round(bitmap.height*ratio);
    if(width<640||height<360)throw Error('Cette image est trop étroite pour le montage.');
    const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;const context=canvas.getContext('2d');if(!context)throw Error('L’image ne peut pas être préparée.');
    context.fillStyle='#fff';context.fillRect(0,0,width,height);context.drawImage(bitmap,0,0,width,height);
    const blob=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(Error('L’image ne peut pas être préparée.')),'image/jpeg',.9));
    const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',await blob.arrayBuffer()))].map(b=>b.toString(16).padStart(2,'0')).join('');
    return {blob,asset:PhotoAsset.parse({id,agencyId:'editor-guest',listingId:draftId,sourceUrl:null,sourceOrder:slot,
      objectKey:`agencies/editor-guest/imports/${draftId}/${id}.jpg`,contentHash:hash,mime:'image/jpeg',width,height,sizeBytes:blob.size})};
  }finally{bitmap.close();}
}
export async function guestMusic(id:string,wav:Blob):Promise<EditorMusicUpload>{const metrics=measureMusicWav(new Uint8Array(await wav.arrayBuffer()));
  return {assetId:id,durationMs:metrics.durationMs,waveform:metrics.waveform,normalizationGain:audioNormalizationGain(metrics.rmsDbfs,metrics.peak,-24)};}

export async function transferGuestEditor(record:GuestEditorRecord,agencyId:string,persist:(record:GuestEditorRecord)=>Promise<void>):Promise<string>{
  const fields=CreationFields.safeParse(record.draft.data.fields),settings=VideoCustomization.safeParse(record.draft.data.videoCustomization);
  if(!fields.success||!settings.success||!settings.data.editor)throw Error('Vérifiez le titre, la ville et la narration avant d’enregistrer dans votre compte.');
  const signature=[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify([agencyId,record.connectionKey,record.draft.id,fields.data,settings.data,
    record.draft.photos.map(p=>[p.id,p.sourceOrder,p.contentHash])]))))].map(b=>b.toString(16).padStart(2,'0')).join('');
  let target=record.transfer?.agencyId===agencyId&&record.transfer.signature===signature?record.transfer.draftId:null;
  if(!target){const created=CreationDraftView.parse(await editorResponse(await fetch('/api/imports/draft',{method:'POST',headers:{'Idempotency-Key':`guest-editor-${signature}`}})));
    target=created.id;record={...record,transfer:{agencyId,draftId:target,signature}};await persist(record);}
  const demoPhotos=record.draft.photos.filter(p=>editorDemo().draft.photos.some(source=>source.id===p.id&&source.contentHash===p.contentHash));
  const copied=await editorResponse<{draft:CreationDraftView;voiceSourceId?:string;music?:EditorMusicUpload}>(await fetch('/api/editor-demo/copy',{method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({draftId:target,photos:demoPhotos.map(p=>({id:p.id,slot:p.sourceOrder})),voice:settings.data.voiceSourceId==='demo-voice',music:settings.data.editor.music?.assetId==='demo-music'})}));
  for(const photo of record.draft.photos.filter(p=>!demoPhotos.some(source=>source.id===p.id))){const file=record.files.find(f=>f.id===photo.id);if(!file)throw Error('Une photo locale est manquante.');
    await editorResponse(await fetch(`/api/imports/${target}/uploads/${photo.sourceOrder}`,{method:'PUT',headers:{'Content-Type':file.blob.type,'X-Upload-ID':photo.id},body:file.blob}));}
  let music=settings.data.editor.music;
  if(music){if(music.assetId==='demo-music'){if(!copied.music)throw Error('La musique de démonstration n’a pas pu être copiée.');music={...music,...copied.music};}
    else{const file=record.files.find(f=>f.id===music!.assetId);if(!file)throw Error('La musique locale est manquante.');
      const uploaded=await editorResponse<EditorMusicUpload>(await fetch(`/api/imports/${target}/music/${music.assetId}`,{method:'PUT',headers:{'Content-Type':'audio/wav'},body:file.blob}));music={...music,...uploaded};}}
  const current=CreationDraftView.parse(await editorResponse(await fetch(`/api/imports/${target}/draft`,{cache:'no-store'})));
  const customization={...settings.data,voiceSourceId:copied.voiceSourceId,editor:EditorDocument.parse({...settings.data.editor,music})};
  await editorResponse(await fetch(`/api/imports/${target}/draft`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({version:current.version,changes:fields.data,confirm:[],videoCustomization:customization})}));
  await persist({...record,handoff:false,connectionKey:null,transfer:null});return target;
}
