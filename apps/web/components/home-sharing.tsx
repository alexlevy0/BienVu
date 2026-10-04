'use client';
import {HomeIcon} from './home-icons';
import {HomeVisual,useHomepageMedia,homeClock} from './homepage-media';

function VideoPreview({context, onPlay}: {context: 'social' | 'client' | 'site'; onPlay(): void}) {
  const visual=useHomepageMedia(`share.${context}.visual`),movie=useHomepageMedia(`share.${context}.video`);
  const custom=visual.custom||movie.custom,duration=homeClock(movie.duration??28);
  const labels = {social: 'les réseaux sociaux', client: 'une présentation client', site: 'un site d’agence'};
  return <button type="button" className={`home-share-preview home-share-preview-${context}`} onClick={onPlay} aria-haspopup="dialog" aria-label={`Lire l’exemple de vidéo pour ${labels[context]}`}>
    <HomeVisual media={visual}/>
    <span className="home-share-preview-shade" aria-hidden="true"/>
    {context === 'social' && !custom && <>
      <span className="home-share-social-header" aria-hidden="true"><span><i><HomeIcon name="house" size={17}/></i>Votre agence</span><span>9:16</span></span>
      <span className="home-share-social-facts" aria-hidden="true"><strong>Paris</strong><span>65 m² · 3 pièces</span></span>
    </>}
    <span className="home-share-play" aria-hidden="true"><HomeIcon name="play" size={27}/></span>
    {context === 'client' ? <span className="home-share-duration" aria-hidden="true">{duration}</span> : <span className="home-share-preview-controls" aria-hidden="true">
      {context === 'site' && <HomeIcon name="play" size={17}/>}
      <span className="home-share-progress"><i/></span>
      {context === 'site' && <><span>0:00 / {duration}</span><svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M4 9h4l5-5v16l-5-5H4V9Zm12-1a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/></svg><HomeIcon name="fullscreen" size={19}/></>}
    </span>}
  </button>;
}

export function HomeSharing({onPlay, onCreate}: {onPlay(context: 'social'|'client'|'site'): void; onCreate(): void}) {
  const site=useHomepageMedia('share.site.visual'),siteMovie=useHomepageMedia('share.site.video'),customSite=site.custom||siteMovie.custom;
  return <section className="home-sharing" aria-labelledby="home-sharing-title">
    <header className="home-sharing-heading">
      <h2 id="home-sharing-title">Une vidéo. Plusieurs façons <em>de la partager.</em></h2>
      <p>Téléchargez votre vidéo et choisissez où elle fera son effet.</p>
    </header>
    <div className="home-share-grid">
      <article className="home-share-example">
        <div className="home-share-visual home-share-social"><VideoPreview context="social" onPlay={()=>onPlay('social')}/></div>
        <div className="home-share-caption"><h3>Sur vos réseaux</h3><p>Présentez vos biens en stories et en publications.</p></div>
      </article>
      <article className="home-share-example">
        <div className="home-share-visual home-share-client">
          <div className="home-share-client-header"><span className="home-share-avatar" aria-hidden="true">A</span><div><strong>Présentation du bien</strong><span>À : Sophie Martin</span></div><HomeIcon name="more" size={21}/></div>
          <div className="home-share-client-body"><div className="home-share-message"><p>Voici la vidéo du bien dont nous avons parlé.</p><span>10:24</span></div><VideoPreview context="client" onPlay={()=>onPlay('client')}/></div>
        </div>
        <div className="home-share-caption"><h3>À vos clients</h3><p>Accompagnez vos échanges d’une présentation en vidéo.</p></div>
      </article>
      <article className="home-share-example home-share-site-example">
        <div className="home-share-visual home-share-site">
          <div className="home-share-site-header"><strong>{customSite?(siteMovie.agency??site.agency??'Votre agence'):'Maison & Quartier'}</strong><span aria-hidden="true"><span>Biens</span><span>Quartiers</span><span>Agence</span><HomeIcon name="menu" size={18}/></span></div>
          <VideoPreview context="site" onPlay={()=>onPlay('site')}/>
          <div className="home-share-site-details"><div><strong>{customSite?(siteMovie.title??site.title):'Appartement à Paris'}</strong>{!customSite&&<p>65 m² · 3 pièces</p>}</div><span className="home-share-site-lines" aria-hidden="true"><i/><i/><i/></span></div>
        </div>
        <div className="home-share-caption"><h3>Sur votre site</h3><p>Enrichissez vos annonces avec une visite en vidéo.</p></div>
      </article>
    </div>
    <div className="home-share-download">
      <span className="home-share-download-icon"><HomeIcon name="download" size={38}/></span>
      <div className="home-share-download-copy"><h3>Un fichier vidéo, prêt à partager.</h3><p>Votre logo, vos informations et votre voix off réunis dans une vidéo.</p></div>
      <div className="home-share-formats" role="group" aria-label="Formats vidéo disponibles">
        <div><span className="home-share-format-icon"><HomeIcon name="phone" size={29}/></span><div><strong>Vertical <span>9:16</span></strong><p>Format idéal pour vos stories et publications.</p></div></div>
        <div><span className="home-share-format-icon"><HomeIcon name="landscape" size={31}/></span><div><strong>Horizontal <span>16:9</span></strong><p>Format idéal pour vos annonces et votre site.</p></div></div>
      </div>
    </div>
    <div className="home-share-cta"><h3>Votre prochain bien mérite sa vidéo.</h3><button type="button" onClick={onCreate}>Créer ma vidéo <HomeIcon name="arrow" size={22}/></button></div>
  </section>;
}
