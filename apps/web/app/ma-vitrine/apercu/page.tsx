import { headers } from 'next/headers';
import { redirect, notFound } from 'next/navigation';
import { PublicShowcase } from '../../../components/showcase-public';
import { ShowcasePreviewFrame } from '../../../components/showcase-public-client';
import { requireOwner } from '../../../lib/owner';
import { ensureShowcase, showcaseView, publicShowcaseProperty } from '../../../lib/showcases';
import { RequestFailure } from '../../../lib/http';
import { showcaseQuery, type ShowcaseSearch } from '../../../lib/showcase-pages';
import '../../landing.css';
import '../../agences/showcase.css';
export const dynamic = 'force-dynamic';
export const metadata = { title: 'Aperçu privé de ma vitrine', robots: { index: false, follow: false } };
export default async function Page({ searchParams }: { searchParams: Promise<ShowcaseSearch> }) {
  const params = showcaseQuery(await searchParams);
  let owner: Awaited<ReturnType<typeof requireOwner>>;
  try {
    owner = await requireOwner(
      new Request('https://bienvu.online/ma-vitrine/apercu', { headers: new Headers(await headers()) }),
    );
  } catch (error) {
    if (error instanceof RequestFailure && error.code === 'UNAUTHORIZED')
      redirect('/connexion?next=' + encodeURIComponent('/ma-vitrine/apercu' + (params.size ? '?' + params : '')));
    throw error;
  }
  const id = params.get('bien') ?? undefined;
  if (params.get('frame') !== '1') return <ShowcasePreviewFrame id={id} />;
  const row = await ensureShowcase(owner.env, owner.agency);
  try {
    const data = await showcaseView(owner.env, row, params, true),
      property = id ? await publicShowcaseProperty(owner.env, row, id, true) : undefined;
    return <PublicShowcase data={data} property={property} query={Object.fromEntries(params)} />;
  } catch (error) {
    if (error instanceof RequestFailure && error.code === 'NOT_FOUND') notFound();
    throw error;
  }
}
