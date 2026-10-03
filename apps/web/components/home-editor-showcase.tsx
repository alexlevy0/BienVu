'use client';

import Link from 'next/link';
import {useEffect, useRef, useState, type CSSProperties, type PointerEvent} from 'react';
import {HomeIcon} from './home-icons';

const photos = [
  {id: 'salon', src: '/images/studio-home/paris.webp', name: 'Séjour', duration: 7},
  {id: 'interieur', src: '/images/landing/interieur.webp', name: 'Intérieur', duration: 7},
  {id: 'loft', src: '/images/studio-home/lyon.webp', name: 'Loft', duration: 6},
  {id: 'terrasse', src: '/images/studio-home/sud.webp', name: 'Terrasse', duration: 8},
] as const;
type PhotoId = typeof photos[number]['id'];
type Demo = {order: PhotoId[]; durations: Record<PhotoId, number>; text: string; font: string; size: number; color: string; align: 'left' | 'center' | 'right'; x: number; y: number};
const initial: Demo = {order: photos.map(p => p.id), durations: {salon: 7, interieur: 7, loft: 6, terrasse: 8}, text: '65 m² · 3 pièces', font: 'Instrument Serif', size: 72, color: '#ffffff', align: 'center', x: 50, y: 70};
const colors = [{value: '#ffffff', name: 'blanc'}, {value: '#191c18', name: 'noir'}, {value: '#a9bca0', name: 'vert sauge'}, {value: '#d7c7b2', name: 'beige'}, {value: '#8d8e86', name: 'gris'}];
const peaks = Array.from({length: 160}, (_, i) => 5 + Math.round(Math.abs(Math.sin(i * 2.3) * Math.sin(i * .16)) * 30));
const dragType = 'application/x-bienvu-demo-photo';
function clock(seconds: number) {return `0:${String(Math.floor(seconds)).padStart(2, '0')}`;}

