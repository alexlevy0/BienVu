import { redirect } from 'next/navigation';
import { propertyPrice } from '@bienvu/contracts';
import { PublicShowcase } from '../../../../../components/showcase-public';
import { StructuredData } from '../../../../../components/structured-data';
import { readShowcasePropertyPage } from '../../../../../lib/showcase-pages';
import { seoMetadata, breadcrumbs, absoluteUrl } from '../../../../../lib/seo';
export const dynamic = 'force-dynamic';
type Props = { params: Promise<{ slug: string; id: string }> };
export async function generateMetadata({ params }: Props) {
  const { slug, id } = await params,
    { data, property: p } = await readShowcasePropertyPage(slug, id);
  return seoMetadata({
    title: `${p.fields.title}${p.fields.locality ? ` à ${p.fields.locality}` : ''} — ${data.config.name}`,
    description: [
      p.fields.transaction === 'rent' ? 'À louer' : 'À vendre',
      propertyPrice(p.fields),
      p.fields.description ?? `Découvrez ce bien présenté par ${data.config.name}.`,
    ]
      .filter(Boolean)
      .join(' · ')
      .slice(0, 170),
    path: p.url,
    image: p.cover?.url,
  });
}
export default async function Page({ params }: Props) {
  const { slug, id } = await params,
    { data, property } = await readShowcasePropertyPage(slug, id);
  if (slug !== data.config.slug || id !== property.id) redirect(property.url);
  return (
    <>
      <StructuredData
        data={breadcrumbs([
          { name: data.config.name, path: `/agences/${data.config.slug}` },
          { name: property.fields.title ?? 'Le bien', path: property.url },
        ])}
      />
      <StructuredData
        data={{
          '@context': 'https://schema.org',
          '@type': 'RealEstateListing',
          name: property.fields.title,
          description: property.fields.description ?? undefined,
          url: absoluteUrl(property.url),
          image: property.photos.map((photo) => absoluteUrl(photo.url)),
          dateModified: property.updatedAt,
        }}
      />
      <PublicShowcase data={data} property={property} />
    </>
  );
}
