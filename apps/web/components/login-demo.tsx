'use client';

import {useEffect, useRef, useState} from 'react';

const title = 'Lumière sur Paris';
const poster = '/images/studio-home/paris.webp';
const video = '/videos/studio-home/paris.mp4';

export function LoginDemo() {
  const [open, setOpen] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    if (!open) return;
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialog.current?.showModal();
    return () => {dialog.current?.close(); trigger?.focus();};
  }, [open]);

  return <aside className="login-studio-showcase" aria-label="Démonstration vidéo BienVu">
    <div className="login-studio-showcase-top"><span>BIENVU / DÉMONSTRATION</span><span>01 — 28 S</span></div>
    <div className="login-studio-showcase-body">
      <div className="login-studio-showcase-heading"><span>UN APERÇU DE CE QUE VOUS POUVEZ CRÉER</span>
        <h2>Une annonce.<br/><em>Une autre dimension.</em></h2></div>
      <button className="login-studio-demo-cover" type="button" onClick={() => setOpen(true)} aria-label={`Lire la vidéo de démonstration « ${title} »`} aria-haspopup="dialog">
        <img src={poster} alt="" width="768" height="1024" fetchPriority="high"/>
        <span className="login-studio-demo-top"><span className="login-studio-demo-lines" aria-hidden="true"><i/><i/><i/></span><span>00:28</span></span>
        <span className="login-studio-demo-play" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="m9 5 11 7-11 7V5Z"/></svg></span>
        <span className="login-studio-demo-bottom"><span className="login-studio-demo-name">Lumière<br/><em>sur Paris.</em></span><span className="login-studio-demo-brand">◱ BienVu</span></span>
      </button>
      <div className="login-studio-demo-caption"><span><strong>{title}</strong><small>Maison & Quartier · Paris</small></span><span aria-hidden="true">↗</span></div>
    </div>
    <p className="login-studio-showcase-note">Démonstration fictive, sans voix · Vos vidéos utilisent les photos et la signature de votre agence.</p>
    {open && <dialog ref={dialog} className="login-studio-dialog" aria-label={`Démonstration : ${title}`} onCancel={() => setOpen(false)} onClick={event => {if (event.target === event.currentTarget) setOpen(false);}}>
      <button className="login-studio-dialog-close" type="button" onClick={() => setOpen(false)} aria-label="Fermer la vidéo">×</button>
      <video src={video} poster={poster} controls autoPlay playsInline preload="metadata" aria-label={`Vidéo de démonstration : ${title}`}>Votre navigateur ne prend pas en charge la lecture vidéo.</video>
      <p>{title} · Animation sans voix. Bien et agence fictifs.</p>
    </dialog>}
  </aside>;
}
