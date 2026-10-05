import {getCloudflareContext} from '@opennextjs/cloudflare';
import {notFound} from 'next/navigation';
import Link from 'next/link';
import {StudioFrame} from '../../../components/studio-frame';
import {RequestFailure} from '../../../lib/http';
import {findPublic} from '../../../lib/sharing';
import {cache} from 'react';
import {seoMetadata,videoSchema,breadcrumbs} from '../../../lib/seo';
import {StructuredData} from '../../../components/structured-data';
import '../../landing.css';
import '../explorer.css';

export const dynamic = 'force-dynamic';
const read=cache(async(id:string)=>{
  const {env} = await getCloudflareContext({async: true});
  let video: Awaited<ReturnType<typeof findPublic>>['view'];
  try {video = (await findPublic(env.DB, id)).view;}
  catch (error) {if (error instanceof RequestFailure && error.code === 'NOT_FOUND') notFound(); throw error;}
  return video;
});
const description=(video:Awaited<ReturnType<typeof read>>)=>`Découvrez ${video.title}${video.locality?` à ${video.locality}`:''}, une vidéo immobilière de ${Math.round(video.durationSeconds)} secondes partagée par ${video.agency}.`;
export async function generateMetadata({params}:{params:Promise<{id:string}>}) {
  const video=await read((await params).id);
  return seoMetadata({title:`${video.title} — Vidéo immobilière par ${video.agency}`,description:description(video),path:video.pageUrl,image:video.posterUrl});
}
export default async function Page({params}: {params: Promise<{id: string}>}) {
  const video=await read((await params).id);
  return <StudioFrame active="explore"><article className="public-video">
    <StructuredData data={videoSchema({title:video.title,description:description(video),path:video.pageUrl,poster:video.posterUrl,src:video.videoUrl,seconds:video.durationSeconds,publishedAt:video.publishedAt})}/>
    <StructuredData data={breadcrumbs([{name:'BienVu',path:'/'},{name:'Explorer',path:'/explorer'},{name:video.title,path:video.pageUrl}])}/>
    <Link href="/explorer" className="public-video-back">← &nbsp; Explorer les vidéos</Link>
    <div className={`public-video-layout${video.aspectRatio==='16:9'?' is-horizontal':''}`}><div className="public-video-player"><video src={video.videoUrl} poster={video.posterUrl} controls playsInline preload="metadata" aria-label={`Vidéo : ${video.title}`}/></div>
      <div className="public-video-copy"><p className="public-explore-kicker">UNE HISTOIRE PARTAGÉE</p><h1>{video.title}</h1><p>Une vidéo immobilière par <strong>{video.agency}</strong>.</p><p>Voix française de synthèse · Partagée avec l’accord de l’agence. Ce lien reste disponible tant que l’agence ne retire pas la vidéo.</p><Link href="/" className="public-video-cta">Créer une vidéo <span aria-hidden="true">↗</span></Link></div>
    </div>
  </article></StudioFrame>;
}
