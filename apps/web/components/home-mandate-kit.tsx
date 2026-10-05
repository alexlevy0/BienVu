'use client';

import type {HomepageSlot} from '@bienvu/contracts';
import {HomeIcon} from './home-icons';
import {HomeVisual, useHomepageMedia, homeClock} from './homepage-media';

const contents = ['Reel Instagram', 'Story Instagram', 'TikTok', 'Vidéo horizontale', 'Post Facebook', 'Visuel prix / surface', 'Texte de publication'];
type PreviewKind = 'reel' | 'story' | 'tiktok' | 'landscape';

function PlatformMark({kind}: {kind: PreviewKind}) {
  if (kind === 'landscape') return <HomeIcon name="video" size={22}/>;
  if (kind === 'reel') return <HomeIcon name="clapper" size={22}/>;
  if (kind === 'story') return <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="18" cy="6" r="1" fill="currentColor" stroke="none"/></svg>;
  return <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor" aria-hidden="true"><path d="M14 2h3c.3 3 1.7 4.4 5 4.7v3a9 9 0 0 1-5-1.6V16a6 6 0 1 1-6-6v3a3 3 0 1 0 3 3V2Z"/></svg>;
}

function Preview({kind, onPlay}: {kind: PreviewKind; onPlay(slot: HomepageSlot): void}) {
  const visual = useHomepageMedia(`kit.${kind}.visual`), movie = useHomepageMedia(`kit.${kind}.video`);
  const custom = visual.custom || movie.custom, locality = movie.locality ?? visual.locality;
  const title = movie.custom ? movie.title : visual.custom ? visual.title : null;
  const label = kind === 'landscape' ? 'Vidéo' : kind === 'tiktok' ? 'TikTok' : 'Instagram';
  return <button type="button" className={`home-kit-card home-kit-preview home-kit-${kind}`} aria-label={`Lire l’aperçu : ${contents[['reel', 'story', 'tiktok', 'landscape'].indexOf(kind)]}`} aria-haspopup="dialog" onClick={() => onPlay(`kit.${kind}.video`)}>
    <HomeVisual media={visual} alt={title ?? (kind === 'tiktok' ? 'Loft lumineux aux grandes fenêtres' : 'Appartement lumineux aux moulures et grandes fenêtres')}/>
    <span className="home-kit-image-shade" aria-hidden="true"/>
    <span className="home-kit-platform"><PlatformMark kind={kind}/>{label}</span>
    {kind === 'story' ? <><span className="home-kit-story-progress" aria-hidden="true"><i/><i/><i/><i/></span><span className="home-kit-story-link">Découvrir le bien <HomeIcon name="arrow" size={17}/></span></>
      : <span className="home-kit-play" aria-hidden="true"><HomeIcon name="play" size={25}/></span>}
    {kind !== 'story' && <span className="home-kit-facts">
      <strong>{custom ? title ?? 'Découvrez ce bien' : kind === 'reel' ? 'Votre futur chez-vous' : kind === 'tiktok' ? '65 m² à Lyon : on visite ?' : 'Lyon 6e'}</strong>
      {custom ? <span>{locality ?? movie.agency ?? visual.agency ?? 'Votre agence'}</span> : <>
        {kind === 'landscape' ? <span>65 m² · 3 pièces · 385 000 €</span> : <><span className="home-kit-property"><span><HomeIcon name="house" size={12}/>Lyon 6e</span><span><HomeIcon name="fullscreen" size={12}/>65 m²</span><span><HomeIcon name="landscape" size={12}/>3 pièces</span></span><b>385 000 €</b></>}
      </>}
    </span>}
    {kind === 'tiktok' && <span className="home-kit-social-actions" aria-hidden="true"><svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M12 21 3 12a6 6 0 0 1 9-8 6 6 0 0 1 9 8Z"/></svg><HomeIcon name="subtitles" size={21}/><HomeIcon name="document" size={21}/><HomeIcon name="send" size={21}/></span>}
    {kind === 'landscape' && <span className="home-kit-video-controls" aria-hidden="true"><span className="home-kit-progress"><i/></span><span>0:00 / {homeClock(movie.duration ?? 28)}</span><HomeIcon name="fullscreen" size={15}/></span>}
  </button>;
}

function FacebookPost() {
  const media = useHomepageMedia('kit.facebook.visual');
  return <article className="home-kit-card home-kit-facebook" aria-label="Exemple de post Facebook">
    <header><span className="home-kit-facebook-mark" aria-hidden="true">f</span><strong>Facebook</strong><HomeIcon name="more" size={18}/></header>
    <div className="home-kit-facebook-agency"><span className="home-kit-agency-avatar"><HomeVisual media={media}/></span><div><strong>{media.agency ?? 'Votre Agence Immobilière'}</strong><span>{media.custom ? media.locality ?? 'Présentation du bien' : 'Lyon 6e'} · <HomeIcon name="globe" size={10}/></span></div></div>
    <p>{media.custom ? media.title ?? 'Découvrez notre bien en images.' : 'À vendre — Appartement 3 pièces à Lyon 6e. 65 m² de lumière et de caractère, dans un quartier recherché.'}</p>
    <div className="home-kit-facebook-photo"><HomeVisual media={media} alt={media.title ?? 'Photo de l’appartement pour une publication Facebook'}/></div>
  </article>;
}

function PriceVisual() {
  const media = useHomepageMedia('kit.price.visual');
  return <figure className="home-kit-card home-kit-price" aria-label="Exemple de visuel prix et surface">
    <HomeVisual media={media} alt={media.title ?? 'Appartement mis en valeur dans un visuel immobilier'}/>
    <span className="home-kit-image-shade" aria-hidden="true"/>
    <span className="home-kit-price-locality">{media.custom ? media.locality ?? media.agency ?? 'Votre bien' : 'Lyon 6e'}</span>
    <figcaption>{media.custom ? <strong className="home-kit-custom-title">{media.title ?? 'Votre annonce'}</strong> : <><strong>385 000 €</strong><span>65 m² · 3 pièces</span></>}</figcaption>
  </figure>;
}

function PublicationText() {
  const media = useHomepageMedia('kit.facebook.visual');
  return <article className="home-kit-card home-kit-publication" aria-label="Exemple de texte de publication"><header><span><HomeIcon name="alignLeft" size={20}/>Publication</span><HomeIcon name="more" size={20}/></header><p>{media.custom ? <>{media.title ?? 'Un nouveau bien à découvrir.'}{media.locality && <><br/>{media.locality}.</>}</> : <>À découvrir à Lyon 6e.<br/>65 m² de lumière et de caractère.</>}<br/><span>Contactez votre agence pour une visite.</span></p></article>;
}

export function HomeMandateKit({onPlay, onCreate}: {onPlay(slot: HomepageSlot): void; onCreate(): void}) {
  return <section className="home-kit" aria-labelledby="home-kit-title">
    <div className="home-kit-panel">
      <div className="home-kit-copy">
        <p className="home-kit-kicker">Le kit de votre mandat</p>
        <h2 id="home-kit-title">1 mandat <svg className="home-kit-heading-arrow" viewBox="0 0 110 42" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true"><path d="M2 21h101M85 4l18 17-18 17"/></svg><em>7 contenus</em></h2>
        <p className="home-kit-description">Un seul bien. Sept façons<br/> de le faire découvrir.</p>
        <ol className="home-kit-content-list">{contents.map((label, index) => <li key={label}><span aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>{label}</li>)}</ol>
        <button type="button" className="home-kit-create" onClick={onCreate}>Créer mes contenus <HomeIcon name="arrow" size={23}/></button>
      </div>
      <div className="home-kit-board" role="group" aria-label="Un aperçu des sept contenus de votre mandat">
        <Preview kind="reel" onPlay={onPlay}/><Preview kind="story" onPlay={onPlay}/><Preview kind="tiktok" onPlay={onPlay}/><Preview kind="landscape" onPlay={onPlay}/>
        <FacebookPost/><PriceVisual/>
        <PublicationText/>
      </div>
    </div>
    <p className="home-kit-caption">Une annonce, déclinée pour chaque canal.</p>
  </section>;
}
