import Link from 'next/link';
import {StructuredData} from './structured-data';
import {StudioFrame} from './studio-frame';
import {breadcrumbs, absoluteUrl, editorialDate} from '../lib/seo';
import {featurePages, guidePages, type EditorialPage as Content} from '../lib/marketing-content';

export function EditorialPage({page, guide = false}: {page: Content; guide?: boolean}) {
  const path = `${guide ? '/guides' : ''}/${page.slug}`;
  return <StudioFrame active="create"><article className="marketing-page">
    <StructuredData data={breadcrumbs([{name: 'BienVu', path: '/'}, ...(guide ? [{name: 'Guides', path: '/guides'}] : []), {name: page.heading, path}])}/>
    {guide && <StructuredData data={{'@context': 'https://schema.org', '@type': 'Article', headline: page.heading, description: page.description,
      image: absoluteUrl(`/images/studio-home/${page.image}.webp`), datePublished: `${editorialDate}T09:00:00+02:00`, dateModified: `${editorialDate}T09:00:00+02:00`,
      author: {'@type': 'Organization', name: 'BienVu', url: absoluteUrl('/')}, publisher: {'@id': `${absoluteUrl('/')}#organization`}, mainEntityOfPage: absoluteUrl(path), inLanguage: 'fr'}}/>}
    <nav className="marketing-breadcrumb" aria-label="Fil d’Ariane"><Link href="/">BienVu</Link><span aria-hidden="true">/</span>{guide && <><Link href="/guides">Guides</Link><span aria-hidden="true">/</span></>}<span>{guide ? 'Guide' : page.kicker.toLocaleLowerCase('fr-FR')}</span></nav>
    <header className="marketing-hero"><div><p className="marketing-kicker">{page.kicker}</p><h1>{page.heading}</h1><p className="marketing-intro">{page.intro}</p>
      <div className="marketing-actions"><Link href="/" className="marketing-button">Créer ma vidéo <span aria-hidden="true">→</span></Link><Link href={page.slug === 'editeur-video-immobilier' ? '/editeur' : '/explorer'} prefetch={false}>{page.slug === 'editeur-video-immobilier' ? 'Essayer l’éditeur' : 'Voir les exemples'} <span aria-hidden="true">↗</span></Link></div>
      {guide && <p className="marketing-date">Par BienVu · Mis à jour le <time dateTime={editorialDate}>5 octobre 2026</time></p>}
    </div><figure><img src={`/images/studio-home/${page.image}-640.webp`} srcSet={[320,640,960].map(width=>`/images/studio-home/${page.image}-${width}.webp ${width}w`).join(', ')} sizes="(max-width:760px) 90vw, 32vw" width="768" height="1024" alt={`Présentation immobilière : ${page.image === 'sud' ? 'maison et piscine' : page.image === 'lyon' ? 'intérieur d’un loft' : page.image === 'bordeaux' ? 'maison avec jardin' : 'salon lumineux'}`} decoding="async"/><figcaption><Link href={`/exemples/${page.image}`}>Voir la présentation en vidéo →</Link></figcaption></figure></header>
    <div className="marketing-body"><aside className="marketing-toc"><h2>Dans cette page</h2><ol>{page.sections.map((section, index) => <li key={section.title}><a href={`#section-${index + 1}`}>{section.title}</a></li>)}</ol><Link href="/abonnement">Offres et crédits →</Link></aside>
      <div className="marketing-copy">{page.sections.map((section, index) => <section id={`section-${index + 1}`} key={section.title}><h2>{section.title}</h2>{section.paragraphs.map(text => <p key={text}>{text}</p>)}{section.bullets && <ul>{section.bullets.map(text => <li key={text}>{text}</li>)}</ul>}</section>)}
      <section className="marketing-faq" aria-labelledby="marketing-faq-title"><h2 id="marketing-faq-title">Questions fréquentes</h2>{page.faqs.map(faq => <details key={faq.question}><summary>{faq.question}</summary><p>{faq.answer}</p></details>)}</section></div>
    </div>
    <section className="marketing-related"><h2>Pour aller plus loin</h2><div>{page.links.map(link => <Link key={link.path} href={link.path} prefetch={false}>{link.label}<span aria-hidden="true">↗</span></Link>)}</div></section>
    <section className="marketing-cta"><div><h2>Votre prochain bien mérite sa vidéo.</h2><p>Commencez avec l’essai offert, puis choisissez les crédits adaptés à votre activité.</p></div><Link className="marketing-button" href="/">Essayer gratuitement →</Link></section>
    <nav className="marketing-resources" aria-label="Découvrir BienVu">{featurePages.filter(item => item.slug !== page.slug).map(item => <Link href={`/${item.slug}`} key={item.slug}>{item.heading}</Link>)}<Link href="/guides">Tous les guides ({guidePages.length})</Link><Link href="/sources">Sources d’import testées</Link></nav>
  </article></StudioFrame>;
}
