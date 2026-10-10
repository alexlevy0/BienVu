import {publicFeatureLinks,guideSlugs} from './marketing-navigation';
import {blogTopics} from './blog-navigation';
export const publicSeoPaths = ['/', '/explorer', '/abonnement', '/sources', '/guides', '/blog', '/partenaires', '/avatar', ...blogTopics.map(article=>`/blog/${article.slug}`),
  ...publicFeatureLinks.map(page=>`/${page.slug}`), ...guideSlugs.map(slug=>`/guides/${slug}`), ...['paris','sud','lyon','bordeaux'].map(id=>`/exemples/${id}`)];
export function seoPage(path:string):string|null {
  if(publicSeoPaths.includes(path))return path;
  // Aggregate published watch pages together; never retain a listing or video identifier.
  if(/^\/explorer\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(path))return '/explorer/video';
  return null;
}
