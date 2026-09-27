import Link from 'next/link';
import {Shell} from '../components/shell';
import {GenerationForm} from '../components/generation-form';
import {VideoIllustration} from '../components/video-illustration';
import {Icon} from '../components/icon';
export default function Page() {
  return <Shell><div className="page-heading"><div><p className="eyebrow">VOTRE PROCHAINE BELLE HISTOIRE</p><h1>Donnez une autre dimension<br/>à vos <em>annonces.</em></h1><p className="page-intro">Un lien, les photos du bien, la signature de votre agence.<br className="desktop-break"/> Bientôt, une vidéo prête à être partagée.</p></div><span className="heading-index">01 — VOTRE STUDIO</span></div>
    <section className="creation-card" aria-labelledby="creation-title"><div className="creation-content"><span className="section-kicker"><Icon name="spark" size={16}/>DE L’ANNONCE À LA VIDÉO</span><h2 id="creation-title">Tout commence par un lien.</h2><p>Présentez un bien en vidéo, sans montage à réaliser.</p><GenerationForm/><div className="feature-line"><span><Icon name="check" size={14}/>Format vertical</span><span><Icon name="check" size={14}/>Voix de synthèse</span><span><Icon name="check" size={14}/>Identité d’agence</span></div></div><div className="creation-preview"><VideoIllustration/></div></section>
    <section className="getting-started" aria-labelledby="steps-title"><div className="section-header"><h2 id="steps-title">Votre studio, en trois temps.</h2><span>Un parcours pensé pour aller à l’essentiel</span></div><div className="step-grid">
      <article className="step-card"><span className="step-number">01</span><Icon name="building" size={23}/><h3>Votre signature</h3><p>Un logo, vos couleurs, vos coordonnées. Une identité enregistrée pour vos futures vidéos.</p><Link href="/agence">Découvrir mon agence<Icon name="arrow" size={16}/></Link></article>
      <article className="step-card"><span className="step-number">02</span><Icon name="link" size={23}/><h3>Votre annonce</h3><p>Un lien suffit. Les informations et les photos devront être vérifiées avant la génération.</p><Link href="/generer">Préparer une vidéo<Icon name="arrow" size={16}/></Link></article>
      <article className="step-card"><span className="step-number">03</span><Icon name="film" size={23}/><h3>Votre vidéo</h3><p>Prévisualisez, téléchargez, partagez. Vos créations seront réunies dans votre espace.</p><Link href="/historique">Voir mes vidéos<Icon name="arrow" size={16}/></Link></article>
    </div></section></Shell>;
}
