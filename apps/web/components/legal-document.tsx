import Link from 'next/link';
import type {ReactNode} from 'react';
import {HomeIcon, HomeWordmark} from './home-icons';

export type LegalContents = readonly {id: string; title: string}[];

export function LegalDocument({kind, title, introduction, contents, children}: {
  kind: 'conditions' | 'confidentialite'; title: string; introduction: string;
  contents: LegalContents; children: ReactNode;
}) {
  return <div className="legal-page">
    <a className="legal-skip" href="#legal-content">Aller au contenu</a>
    <header className="legal-header">
      <Link href="/" aria-label="BienVu, retour à l’accueil"><HomeWordmark/></Link>
      <Link className="legal-back" href="/"><HomeIcon name="arrow" size={18}/> Retour au studio</Link>
    </header>
    <main id="legal-content">
      <div className="legal-hero">
        <p className="legal-kicker">BIENVU · INFORMATIONS</p>
        <h1>{title}</h1>
        <p className="legal-introduction">{introduction}</p>
        <p className="legal-updated">Dernière mise à jour : <time dateTime="2026-10-03">3 octobre 2026</time></p>
        <nav className="legal-tabs" aria-label="Documents BienVu">
          <Link href="/conditions" aria-current={kind === 'conditions' ? 'page' : undefined}>Conditions d’utilisation</Link>
          <Link href="/confidentialite" aria-current={kind === 'confidentialite' ? 'page' : undefined}>Politique de confidentialité</Link>
        </nav>
      </div>
      <div className="legal-body">
        <nav className="legal-contents" aria-label="Sommaire">
          <p>Sur cette page</p>
          <ol>{contents.map((item, index) => <li key={item.id}><a href={`#${item.id}`}><span aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>{item.title}</a></li>)}</ol>
          <a className="legal-contact" href="mailto:contact@bienvu.online">Une question ?<br/><strong>contact@bienvu.online</strong></a>
        </nav>
        <article className="legal-article">{children}</article>
      </div>
      <aside className="legal-help"><div><p className="legal-kicker">À VOTRE ÉCOUTE</p><h2>Besoin d’une précision ?</h2><p>Écrivez-nous pour toute question sur le service ou vos données.</p></div><a href="mailto:contact@bienvu.online">Nous contacter <HomeIcon name="arrow" size={18}/></a></aside>
    </main>
    <footer className="legal-footer"><span>© BienVu · Votre studio immobilier</span><nav aria-label="Informations"><Link href="/conditions">Conditions</Link><Link href="/confidentialite">Confidentialité</Link><a href="mailto:contact@bienvu.online">Contact</a></nav></footer>
  </div>;
}

export function LegalSection({id, title, children}: {id: string; title: string; children: ReactNode}) {
  return <section className="legal-section" id={id} aria-labelledby={`${id}-title`}><h2 id={`${id}-title`}>{title}</h2>{children}</section>;
}
