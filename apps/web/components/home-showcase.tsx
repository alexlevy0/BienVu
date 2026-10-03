'use client';

import Link from 'next/link';
import {useEffect, useRef, useState} from 'react';
import type {VideoCustomization} from '@bienvu/contracts';
import {voicePreviews} from '../lib/voice-previews';
import {HomeIcon} from './home-icons';

const voices = ['fish-manon', 'fish-lucas', 'fish-camille'] as const;
const peaks = [4, 5, 8, 12, 19, 26, 35, 23, 15, 12, 18, 26, 20, 15, 26, 33, 21, 13, 6, 9, 21, 34, 43, 30, 20, 15, 24, 28, 22, 13, 9, 14, 22, 32, 38, 29, 21, 15, 21, 30, 25, 18, 13, 17, 24, 20, 11, 7, 11, 20, 30, 23, 17, 9, 14, 18, 12, 9, 6, 5];
function Waveform({active = false}: {active?: boolean}) {
  return <svg className={`home-life-waveform${active ? ' is-playing' : ''}`} viewBox="0 0 300 46" preserveAspectRatio="none" aria-hidden="true">
    {peaks.map((height, i) => <line key={i} x1={i * 5 + 2} x2={i * 5 + 2} y1={23 - height / 2} y2={23 + height / 2} style={{animationDelay: `${i * 25}ms`}}/>)}
  </svg>;
}
const features = [
  {icon: 'microphone', title: 'Votre voix off', subtitle: 'Une présentation claire du bien.', text: 'Une voix off française met en valeur les atouts de votre bien, avec un ton naturel et professionnel.'},
  {icon: 'pencil', title: 'Votre identité', subtitle: 'Logo, couleurs et coordonnées.', text: 'Ajoutez votre logo, vos couleurs et vos coordonnées pour des vidéos à votre image.'},
  {icon: 'settings', title: 'Votre style', subtitle: 'Textes et mise en page personnalisables.', text: 'Choisissez un modèle, puis ajustez librement les textes et la mise en page pour raconter chaque bien à votre façon.'},
] as const;
const questions = [
  {title: 'Puis-je utiliser mes propres photos ?', answer: 'Oui. Glissez vos photos dans le champ principal, puis complétez les informations du bien. Vous pouvez aussi ajouter vos images dans la saisie manuelle ou dans l’éditeur.'},
  {title: 'Puis-je modifier ma vidéo ?', answer: 'Oui. Depuis « Mes vidéos », ouvrez votre création dans l’éditeur pour ajuster les plans, les textes, le cadrage ou le son. Le coût d’un nouvel export est indiqué avant sa création.'},
  {title: 'Comment fonctionnent les crédits ?', answer: 'Créer une vidéo coûte 1 crédit. Chaque nouvelle photo animée avec l’IA ajoute 1 crédit. Les zooms et les mouvements de caméra classiques sont inclus.'},
] as const;

