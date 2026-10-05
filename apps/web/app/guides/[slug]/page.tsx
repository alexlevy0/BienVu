import {notFound} from 'next/navigation';
import {EditorialPage} from '../../../components/editorial-page';
import {guidePages} from '../../../lib/marketing-content';
import {seoMetadata} from '../../../lib/seo';
import '../../landing.css';
import '../../marketing.css';
export const dynamic = 'force-dynamic';
export async function generateMetadata({params}: {params: Promise<{slug: string}>}) {
  const {slug} = await params, page = guidePages.find(item => item.slug === slug); if (!page) notFound();
  return seoMetadata({title: page.title, description: page.description, path: `/guides/${slug}`, type: 'article'});
}
export default async function Page({params}: {params: Promise<{slug: string}>}) {
  const {slug} = await params, page = guidePages.find(item => item.slug === slug); if (!page) notFound();
  return <EditorialPage page={page} guide/>;
}
