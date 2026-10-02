import {getCloudflareContext} from '@opennextjs/cloudflare';
import {notFound} from 'next/navigation';
import Link from 'next/link';
import {StudioFrame} from '../../../components/studio-frame';
import {RequestFailure} from '../../../lib/http';
import {findPublic} from '../../../lib/sharing';
import '../../landing.css';
import '../explorer.css';

export const dynamic = 'force-dynamic';
export const metadata = {title: 'Une vidéo partagée'};

export default async function Page({params}: {params: Promise<{id: string}>}) {
  const {env} = await getCloudflareContext({async: true});
  let video: Awaited<ReturnType<typeof findPublic>>['view'];
  try {video = (await findPublic(env.DB, (await params).id)).view;}
  catch (error) {if (error instanceof RequestFailure && error.code === 'NOT_FOUND') notFound(); throw error;}
  return <StudioFrame active="explore"><article className="public-video">
    <Link href="/explorer" className="public-video-back">← &nbsp; Explorer les vidéos</Link>
    <div className={`public-video-layout${video.aspectRatio==='16:9'?' is-horizontal':''}`}><div className="public-video-player"><video src={video.videoUrl} poster={video.posterUrl} controls playsInline preload="metadata" aria-label={`Vidéo : ${video.title}`}/></div>
      <div className="public-video-copy"><p className="public-explore-kicker">UNE HISTOIRE PARTAGÉE</p><h1>{video.title}</h1><p>Une vidéo immobilière par <strong>{video.agency}</strong>.</p><p>Voix française de synthèse · Partagée avec l’accord de l’agence. Ce lien reste disponible jusqu’au {new Date(video.expiresAt).toLocaleDateString('fr-FR', {day: 'numeric', month: 'long', year: 'numeric'})}, sauf retrait anticipé.</p><Link href="/" className="public-video-cta">Créer une vidéo <span aria-hidden="true">↗</span></Link></div>
    </div>
  </article></StudioFrame>;
}