export function HomeShowcase({paused, onCreate}: {paused: boolean; onCreate(): void}) {
  const video = useRef<HTMLVideoElement>(null), audio = useRef<HTMLAudioElement>(null), attempt = useRef(0);
  const [videoPlaying, setVideoPlaying] = useState(false), [videoStarted, setVideoStarted] = useState(false), [videoError, setVideoError] = useState(false);
  const [voice, setVoice] = useState<VideoCustomization['voice']>('fish-manon');
  const [audioState, setAudioState] = useState<'idle' | 'loading' | 'playing'>('idle'), [audioError, setAudioError] = useState(false);
  const [text, setText] = useState('65 m² · 3 pièces'), [font, setFont] = useState('Instrument Serif'), [largeText, setLargeText] = useState(false);
  const [color, setColor] = useState('#ffffff'), [align, setAlign] = useState<'left' | 'center' | 'right'>('center');
  const sample = voicePreviews[voice], audioActive = audioState !== 'idle';
  useEffect(() => {
    const player = audio.current;
    attempt.current++; player?.pause(); setAudioState('idle'); setAudioError(false);
    return () => {attempt.current++; player?.pause();};
  }, [voice]);
  useEffect(() => {if (paused) {attempt.current++; audio.current?.pause(); video.current?.pause(); setAudioState('idle');}}, [paused]);
  useEffect(() => {
    const movie = video.current;
    const pause = () => {if (document.hidden) {attempt.current++; audio.current?.pause(); movie?.pause(); setAudioState('idle');}};
    document.addEventListener('visibilitychange', pause);
    return () => {movie?.pause(); document.removeEventListener('visibilitychange', pause);};
  }, []);
  async function toggleVoice() {
    const player = audio.current; if (!player) return;
    if (audioActive) {attempt.current++; player.pause(); player.currentTime = 0; setAudioState('idle'); return;}
    video.current?.pause(); const current = ++attempt.current; setAudioError(false); setAudioState('loading');
    if (player.error) player.load(); player.currentTime = 0;
    try {await player.play(); if (attempt.current === current) setAudioState('playing');}
    catch {if (attempt.current === current) {setAudioState('idle'); setAudioError(true);}}
  }
  async function playVideo() {
    const player = video.current; if (!player) return;
    setVideoError(false); if (player.error) player.load();
    try {await player.play();} catch (error) {if (!(error instanceof DOMException && error.name === 'AbortError')) setVideoError(true);}
  }
  const voiceLabel = audioActive ? `Arrêter l’extrait de la voix ${sample.name}` : `Écouter un exemple avec la voix ${sample.name}`;
  return <section className="home-life" aria-labelledby="home-life-title">
    <header className="home-life-heading">
      <p className="home-life-kicker">La différence BienVu</p>
      <h2 id="home-life-title">Vos photos <em>prennent vie.</em></h2>
      <p>Des images, une voix, les détails qui comptent.</p>
    </header>
    <div className="home-life-stage">
      <figure className="home-life-photo">
        <img src="/images/studio-home/paris.webp" width="768" height="1024" loading="lazy" decoding="async" alt="Exemple de photo d’un salon lumineux avec grandes fenêtres et cheminée"/>
        <figcaption className="home-life-badge"><HomeIcon name="image" size={18}/>Votre photo</figcaption>
      </figure>
      <svg className="home-life-arrow" viewBox="0 0 64 50" fill="none" aria-hidden="true"><path d="M4 31C19 10 38 12 56 31m-1-12 1 12-12-2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>
      <figure className="home-life-video">
        <figcaption className="home-life-badge home-life-video-badge"><HomeIcon name="play" size={17}/>Votre vidéo BienVu</figcaption>
        <video ref={video} src="/videos/studio-home/paris.mp4" poster="/images/studio-home/paris.webp" controls={videoStarted} playsInline preload="none" aria-label="Exemple de vidéo BienVu : un appartement à Paris"
          onPlay={() => {attempt.current++; audio.current?.pause(); setAudioState('idle'); setVideoError(false); setVideoStarted(true); setVideoPlaying(true);}}
          onPause={() => setVideoPlaying(false)} onEnded={() => setVideoPlaying(false)} onError={() => {setVideoPlaying(false); setVideoError(true);}}/>
        <div className="home-life-video-facts" aria-hidden="true"><strong>Paris</strong><span>65 m² · 3 pièces</span><b>385 000 €</b></div>
        {!videoPlaying && <button type="button" className="home-life-video-play" aria-label="Lire la vidéo de démonstration" onClick={() => void playVideo()}><HomeIcon name="play" size={28}/></button>}
      </figure>
      <div className="home-life-extras">
        <span className="home-life-animation-badge"><svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true"><path d="m12 3 2.4 6.6L21 12l-6.6 2.4L12 21l-2.4-6.6L3 12l6.6-2.4L12 3Zm7-2 1 3 3 1-3 1-1 3-1-3-3-1 3-1 1-3Z"/></svg>Animation IA en option</span>
        <button type="button" className="home-life-voice-mini" aria-label={voiceLabel} aria-pressed={audioActive} onClick={() => void toggleVoice()}>
          <span className="home-life-mini-play"><HomeIcon name={audioActive ? 'stop' : 'play'} size={17}/></span>
          <span><span>Voix off française</span><Waveform active={audioActive}/></span>
        </button>
      </div>
    </div>
    {videoError && <p className="home-life-media-error" role="alert">La démonstration n’a pas pu être lue. Cliquez sur Lecture pour réessayer.</p>}
    <div className="home-life-features">{features.map(feature => <article key={feature.title}>
      <span className="home-life-feature-icon"><HomeIcon name={feature.icon} size={29}/></span>
      <div><h3>{feature.title}</h3><p className="home-life-feature-subtitle">{feature.subtitle}</p><p>{feature.text}</p></div>
    </article>)}</div>
    <div className="home-life-demo-grid">
      <article className="home-life-demo-card">
        <h3>Une voix qui raconte votre bien.</h3>
        <p>Générez une voix off naturelle et professionnelle à partir des informations de votre annonce.</p>
        <div className="home-life-audio-player"><button type="button" aria-label={voiceLabel} aria-pressed={audioActive} onClick={() => void toggleVoice()}><HomeIcon name={audioActive ? 'stop' : 'play'} size={29}/></button><Waveform active={audioActive}/></div>
        <div className="home-life-audio-caption"><span role="status">{audioState === 'loading' ? 'Chargement…' : audioActive ? 'Arrêter l’exemple' : 'Écouter un exemple'}</span>
          <label><span className="sr-only">Voix de l’exemple</span><select value={voice} onChange={event => setVoice(event.target.value as VideoCustomization['voice'])}>{voices.map(value => <option key={value} value={value}>{voicePreviews[value].name} · Français</option>)}</select><HomeIcon name="chevron" size={15}/></label>
        </div>
        {audioError && <p className="home-life-media-error" role="alert">L’extrait est indisponible. Réessayez dans un instant.</p>}
      </article>
      <article className="home-life-demo-card">
        <h3>Chaque détail vous appartient.</h3>
        <p>Modifiez simplement les textes, les couleurs et votre logo.</p>
        <div className="home-life-editor-demo">
          <img src="/images/studio-home/paris.webp" width="768" height="1024" loading="lazy" decoding="async" alt="Exemple de personnalisation du texte sur une photo du bien"/>
          <div className={`home-life-editable${color === '#ffffff' ? '' : ' has-light-background'}`}>
            <label className="sr-only" htmlFor="home-demo-text">Texte de démonstration</label>
            <input id="home-demo-text" value={text} maxLength={60} placeholder="Votre texte" onChange={event => setText(event.target.value)} style={{color, fontFamily: font, fontSize: largeText ? '36px' : '29px', textAlign: align}}/>
            {[0, 1, 2, 3].map(corner => <i key={corner} className={`home-life-text-handle corner-${corner}`} aria-hidden="true"/>)}
          </div>
          <div className="home-life-text-toolbar" role="group" aria-label="Personnaliser le texte de démonstration">
            <label><span className="sr-only">Typographie de démonstration</span><select value={font} onChange={event => setFont(event.target.value)}><option value="Instrument Serif">Instrument Serif</option><option value="Inter Tight">Inter Tight</option></select></label>
            <button type="button" aria-label="Agrandir le texte de démonstration" aria-pressed={largeText} onClick={() => setLargeText(value => !value)}>Aa</button>
            {['#ffffff', '#171714', '#dfe7d5'].map((value, index) => <button type="button" key={value} aria-label={['Texte blanc', 'Texte noir', 'Texte vert clair'][index]} aria-pressed={color === value} onClick={() => setColor(value)}><span className="home-life-color" style={{backgroundColor: value}}/></button>)}
            <button type="button" aria-label="Changer l’alignement du texte de démonstration" title={`Alignement : ${align === 'left' ? 'gauche' : align === 'right' ? 'droite' : 'centré'}`} onClick={() => setAlign(value => value === 'left' ? 'center' : value === 'center' ? 'right' : 'left')}><HomeIcon name={align === 'left' ? 'alignLeft' : align === 'right' ? 'alignRight' : 'alignCenter'} size={17}/></button>
            <button type="button" aria-label="Effacer le texte de démonstration" onClick={() => setText('')}><HomeIcon name="trash" size={16}/></button>
          </div>
        </div>
      </article>
    </div>
    <div className="home-life-faq" aria-labelledby="home-life-faq-title"><h3 id="home-life-faq-title">Questions<br/>fréquentes</h3>{questions.map(question => <details key={question.title}><summary><HomeIcon name="plus" size={21}/><span>{question.title}</span></summary><p>{question.answer}</p></details>)}</div>
    <div className="home-life-cta"><div><h3>Et si c’était votre prochain bien ?</h3><p>Transformez vos photos en une vidéo élégante, prête à partager.</p></div><div className="home-life-cta-actions"><button type="button" onClick={onCreate}>Créer ma vidéo <HomeIcon name="arrow" size={20}/></button><Link href="/abonnement">Découvrir les offres</Link></div></div>
    <audio key={voice} ref={audio} src={sample.src} preload="none" hidden onEnded={() => setAudioState('idle')} onError={() => {attempt.current++; setAudioState('idle'); setAudioError(true);}}/>
  </section>;
}
