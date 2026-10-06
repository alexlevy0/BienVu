import {marketingArticle} from './blog/articles/marketing';
import {mandatArticle} from './blog/articles/mandat';
import {reelsArticle} from './blog/articles/reels';
import {montageArticle} from './blog/articles/montage';
import {voixArticle} from './blog/articles/voix';
import {animationArticle} from './blog/articles/animation';
import {musiqueArticle} from './blog/articles/musique';
import {calendrierArticle} from './blog/articles/calendrier';
import {redactionArticle} from './blog/articles/redaction';
import {budgetArticle} from './blog/articles/budget';
import {storiesArticle} from './blog/articles/stories';
import {tiktokArticle} from './blog/articles/tiktok';
import {shortsArticle} from './blog/articles/shorts';
import {smartphoneArticle} from './blog/articles/photos-smartphone';
import {subtitlesArticle} from './blog/articles/sous-titres';
import {identityArticle} from './blog/articles/identite';
import {approvalArticle} from './blog/articles/validation';
import {clientMessagesArticle} from './blog/articles/messages-clients';
import {performanceArticle} from './blog/articles/performance';
import {rentalArticle} from './blog/articles/location';
import {blogPublishedAt, type BlogArticle} from './blog/types';
import {absoluteUrl} from './seo';

export const blogArticles: BlogArticle[] = [marketingArticle, mandatArticle, reelsArticle, montageArticle, voixArticle,
  animationArticle, musiqueArticle, calendrierArticle, redactionArticle, budgetArticle, storiesArticle, tiktokArticle,
  shortsArticle, smartphoneArticle, subtitlesArticle, identityArticle, approvalArticle, clientMessagesArticle, performanceArticle, rentalArticle];
export const findBlogArticle = (slug: string) => blogArticles.find(article => article.slug === slug);
export const blogArticlePath = (article: BlogArticle) => `/blog/${article.slug}`;
export const blogImagePath = (article: BlogArticle) => `/images/blog/${article.slug}.jpg`;
export const blogArticleDates = (article: BlogArticle) => ({publishedAt: article.publishedAt ?? blogPublishedAt,
  modifiedAt: article.modifiedAt ?? article.publishedAt ?? blogPublishedAt});
export const blogDateLabel = (date: string) => new Intl.DateTimeFormat('fr-FR',
  {day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Paris'}).format(new Date(date));
export const blogUpdatedAt = () => blogArticles.reduce((latest, article) => {
  const date = blogArticleDates(article).modifiedAt;
  return date > latest ? date : latest;
}, blogPublishedAt);

// Count the actual rendered article, including examples and tables, without assuming a target length.
export function blogWordCount(article: BlogArticle) {
  const text = [article.heading, ...article.intro, ...article.takeaways,
    ...article.sections.flatMap(section => [section.title, ...section.paragraphs, ...(section.list?.items ?? []),
      ...(section.table ? [section.table.caption, ...section.table.columns, ...section.table.rows.flat()] : []),
      ...(section.examples?.flatMap(example => [example.title, example.text, example.note ?? '']) ?? [])]),
    ...article.faqs.flatMap(faq => [faq.question, faq.answer])].join(' ');
  return text.trim().split(/\s+/u).length;
}
export const blogReadingMinutes = (article: BlogArticle) => Math.max(1, Math.ceil(blogWordCount(article) / 220));
export function blogArticleSchema(article: BlogArticle) {
  const dates = blogArticleDates(article);
  const publisher = {'@type': 'Organization', '@id': `${absoluteUrl('/')}#organization`, name: 'BienVu', url: absoluteUrl('/')};
  return {'@context': 'https://schema.org', '@type': 'BlogPosting', '@id': `${absoluteUrl(blogArticlePath(article))}#article`,
    headline: article.heading, description: article.description, image: [absoluteUrl(blogImagePath(article))],
    datePublished: dates.publishedAt, dateModified: dates.modifiedAt, inLanguage: 'fr-FR', wordCount: blogWordCount(article),
    author: {'@type': 'Organization', name: 'BienVu', url: absoluteUrl('/blog#redaction-bienvu')}, publisher,
    mainEntityOfPage: {'@type': 'WebPage', '@id': absoluteUrl(blogArticlePath(article))},
    isPartOf: {'@type': 'Blog', '@id': `${absoluteUrl('/blog')}#blog`, name: 'Le blog BienVu', url: absoluteUrl('/blog')}};
}