export function HomeEditorShowcase({paused, onCreate}: {paused: boolean; onCreate(): void}) {
  const [history, setHistory] = useState<{past: Demo[]; current: Demo; future: Demo[]}>({past: [], current: initial, future: []});
  const [time, setTime] = useState(0), [playing, setPlaying] = useState(false);
  const [dragged, setDragged] = useState<PhotoId | null>(null), [movingText, setMovingText] = useState(false);
  const preview = useRef<HTMLDivElement>(null), playhead = useRef(0), gesture = useRef<{id: number; dx: number; dy: number; moved: boolean} | null>(null);
  playhead.current = time;
  const doc = history.current;
  let start = 0;
  const clips = doc.order.map(id => {const photo = photos.find(p => p.id === id)!; const clip = {...photo, start, duration: doc.durations[id]}; start += clip.duration; return clip;});
  const total = start, selected = clips.find(p => time >= p.start && time < p.start + p.duration) ?? clips.at(-1)!;
  function change(patch: Partial<Demo>, remember = true) {
    setHistory(before => {
      const next = {...before.current, ...patch};
      if (JSON.stringify(next) === JSON.stringify(before.current)) return before;
      return {past: remember ? [...before.past.slice(-49), before.current] : before.past, current: next, future: []};
    });
  }
  function undo() {setPlaying(false); setHistory(before => before.past.length ? {past: before.past.slice(0, -1), current: before.past.at(-1)!, future: [before.current, ...before.future]} : before);}
  function redo() {setPlaying(false); setHistory(before => before.future.length ? {past: [...before.past, before.current], current: before.future[0], future: before.future.slice(1)} : before);}
  function select(id: PhotoId) {setPlaying(false); setTime(clips.find(p => p.id === id)!.start);}
  function reorder(id: PhotoId, target: PhotoId) {
    if (id === target) return;
    const order = [...doc.order], targetIndex = order.indexOf(target); order.splice(order.indexOf(id), 1); order.splice(targetIndex, 0, id);
    change({order}); setPlaying(false); setTime(order.slice(0, order.indexOf(id)).reduce((sum, photoId) => sum + doc.durations[photoId], 0));
  }
  function move(direction: number) {const index = doc.order.indexOf(selected.id); const target = doc.order[index + direction]; if (target) reorder(selected.id, target);}
  function togglePlayback() {if (!playing && time >= total) setTime(0); setPlaying(value => !value);}
  useEffect(() => {if (paused) setPlaying(false);}, [paused]);
  useEffect(() => {if (time > total) setTime(total);}, [total, time]);
  useEffect(() => {
    if (!playing) return;
    let frame = 0, last = 0; const began = performance.now(), from = playhead.current;
    const tick = (now: number) => {
      const next = Math.min(total, from + (now - began) / 1000);
      if (next >= total) {setTime(total); setPlaying(false); return;}
      if (now - last > 80) {setTime(next); last = now;}
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    const hide = () => {if (document.hidden) setPlaying(false);};
    document.addEventListener('visibilitychange', hide);
    return () => {cancelAnimationFrame(frame); document.removeEventListener('visibilitychange', hide);};
  }, [playing, total]);
  function startTextMove(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0 || !preview.current) return;
    setPlaying(false); const bounds = preview.current.getBoundingClientRect();
    gesture.current = {id: event.pointerId, dx: (event.clientX - bounds.left) / bounds.width * 100 - doc.x, dy: (event.clientY - bounds.top) / bounds.height * 100 - doc.y, moved: false};
    event.currentTarget.setPointerCapture(event.pointerId); setMovingText(true);
  }
  function textPosition(element: HTMLDivElement, x: number, y: number) {
    const bounds = preview.current!.getBoundingClientRect(), text = element.getBoundingClientRect();
    const halfX = Math.min(49, text.width / bounds.width * 50 + 1), halfY = Math.min(49, text.height / bounds.height * 50 + 1);
    return {x: Math.max(halfX, Math.min(100 - halfX, x)), y: Math.max(halfY, Math.min(100 - halfY, y))};
  }
  function moveText(event: PointerEvent<HTMLDivElement>) {
    const drag = gesture.current; if (!drag || drag.id !== event.pointerId || !preview.current) return;
    const bounds = preview.current.getBoundingClientRect();
    const position = textPosition(event.currentTarget, (event.clientX - bounds.left) / bounds.width * 100 - drag.dx, (event.clientY - bounds.top) / bounds.height * 100 - drag.dy);
    if (position.x === doc.x && position.y === doc.y) return;
    if (!drag.moved) {setHistory(before => ({...before, past: [...before.past.slice(-49), before.current], future: []})); drag.moved = true;}
    change(position, false);
  }
  const textStyle = {left: `${doc.x}%`, top: `${doc.y}%`, fontFamily: doc.font, color: doc.color, textAlign: doc.align, '--demo-font-size': `${doc.size / 6}cqw`} as CSSProperties;
  const playbackLabel = playing ? 'Mettre la démonstration en pause' : 'Lire la démonstration de l’éditeur';
  return <section className="home-editor-demo" aria-labelledby="home-editor-demo-title">
    <header className="home-editor-demo-heading"><h2 id="home-editor-demo-title">La vidéo est prête.<br/>Le dernier mot est <em>à vous.</em></h2><p>Ajustez les photos, les textes et le rythme pour créer une vidéo à votre image.</p></header>
    <div className="home-editor-demo-window">
      <div className="home-editor-demo-topbar">
        <button type="button" className="home-editor-demo-back" onClick={onCreate} aria-label="Revenir au champ de création"><HomeIcon name="arrow" size={18}/></button>
        <strong>Votre vidéo immobilière <HomeIcon name="pencil" size={15}/></strong><span className="home-editor-demo-status"><HomeIcon name="check" size={16}/>Démo interactive</span>
        <div className="home-editor-demo-top-actions"><button type="button" onClick={undo} disabled={!history.past.length} aria-label="Annuler la modification de démonstration"><HomeIcon name="undo" size={20}/></button><button type="button" onClick={redo} disabled={!history.future.length} aria-label="Rétablir la modification de démonstration"><HomeIcon name="redo" size={20}/></button><button type="button" className="home-editor-demo-preview-button" onClick={togglePlayback} aria-pressed={playing} aria-label={playbackLabel}><HomeIcon name={playing ? 'pause' : 'play'} size={18}/>{playing ? 'Pause' : 'Aperçu'}</button></div>
      </div>
      <div className="home-editor-demo-panels">
        <div className="home-editor-demo-photos"><div className="home-editor-demo-panel-heading"><span>Photos <span>({doc.order.length})</span></span><button type="button" onClick={onCreate} aria-label="Ajouter vos photos dans le champ de création"><HomeIcon name="plus" size={18}/></button></div>
          <div className="home-editor-demo-photo-grid">{clips.map(photo => <button key={photo.id} type="button" draggable aria-pressed={selected.id === photo.id} aria-label={`Afficher le plan ${photo.name}`} title={photo.name} onClick={() => select(photo.id)} className={dragged === photo.id ? 'is-dragged' : ''}
            onDragStart={event => {event.dataTransfer.setData(dragType, photo.id); event.dataTransfer.effectAllowed = 'move'; setDragged(photo.id);}}
            onDragEnd={() => setDragged(null)} onDragOver={event => {if (event.dataTransfer.types.includes(dragType)) {event.preventDefault(); event.dataTransfer.dropEffect = 'move';}}}
            onDrop={event => {if (!event.dataTransfer.types.includes(dragType)) return; event.preventDefault(); const id = event.dataTransfer.getData(dragType) as PhotoId; if (doc.order.includes(id)) reorder(id, photo.id); setDragged(null);}}>
            <img src={photo.src} alt={photo.name} width="768" height="1024" loading="lazy" decoding="async"/></button>)}</div>
          <div className="home-editor-demo-reorder"><span>Changez l’ordre des photos.</span><div><button type="button" onClick={() => move(-1)} disabled={doc.order[0] === selected.id} aria-label="Déplacer le plan sélectionné avant le précédent"><HomeIcon name="arrow" size={16}/></button><button type="button" onClick={() => move(1)} disabled={doc.order.at(-1) === selected.id} aria-label="Déplacer le plan sélectionné après le suivant"><HomeIcon name="arrow" size={16}/></button></div></div>
        </div>
        <div className="home-editor-demo-canvas"><div ref={preview} className="home-editor-demo-portrait" role="group" aria-label={`Aperçu du plan ${selected.name}`}>
          <img key={selected.id} src={selected.src} width="768" height="1024" alt="" loading="lazy" decoding="async" style={{transform: `scale(${1 + (time - selected.start) / selected.duration * .055})`}}/>
          <div className={`home-editor-demo-text${movingText ? ' is-moving' : ''}${doc.color === '#191c18' || doc.color === '#8d8e86' ? ' has-light-background' : ''}`} style={textStyle} tabIndex={0} role="button" aria-label="Déplacer le texte de démonstration avec les flèches du clavier"
            onKeyDown={event => {const keys = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown']; if (!keys.includes(event.key)) return; event.preventDefault(); change(textPosition(event.currentTarget, doc.x + (event.key === 'ArrowLeft' ? -2 : event.key === 'ArrowRight' ? 2 : 0), doc.y + (event.key === 'ArrowUp' ? -2 : event.key === 'ArrowDown' ? 2 : 0)));}}
            onPointerDown={startTextMove} onPointerMove={moveText} onPointerUp={() => {gesture.current = null; setMovingText(false);}} onPointerCancel={() => {gesture.current = null; setMovingText(false);}}>
            <span>{doc.text || 'Votre texte'}</span>{[0, 1, 2, 3, 4, 5].map(corner => <i key={corner} className={`home-editor-demo-handle corner-${corner}`} aria-hidden="true"/>)}</div>
        </div></div>
        <div className="home-editor-demo-controls">
          <label>Texte<input aria-label="Texte de l’aperçu de l’éditeur" value={doc.text} maxLength={70} onChange={event => change({text: event.target.value})}/></label>
          <label>Typographie<select aria-label="Typographie de l’aperçu de l’éditeur" value={doc.font} onChange={event => change({font: event.target.value})}><option value="Instrument Serif">Instrument Serif</option><option value="Inter Tight">Inter Tight</option><option value="Arial">Arial</option></select></label>
          <label>Taille<span className="home-editor-demo-size"><input type="range" min={38} max={90} value={doc.size} aria-label="Taille du texte de l’aperçu de l’éditeur" onChange={event => change({size: Number(event.target.value)})}/><output>{doc.size}</output></span></label>
          <fieldset><legend>Couleur</legend><div className="home-editor-demo-colors">{colors.map(color => <button key={color.value} type="button" aria-label={`Couleur du texte : ${color.name}`} aria-pressed={doc.color === color.value} onClick={() => change({color: color.value})} style={{backgroundColor: color.value}}/>)}</div></fieldset>
          <fieldset><legend>Alignement</legend><div className="home-editor-demo-alignment">{(['left', 'center', 'right'] as const).map((align, i) => <button key={align} type="button" aria-label={`Alignement du texte : ${['gauche', 'centré', 'droite'][i]}`} aria-pressed={doc.align === align} onClick={() => change({align})}><HomeIcon name={['alignLeft', 'alignCenter', 'alignRight'][i] as 'alignLeft' | 'alignCenter' | 'alignRight'} size={18}/></button>)}</div></fieldset>
          <label>Durée du plan <span className="home-editor-demo-clip-duration"><input type="range" min={3} max={12} value={selected.duration} aria-label="Durée du plan sélectionné dans la démonstration" onChange={event => {setPlaying(false); setTime(selected.start); change({durations: {...doc.durations, [selected.id]: Number(event.target.value)}});}}/><output>{selected.duration} s</output></span></label>
        </div>
      </div>
      <div className="home-editor-demo-timeline">
        <div className="home-editor-demo-transport"><button type="button" onClick={togglePlayback} aria-label={playbackLabel} aria-pressed={playing}><HomeIcon name={playing ? 'pause' : 'play'} size={25}/></button><span>{clock(time)} / {clock(total)}</span></div>
        <div className="home-editor-demo-clips" role="group" aria-label="Plans de la démonstration">{clips.map(photo => <button key={photo.id} type="button" aria-pressed={selected.id === photo.id} aria-label={`Aller au plan ${photo.name}, ${photo.duration} secondes`} onClick={() => select(photo.id)} style={{flex: photo.duration}}><img src={photo.src} alt="" width="768" height="1024" loading="lazy" decoding="async"/><span>{photo.name}</span><small>{photo.duration} s</small></button>)}</div>
        <div className="home-editor-demo-voice"><HomeIcon name="microphone" size={20}/><span>Voix off</span></div>
        <div className="home-editor-demo-wave" aria-hidden="true"><svg viewBox="0 0 800 42" preserveAspectRatio="none">{peaks.map((peak, i) => <line key={i} x1={i * 5 + 2} x2={i * 5 + 2} y1={21 - peak / 2} y2={21 + peak / 2}/>)}</svg><span style={{left: `${time / total * 100}%`}}/></div>
        <label className="home-editor-demo-seek"><span className="sr-only">Position de lecture de la démonstration</span><input type="range" min={0} max={total} step={.1} value={time} onChange={event => {setPlaying(false); setTime(Number(event.target.value));}}/></label>
      </div>
    </div>
    <div className="home-editor-demo-caption"><span><svg viewBox="0 0 66 44" fill="none" aria-hidden="true"><path d="M61 37C31 37 20 25 8 9m-1 9 1-9 11 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>Votre touche, en quelques ajustements.</span></div>
    <div className="home-editor-demo-features">
      <article><span className="home-editor-demo-feature-icon"><HomeIcon name="image" size={29}/></span><div><h3>Réorganisez vos photos</h3><p>Changez l’ordre, retirez ou ajoutez des photos pour mettre en valeur les bons espaces.</p></div></article>
      <article><span className="home-editor-demo-feature-icon" aria-hidden="true">Tt</span><div><h3>Placez vos textes</h3><p>Ajoutez les informations essentielles de votre bien et choisissez leur style pour un rendu harmonieux.</p></div></article>
      <article><span className="home-editor-demo-feature-icon"><HomeIcon name="settings" size={29}/></span><div><h3>Ajustez le rythme</h3><p>Définissez la durée de chaque photo pour une vidéo fluide et agréable à regarder.</p></div></article>
    </div>
    <div className="home-editor-demo-cta"><div><h3>Créez automatiquement. Personnalisez librement.</h3><p>Des vidéos prêtes à l’emploi, que vous ajustez comme vous le souhaitez.</p></div><div><button type="button" onClick={onCreate}>Créer ma vidéo <HomeIcon name="arrow" size={21}/></button><Link href="/editeur">Découvrir l’éditeur</Link></div></div>
  </section>;
}
