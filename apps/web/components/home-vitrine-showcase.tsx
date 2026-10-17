import Link from 'next/link';
import {propertyPrice} from '@bienvu/contracts';
import {HomeIcon} from './home-icons';
import {showcaseExampleCover, showcaseExamplePath, showcaseExampleProperties} from '../lib/showcase-example';

const benefits = [
  {icon:'palette', title:'À vos couleurs', text:'Une vitrine qui reflète l’identité de votre agence.'},
  {icon:'phone', title:'Pensée pour le mobile', text:'Une expérience fluide et élégante sur tous les écrans.'},
  {icon:'share', title:'Facile à partager', text:'Un lien unique à diffuser auprès de vos futurs clients.'},
] as const;

function ExampleScreen({mobile = false}: {mobile?:boolean}) {
  return <div className={`home-vitrine-screen${mobile?' is-mobile':''}`}>
    <div className="home-vitrine-example-nav"><span className="home-vitrine-example-brand"><HomeIcon name="house" size={28}/><span>AGENCE<strong>BELLEVUE</strong></span></span><span className="home-vitrine-example-links">Nos biens <span>À propos</span></span><span className="home-vitrine-example-contact">Nous contacter</span>{mobile&&<HomeIcon name="menu" size={16}/>}</div>
    <div className="home-vitrine-example-cover">
      <img src={showcaseExampleCover} srcSet="/images/showcase-example/riviera-640.webp 640w, /images/showcase-example/riviera-1024.webp 1024w" sizes={mobile?'240px':'(max-width: 760px) 85vw, 65vw'} alt="" width={1024} height={400} loading="lazy" decoding="async"/>
      <span className="home-vitrine-example-cover-copy">Votre prochain<br/>coup de cœur.<small>Des lieux de vie à découvrir sur la Côte d’Azur.</small><span>Nous contacter <HomeIcon name="arrow" size={13}/></span></span>
    </div>
    <div className="home-vitrine-example-catalogue"><div className="home-vitrine-example-heading"><strong>Nos biens</strong><span>Voir tous les biens <HomeIcon name="arrow" size={12}/></span></div><div className="home-vitrine-example-cards">
      {showcaseExampleProperties.slice(0,mobile?2:4).map(property => <div className="home-vitrine-example-card" key={property.id}>
        <img src={property.cover!.url.replace('-640.webp','-320.webp')} width={320} height={427} alt="" loading="lazy" decoding="async"/>
        <span className="home-vitrine-example-favourite"><HomeIcon name="heart" size={17}/></span><span className="home-vitrine-example-play"><HomeIcon name="play" filled size={15}/></span>
        <span className="home-vitrine-example-card-copy"><small><HomeIcon name="location" size={10}/>{property.fields.locality}</small><strong>{propertyPrice(property.fields)}</strong><span>{property.fields.area} m² · {property.fields.rooms} pièces</span></span>
      </div>)}
    </div></div>
  </div>;
}

export function HomeVitrineShowcase() {
  return <section className="home-vitrine" data-home-motion="vitrine" aria-labelledby="home-vitrine-title">
    <header className="home-vitrine-heading"><p className="home-vitrine-eyebrow">MA VITRINE</p><h2 id="home-vitrine-title">Une vitrine à votre image.</h2><p>Votre agence, vos biens et vos vidéos. Une page à partager avec vos clients.</p><div className="home-vitrine-actions"><Link className="home-vitrine-create" href="/ma-vitrine" prefetch={false}>Créer ma vitrine <HomeIcon name="arrow" size={22}/></Link><Link className="home-vitrine-example-link" href={showcaseExamplePath} prefetch={false}>Voir un exemple <HomeIcon name="external" size={18}/></Link></div></header>
    <Link className="home-vitrine-devices" href={showcaseExamplePath} prefetch={false} aria-label="Découvrir l’exemple de vitrine Agence Bellevue, sur ordinateur et mobile">
      <span className="home-vitrine-example-label">Exemple de vitrine</span>
      <div className="home-vitrine-browser" aria-hidden="true"><div className="home-vitrine-browser-toolbar"><span className="home-vitrine-browser-dots"><i/><i/><i/></span><span className="home-vitrine-browser-address"><HomeIcon name="lock" size={10}/>bienvu.online/agences/votre-agence</span><HomeIcon name="external" size={12}/></div><ExampleScreen/></div>
      <div className="home-vitrine-mobile" aria-hidden="true"><div className="home-vitrine-mobile-status"><span>9:41</span><span>••• ▰</span></div><span className="home-vitrine-mobile-notch"/><ExampleScreen mobile/></div>
    </Link>
    <div className="home-vitrine-benefits">{benefits.map(benefit => <article key={benefit.title}><HomeIcon name={benefit.icon} size={34}/><div><h3>{benefit.title}</h3><p>{benefit.text}</p></div></article>)}</div>
    <p className="home-vitrine-demo-note">Agence et biens fictifs présentés à titre d’exemple.</p>
  </section>;
}
