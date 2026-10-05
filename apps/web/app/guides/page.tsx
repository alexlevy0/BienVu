import Link from 'next/link';
import {StudioFrame} from '../../components/studio-frame';
import {guidePages} from '../../lib/marketing-content';
import {seoMetadata} from '../../lib/seo';
import '../landing.css';
import '../marketing.css';
export const metadata = seoMetadata({title: 'Guides de marketing immobilier et vidéo IA — BienVu', description: 'Des guides pratiques pour créer une vidéo immobilière, choisir vos photos et préparer les publications Instagram et Facebook de votre agence.', path: '/guides'});
export default function Page() {
  return <StudioFrame active="create"><section className="marketing-page"><header className="marketing-heading"><p className="marketing-kicker">LES GUIDES BIENVU</p><h1>Des idées pour présenter vos biens.</h1><p>Des étapes concrètes pour préparer vos photos, vos vidéos et vos publications.</p></header><div className="marketing-guide-grid">{guidePages.map(page => <article key={page.slug}><Link href={`/guides/${page.slug}`}><img src={`/images/studio-home/${page.image}-640.webp`} srcSet={[320,640,960].map(width=>`/images/studio-home/${page.image}-${width}.webp ${width}w`).join(', ')} sizes="(max-width:760px) 90vw, 40vw" width="768" height="1024" alt="" loading="lazy"/><p className="marketing-kicker">{page.kicker}</p><h2>{page.heading}</h2><p>{page.intro}</p><span>Lire le guide →</span></Link></article>)}</div><p className="marketing-guide-end"><Link href="/comment-ca-marche">Découvrir le fonctionnement de BienVu →</Link></p></section></StudioFrame>;
}
