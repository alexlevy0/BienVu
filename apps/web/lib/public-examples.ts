import {cache} from 'react';
import {getCloudflareContext} from '@opennextjs/cloudflare';
import {readHomepageConfig} from './homepage-media';
import {resolveHomeMedia,imageWidthUrl} from './home-media-view';
import {examples} from './marketing-content';
import {editorialDate} from './seo';
import type {HomepageConfig} from '@bienvu/contracts';
export const publishedHome = cache(async () => readHomepageConfig((await getCloudflareContext({async:true})).env.DB));
export async function publicExample(id:string,homepage?:HomepageConfig) {
  const example=examples.find(item=>item.id===id);if(!example)return null;
  const config=homepage??await publishedHome(),movie=resolveHomeMedia(config,`discover.${example.id}.video`),visual=resolveHomeMedia(config,`discover.${example.id}.visual`);
  const custom=movie.custom;
  return {...example,title:custom?movie.title??visual.title??example.title:example.title,agency:custom?movie.agency??visual.agency??'BienVu':example.agency,
    locality:custom?movie.locality??visual.locality??'':example.locality,custom,
    // A changed selection has no old locality or property claims attached to it.
    description:custom?'Une vidéo immobilière sélectionnée par BienVu pour illustrer la présentation d’un bien.':example.description,
    src:movie.src,poster:imageWidthUrl(visual.kind==='image'?visual.src:movie.poster??`/images/studio-home/${id}.webp`,640),
    seconds:movie.duration??example.durationSeconds,publishedAt:config.slots[`discover.${example.id}.video`]?.createdAt??`${editorialDate}T09:00:00+02:00`};
}
