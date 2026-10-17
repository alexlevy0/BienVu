import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {defaultVideoCustomization,videoPhotoTimeline,VIDEO_LAYERS} from '../packages/contracts/src/index';
import {customizationPreview,previewFrame} from '../apps/web/lib/customizer-preview';
import {EditorialPhotoScene,StyledPhotoScene,CinematicPhotoScene,HorizontalPhotoScene,PreviewLayers,VerticalBrand} from '../packages/presentation/src/index';
import type {ManualDraftFields} from '../apps/web/lib/listing-draft';
const require=createRequire(new URL('../apps/web/package.json',import.meta.url));
const {createElement}=require('react'),{renderToStaticMarkup}=require('react-dom/server');
const fields:ManualDraftFields={title:'Maison avec jardin',locality:'La Rochelle',propertyType:'house',transaction:'sale',priceCents:'425 000,50',area:'72,5',rooms:'3',charges:'',description:''};
const photos=Array.from({length:12},(_,i)=>({id:`photo-${i}`,preview:`/photo-${i}.jpg`,slot:i}));
function model(duration:20|30|40=20,aspectRatio:'9:16'|'16:9'='9:16',settings=defaultVideoCustomization()){
 return customizationPreview({settings,fields,agencyName:'Agence de recette',duration,aspectRatio,narration:['Bienvenue à La Rochelle.','Visitons cette maison.','Un lieu à découvrir.','Contactez votre agence.'],subtitles:true,voice:true,photos});
}
test('Aperçu : timeline complète, cadrage natif, fin exacte et priorité des textes',()=>{
 for(const duration of [20,30,40] as const)for(const aspect of ['9:16','16:9'] as const){
  const preview=model(duration,aspect),m=preview.manifest;
  assert.deepEqual(m.photoTimeline,videoPhotoTimeline(photos,duration*30));assert.equal(m.width,aspect==='9:16'?1080:1920);assert.equal(m.height,aspect==='9:16'?1920:1080);
  assert.equal(m.presentation!.priceCents,42500050);assert.equal(m.presentation!.areaM2,72.5);
  assert.equal(previewFrame(preview,-1).photoIndex,0);assert.equal(previewFrame(preview,9999).photoIndex,11);assert.equal(previewFrame(preview,9999).sceneIndex,3);
  for(let index=0;index<12;index++)assert.equal(previewFrame(preview,preview.timeline[index].start).photoIndex,index);
  assert.ok(VIDEO_LAYERS.content>VIDEO_LAYERS.avatar);assert.ok(VIDEO_LAYERS.subtitles>VIDEO_LAYERS.avatar);
 }
 const animated={...defaultVideoCustomization(),photoOrder:photos.map(p=>p.slot),runwayPhotos:[0,11]};
 assert.deepEqual(model(30,'9:16',animated).manifest.photoTimeline,videoPhotoTimeline(photos,900,['photo-0','photo-11']));
});
test('Aperçu : carte réservée, informations manquantes sans invention et voix désactivée',()=>{
 const input={settings:defaultVideoCustomization(),fields:{...fields,priceCents:'',area:'',rooms:''},agencyName:'',duration:20 as const,aspectRatio:'9:16' as const,narration:['','','',''],subtitles:true,voice:false,photos};
 const preview=customizationPreview({...input,map:{view:'plan',position:'start',durationSeconds:3,zoomStart:12,zoomEnd:15,location:null}});
 assert.equal(preview.timeline[0].start,90);assert.equal(preview.timeline.at(-1)!.start+preview.timeline.at(-1)!.durationFrames,600);
 assert.equal(preview.manifest.presentation!.priceCents,null);assert.equal(preview.manifest.subtitlesEnabled,false);
 assert.doesNotThrow(()=>previewFrame(customizationPreview({...input,photos:[]}),600));
});
// Captured from the previous renderer JSX, before extraction into the portable package.
test('Mises en page communes : référence des trois styles, dans les deux formats',async()=>{
 const golden=JSON.parse(await readFile(new URL('../fixtures/presentation-layout.json',import.meta.url),'utf8')) as Record<string,string>;
 for(const style of ['editorial','minimal','cinematic'] as const)for(const aspect of ['9:16','16:9'] as const)for(const index of [0,1,3])for(const frame of [0,45]){
  const {manifest,media}=model(20,aspect,{...defaultVideoCustomization(),style});
  const Scene=aspect==='16:9'?HorizontalPhotoScene:style==='editorial'?EditorialPhotoScene:style==='minimal'?StyledPhotoScene:CinematicPhotoScene;
  const html=renderToStaticMarkup(createElement(Scene,{manifest,media,index,frame,Layers:PreviewLayers}));
  const key=`${style}:${aspect}:${index}:${frame}`;
  assert.equal(createHash('sha256').update(html).digest('hex'),golden[key],key);
 }
 const preview=model(20,'9:16',{...defaultVideoCustomization(),style:'cinematic'});
 assert.match(renderToStaticMarkup(createElement(VerticalBrand,{...preview,frame:50,logoBackground:'#fff'})),/Agence de recette/);
});
