import Link from 'next/link';
import {blogArticlePath, blogReadingMinutes} from '../lib/blog-content';
import {blogCategories, type BlogArticle} from '../lib/blog/types';

export function BlogCard({article}: {article: BlogArticle}) {
  return <article className="blog-card">
    <Link href={blogArticlePath(article)} prefetch={false}>
      <img src={`/images/studio-home/${article.image}-640.webp`}
        srcSet={[320, 640, 960].map(width => `/images/studio-home/${article.image}-${width}.webp ${width}w`).join(', ')}
        sizes="(max-width:760px) 90vw, (max-width:1150px) 40vw, 28vw" width="768" height="1024"
        alt={article.imageAlt} loading="lazy" decoding="async"/>
      <div className="blog-card-copy"><p className="blog-card-meta"><span>{blogCategories.find(category => category.id === article.category)?.label}</span><span>{blogReadingMinutes(article)} min de lecture</span></p>
        <h3>{article.heading}</h3><p>{article.excerpt}</p><span className="blog-card-link">Lire l’article <span aria-hidden="true">↗</span></span>
      </div>
    </Link>
  </article>;
}
