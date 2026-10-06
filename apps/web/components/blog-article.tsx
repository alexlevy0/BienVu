import Link from 'next/link';
import {StudioFrame} from './studio-frame';
import {StructuredData} from './structured-data';
import {BlogCard} from './blog-card';
import {blogArticleDates, blogArticlePath, blogArticleSchema, blogDateLabel, blogReadingMinutes, findBlogArticle} from '../lib/blog-content';
import {blogCategories, type BlogArticle} from '../lib/blog/types';
import {breadcrumbs} from '../lib/seo';

export function BlogArticlePage({article}: {article: BlogArticle}) {
  const related = article.related.map(findBlogArticle).filter((item): item is BlogArticle => !!item);
  const dates = blogArticleDates(article);
  return <StudioFrame active="create"><article className="blog-page blog-article">
    <StructuredData data={breadcrumbs([{name: 'BienVu', path: '/'}, {name: 'Blog', path: '/blog'}, {name: article.heading, path: blogArticlePath(article)}])}/>
    <StructuredData data={blogArticleSchema(article)}/>
    <nav className="blog-breadcrumb" aria-label="Fil d’Ariane"><Link href="/">BienVu</Link><span aria-hidden="true">/</span><Link href="/blog">Le blog</Link><span aria-hidden="true">/</span><span>{blogCategories.find(category => category.id === article.category)?.label}</span></nav>
    <header className="blog-article-header"><p className="blog-eyebrow">{blogCategories.find(category => category.id === article.category)?.label}</p>
      <h1>{article.heading.replace(/ :/g, '\u00a0:')}</h1><p className="blog-lead">{article.excerpt}</p>
      <p className="blog-byline"><Link href="/blog#redaction-bienvu">Rédaction BienVu</Link><span aria-hidden="true">·</span><time dateTime={dates.publishedAt}>{blogDateLabel(dates.publishedAt)}</time><span aria-hidden="true">·</span><span>{blogReadingMinutes(article)} min de lecture</span></p>
      <img className="blog-article-cover" src={`/images/studio-home/${article.image}-960.webp`}
        srcSet={[320, 640, 960].map(width => `/images/studio-home/${article.image}-${width}.webp ${width}w`).join(', ')}
        sizes="(max-width:760px) 90vw, 75vw" width="960" height="450" alt={article.imageAlt} decoding="async"/>
    </header>
    <div className="blog-reading-layout">
      <aside className="blog-toc"><nav aria-label="Sommaire de l’article"><h2>Dans cet article</h2><ol>{article.sections.map(section => <li key={section.id}><a href={`#${section.id}`}>{section.title}</a></li>)}</ol><a href="#questions-frequentes">Questions fréquentes</a></nav><Link className="blog-toc-cta" href="/">Essayer BienVu <span aria-hidden="true">→</span></Link></aside>
      <div className="blog-copy">
        <div className="blog-introduction">{article.intro.map(text => <p key={text}>{text}</p>)}</div>
        <aside className="blog-takeaways" aria-labelledby="blog-takeaways-title"><h2 id="blog-takeaways-title">Les points à retenir</h2><ul>{article.takeaways.map(text => <li key={text}>{text}</li>)}</ul></aside>
        {article.sections.map(section => <section id={section.id} key={section.id}>
          <h2>{section.title}</h2>{section.paragraphs.map(text => <p key={text}>{text}</p>)}
          {section.list && (section.list.ordered ? <ol>{section.list.items.map(text => <li key={text}>{text}</li>)}</ol> : <ul>{section.list.items.map(text => <li key={text}>{text}</li>)}</ul>)}
          {section.examples?.map(example => <figure className="blog-example" key={example.title}><figcaption>{example.title}</figcaption><blockquote><p>{example.text}</p></blockquote>{example.note && <p className="blog-example-note">{example.note}</p>}</figure>)}
          {section.table && <div className="blog-table-wrap" role="region" aria-label={section.table.caption} tabIndex={0}><table><caption>{section.table.caption}</caption><thead><tr>{section.table.columns.map(column => <th key={column} scope="col">{column}</th>)}</tr></thead><tbody>{section.table.rows.map((row, index) => <tr key={index}>{row.map((cell, column) => column === 0 ? <th key={column} scope="row">{cell}</th> : <td key={column}>{cell}</td>)}</tr>)}</tbody></table></div>}
          {section.sources && <p className="blog-sources">Références : {section.sources.map((source, index) => <span key={source.url}>{index > 0 && ' · '}<a href={source.url} rel="noopener noreferrer">{source.label}</a></span>)}</p>}
        </section>)}
        <section id="questions-frequentes" className="blog-faq"><h2>Questions fréquentes</h2>{article.faqs.map(faq => <details key={faq.question}><summary>{faq.question}</summary><p>{faq.answer}</p></details>)}</section>
        <nav className="blog-product-links" aria-label="Mettre ces conseils en pratique"><h2>Dans votre studio BienVu</h2>{article.links.map(link => <Link key={link.path} href={link.path} prefetch={false}>{link.label} <span aria-hidden="true">↗</span></Link>)}</nav>
      </div>
    </div>
    <section className="blog-cta"><div><p className="blog-eyebrow">DE LA LECTURE À LA CRÉATION</p><h2>Votre prochain mandat,<br/>en version vidéo.</h2><p>Préparez vos informations et vos photos, puis essayez BienVu gratuitement.</p></div><Link href="/" className="blog-button">Créer ma vidéo <span aria-hidden="true">→</span></Link></section>
    <section className="blog-related" aria-labelledby="blog-related-title"><div className="blog-section-heading"><h2 id="blog-related-title">Pour aller plus loin</h2><Link href="/blog">Tous les articles <span aria-hidden="true">↗</span></Link></div><div className="blog-grid">{related.map(item => <BlogCard key={item.slug} article={item}/>)}</div></section>
  </article></StudioFrame>;
}
