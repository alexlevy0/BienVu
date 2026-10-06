import {notFound} from 'next/navigation';
import {BlogArticlePage} from '../../../components/blog-article';
import {blogArticleDates, blogArticlePath, blogImagePath, findBlogArticle} from '../../../lib/blog-content';
import {absoluteUrl, seoMetadata} from '../../../lib/seo';
import '../../landing.css';
import '../../blog.css';

// Keep runtime routing aligned with the other editorial pages on the OpenNext Worker.
export const dynamic = 'force-dynamic';
type Props = {params: Promise<{slug: string}>};
export async function generateMetadata({params}: Props) {
  const {slug} = await params, article = findBlogArticle(slug);
  if (!article) notFound();
  const dates = blogArticleDates(article);
  const metadata = seoMetadata({title: article.title, description: article.description, path: blogArticlePath(article), image: blogImagePath(article), type: 'article'});
  return {...metadata, openGraph: {...metadata.openGraph, type: 'article' as const, publishedTime: dates.publishedAt,
    modifiedTime: dates.modifiedAt, authors: [absoluteUrl('/blog#redaction-bienvu')]}};
}
export default async function Page({params}: Props) {
  const {slug} = await params, article = findBlogArticle(slug);
  if (!article) notFound();
  return <BlogArticlePage article={article}/>;
}
