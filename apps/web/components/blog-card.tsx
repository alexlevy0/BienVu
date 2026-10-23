import { blogReadingMinutes } from '../lib/blog-content';
import { blogCategories, type BlogArticle } from '../lib/blog/types';
import { BlogCoverTransition, BlogLink, BlogTitleTransition } from './blog-transition';

export function BlogCard({ article, origin = 'index' }: { article: BlogArticle; origin?: string }) {
  return (
    <article className="blog-card">
      <BlogLink slug={article.slug} origin={origin}>
        <BlogCoverTransition slug={article.slug} origin={origin}>
          <img
            src={`/images/studio-home/${article.image}-640.webp`}
            srcSet={[320, 640, 960]
              .map((width) => `/images/studio-home/${article.image}-${width}.webp ${width}w`)
              .join(', ')}
            sizes="(max-width:760px) 90vw, (max-width:1150px) 40vw, 28vw"
            width="768"
            height="1024"
            alt={article.imageAlt}
            loading="lazy"
            decoding="async"
          />
        </BlogCoverTransition>
        <div className="blog-card-copy">
          <p className="blog-card-meta">
            <span>{blogCategories.find((category) => category.id === article.category)?.label}</span>
            <span>{blogReadingMinutes(article)} min de lecture</span>
          </p>
          <BlogTitleTransition slug={article.slug} origin={origin}>
            <h3>{article.heading}</h3>
          </BlogTitleTransition>
          <p>{article.excerpt}</p>
          <span className="blog-card-link">
            Lire l’article <span aria-hidden="true">↗</span>
          </span>
        </div>
      </BlogLink>
    </article>
  );
}
