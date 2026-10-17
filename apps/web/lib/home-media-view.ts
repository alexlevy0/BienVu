import {homepageSlots, type HomepageConfig, type HomepageSlot} from '@bienvu/contracts';
import {homeComparisonAssets} from './home-comparison-assets';
export type HomeMediaView = {src:string;poster:string|null;kind:'image'|'video';custom:boolean;title:string|null;agency:string|null;locality:string|null;duration:number|null;width:number|null;height:number|null};
export function resolveHomeMedia(config: HomepageConfig, id: HomepageSlot): HomeMediaView {
  const slot = homepageSlots.find(item => item.id === id)!;
  let asset = config.slots[id], cover = false;
  if (!asset && id.endsWith('.visual')) {const partner = config.slots[id.replace(/\.visual$/, '.video') as HomepageSlot]; if (partner) {asset = partner; cover = true;}}
  if (!asset && id.endsWith('.video')) {const partner = config.slots[id.replace(/\.video$/, '.visual') as HomepageSlot]; if (partner?.kind === 'video') asset = partner;}
  if (asset) return {src: cover && asset.posterUrl ? asset.posterUrl : asset.url, poster: asset.posterUrl, kind: cover && asset.posterUrl ? 'image' : asset.kind,
    custom: true, title: asset.title, agency: asset.agency, locality: asset.locality, duration: asset.durationMs ? asset.durationMs / 1000 : null, width: asset.width, height: asset.height};
  const comparison=homeComparisonAssets.find(item=>item.src===slot.src);
  return {src: comparison?`/api/homepage/comparison/${comparison.id}`:slot.src, poster: slot.kind === 'video' ? slot.src.replace('/videos/', '/images/').replace(/\.mp4$/, '.webp') : null,
    kind: slot.kind === 'video' ? 'video' : 'image', custom: false, title: null, agency: null, locality: null,
    duration:comparison&&'duration' in comparison?comparison.duration:null,width:comparison&&'width' in comparison?comparison.width:null,height:comparison&&'height' in comparison?comparison.height:null};
}
export function imageWidthUrl(src: string, width: number) {
  if (src.startsWith('/api/homepage/media/')) {const url = new URL(src, 'https://bienvu.online'); url.searchParams.set('w', String(width)); return `${url.pathname}${url.search}`;}
  if (/^\/images\/studio-home\/(paris|sud|lyon|bordeaux|comparison-ai|comparison-classic|renders-standard|renders-avatar|renders-avatar-ai)\.webp$/.test(src)) return src.replace('.webp', `-${width}.webp`);
  return src;
}
export const heroPosterSizes='(max-width: 760px) 310px, (max-width: 1250px) 250px, (max-width: 1600px) 330px, 440px';
export const heroInlinePosterMedia='(max-width: 760px) and (max-resolution: 1.1dppx)';
export const heroRemotePosterMedia=`not all and ${heroInlinePosterMedia}`;
export function homeImageSrcSet(src:string){return imageWidthUrl(src,320)!==src?[320,640,960].map(width=>`${imageWidthUrl(src,width)} ${width}w`).join(', '):undefined;}
export function previewVideoUrl(src: string,width:540|720=720) {
  if (!src.startsWith('/api/homepage/media/')) return src;
  const url = new URL(src, 'https://bienvu.online'); url.searchParams.set('preview', width===540?'540':'1'); return `${url.pathname}${url.search}`;
}
