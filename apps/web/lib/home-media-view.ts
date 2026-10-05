import {homepageSlots, type HomepageConfig, type HomepageSlot} from '@bienvu/contracts';
export type HomeMediaView = {src:string;poster:string|null;kind:'image'|'video';custom:boolean;title:string|null;agency:string|null;locality:string|null;duration:number|null;width:number|null;height:number|null};
export function resolveHomeMedia(config: HomepageConfig, id: HomepageSlot): HomeMediaView {
  const slot = homepageSlots.find(item => item.id === id)!;
  let asset = config.slots[id], cover = false;
  if (!asset && id.endsWith('.visual')) {const partner = config.slots[id.replace(/\.visual$/, '.video') as HomepageSlot]; if (partner) {asset = partner; cover = true;}}
  if (!asset && id.endsWith('.video')) {const partner = config.slots[id.replace(/\.video$/, '.visual') as HomepageSlot]; if (partner?.kind === 'video') asset = partner;}
  if (asset) return {src: cover && asset.posterUrl ? asset.posterUrl : asset.url, poster: asset.posterUrl, kind: cover && asset.posterUrl ? 'image' : asset.kind,
    custom: true, title: asset.title, agency: asset.agency, locality: asset.locality, duration: asset.durationMs ? asset.durationMs / 1000 : null, width: asset.width, height: asset.height};
  return {src: slot.src, poster: slot.kind === 'video' ? slot.src.replace('/videos/', '/images/').replace(/\.mp4$/, '.webp') : null,
    kind: slot.kind === 'video' ? 'video' : 'image', custom: false, title: null, agency: null, locality: null, duration: null, width: null, height: null};
}
export function imageWidthUrl(src: string, width: number) {
  if (src.startsWith('/api/homepage/media/')) {const url = new URL(src, 'https://bienvu.online'); url.searchParams.set('w', String(width)); return `${url.pathname}${url.search}`;}
  if (/^\/images\/studio-home\/(paris|sud|lyon|bordeaux)\.webp$/.test(src)) return src.replace('.webp', `-${width}.webp`);
  return src;
}
export function previewVideoUrl(src: string) {
  if (!src.startsWith('/api/homepage/media/')) return src;
  const url = new URL(src, 'https://bienvu.online'); url.searchParams.set('preview', '1'); return `${url.pathname}${url.search}`;
}
