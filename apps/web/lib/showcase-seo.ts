import type { ShowcasePublic } from '@bienvu/contracts';
export { absoluteUrl, seoMetadata } from './seo';
export function showcaseSchemaImage(data: ShowcasePublic) {
  return (
    data.cover?.url ??
    data.featured[0]?.cover?.url ??
    data.properties[0]?.cover?.url ??
    data.logo?.url ??
    '/images/seo/bienvu-og.jpg'
  );
}
