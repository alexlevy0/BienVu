import {notFound} from 'next/navigation';
import {EditorialPage} from '../../../components/editorial-page';
import {featurePages} from '../../../lib/marketing-content';
import {seoMetadata} from '../../../lib/seo';
import '../../landing.css';
import '../../marketing.css';

// Serve the allowlisted page in the initial Worker response, including its metadata.
export const dynamic = 'force-dynamic';
export async function generateMetadata({params}: {params: Promise<{slug: string}>}) {
  const {slug} = await params, page = featurePages.find(item => item.slug === slug); if (!page) notFound();
  return seoMetadata({title: page.title, description: page.description, path: `/${slug}`});
}
export default async function Page({params}: {params: Promise<{slug: string}>}) {
  const {slug} = await params, page = featurePages.find(item => item.slug === slug); if (!page) notFound();
  return <EditorialPage page={page}/>;
}
