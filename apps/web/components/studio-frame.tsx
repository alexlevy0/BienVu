'use client';
import Link from 'next/link';
import type {ReactNode} from 'react';
import {StudioSidebar} from './studio-sidebar';

export function StudioFrame({active, children, showFooter=true}: {active: 'videos' | 'explore' | 'agency' | 'offers' | 'projects' | 'admin' | 'social'; children: ReactNode; showFooter?: boolean}) {
  return <div className="home-studio">
    <a className="home-skip" href="#home-content">Aller au contenu</a>
    <StudioSidebar active={active}/>
    <div className="home-workspace">
      <header className="home-topbar"><span>Le studio marketing IA de votre agence immobilière.</span><a href="mailto:contact@bienvu.online">Aide</a></header>
      <main className="home-content" id="home-content" tabIndex={-1}>{children}</main>
      {showFooter && <footer className="home-footer"><span>BienVu · L’immobilier, en mouvement.</span><nav aria-label="Informations"><Link href="/">Accueil</Link><Link href="/confidentialite">Confidentialité</Link><Link href="/conditions">Conditions</Link><a href="mailto:contact@bienvu.online">Contact</a></nav></footer>}
    </div>
  </div>;
}
