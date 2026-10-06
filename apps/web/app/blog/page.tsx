import Link from 'next/link';
import {StudioFrame} from '../../components/studio-frame';
import {StructuredData} from '../../components/structured-data';
import {BlogCard} from '../../components/blog-card';
import {blogArticles, blogArticleDates, blogArticlePath, blogReadingMinutes} from '../../lib/blog-content';
import {blogCategories} from '../../lib/blog/types';
import {absoluteUrl, breadcrumbs, seoMetadata} from '../../lib/seo';
import '../landing.css';
import '../blog.css';

export const metadata = seoMetadata({title: 'Blog immobilier : vidéo, IA et réseaux sociaux — BienVu',
  description: 'Marketing immobilier IA, vidéos, Instagram, TikTok, YouTube, photos, textes et suivi : vingt articles pratiques pour les agences immobilières.', path: '/blog'});

export default function Page() {
  const featured = blogArticles[0]!;
  return <StudioFrame active="create"><section className="blog-page blog-index">
    <StructuredData data={breadcrumbs([{name: 'BienVu', path: '/'}, {name: 'Blog', path: '/blog'}])}/>
    <StructuredData data={{'@context': 'https://schema.org', '@type': 'Blog', '@id': `${absoluteUrl('/blog')}#blog`, name: 'Le blog BienVu',
      description: 'Méthodes et exemples de marketing immobilier, de création vidéo et de diffusion pour les agences.', url: absoluteUrl('/blog'), inLanguage: 'fr-FR',
      publisher: {'@type': 'Organization', name: 'BienVu', url: absoluteUrl('/')},
      blogPost: blogArticles.map(article => ({'@type': 'BlogPosting', headline: article.heading, url: absoluteUrl(blogArticlePath(article)), datePublished: blogArticleDates(article).publishedAt}))}}/>
    <header className="blog-heading"><p className="blog-eyebrow">LE BLOG BIENVU</p><h1>Des idées pour vos mandats.<br/><em>Des méthodes pour votre agence.</em></h1><p>Création, communication et diffusion : des conseils concrets pour présenter vos biens et organiser votre marketing.</p></header>
    <article className="blog-featured"><div className="blog-featured-copy"><p className="blog-eyebrow">POUR COMMENCER</p><h2><Link href={blogArticlePath(featured)} prefetch={false}>{featured.heading}</Link></h2><p>{featured.excerpt}</p><p className="blog-byline">Rédaction BienVu <span aria-hidden="true">·</span> {blogReadingMinutes(featured)} min de lecture</p><Link className="blog-button" href={blogArticlePath(featured)} prefetch={false}>Lire l’article <span aria-hidden="true">→</span></Link></div><Link className="blog-featured-image" href={blogArticlePath(featured)} prefetch={false} aria-label={`Lire : ${featured.heading}`}><img src={`/images/studio-home/${featured.image}-640.webp`} srcSet={[320,640,960].map(width=>`/images/studio-home/${featured.image}-${width}.webp ${width}w`).join(', ')} sizes="(max-width:760px) 90vw, 36vw" width="768" height="1024" alt={featured.imageAlt} decoding="async"/></Link></article>
    <nav className="blog-categories" aria-label="Thèmes du blog">{blogCategories.map(category => <a href={`#${category.id}`} key={category.id}>{category.label}<span>{blogArticles.filter(article => article.category === category.id).length}</span></a>)}</nav>
    {blogCategories.map(category => <section className="blog-category-section" id={category.id} key={category.id} aria-labelledby={`title-${category.id}`}><div className="blog-section-heading"><h2 id={`title-${category.id}`}>{category.label}</h2><p>{blogArticles.filter(article => article.category === category.id).length} {blogArticles.filter(article => article.category === category.id).length === 1 ? 'article' : 'articles'}</p></div><div className="blog-grid">{blogArticles.filter(article => article.category === category.id).map(article => <BlogCard key={article.slug} article={article}/>)}</div></section>)}
    <aside className="blog-editorial-note" id="redaction-bienvu"><h2>La rédaction BienVu</h2><p>Nous partageons des méthodes de préparation, de création et de diffusion liées au travail des agences. Les exemples sont à adapter aux faits de vos mandats ; les informations sur les droits et les annonces renvoient aux références officielles.</p><Link href="/guides">Les guides de prise en main <span aria-hidden="true">↗</span></Link><a href="mailto:contact@bienvu.online">Proposer un sujet <span aria-hidden="true">↗</span></a></aside>
    <section className="blog-cta"><div><h2>Faites vivre votre prochain mandat.</h2><p>Vos annonces et vos photos, une vidéo à personnaliser et à partager.</p></div><Link href="/" className="blog-button">Essayer gratuitement <span aria-hidden="true">→</span></Link></section>
  </section></StudioFrame>;
}
