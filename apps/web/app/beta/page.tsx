import { getCloudflareContext } from '@opennextjs/cloudflare';
import { BetaLandingPage } from '../../components/beta-landing-page';
import { HomepageMediaProvider } from '../../components/homepage-media';
import { homepageEdgeCache, readHomepageConfig } from '../../lib/homepage-media';
import { seoMetadata } from '../../lib/seo';
import '../landing.css';
import '../home-hero-depth.css';
import '../home-avatars.css';
import '../home-render-comparison.css';
import '../home-editor-showcase.css';
import '../home-vitrine.css';
import '../home-footer.css';
import '../home-composer.css';
import '../home-noise.css';
import '../home-typography.css';
import './beta.css';
import './auto.css';

export const dynamic = 'force-dynamic';
export const metadata = seoMetadata({
  title: 'BienVu — Vos annonces immobilières et auto en vidéo',
  description:
    'Le studio marketing IA de vos annonces immobilières et automobiles : import par lien, voix off, avatars et animations.',
  path: '/beta',
  noindex: true,
});
export default async function Page() {
  const { env, ctx } = await getCloudflareContext({ async: true });
  const config = await readHomepageConfig(
    env.DB,
    false,
    await homepageEdgeCache(env.BETTER_AUTH_URL, (task) => ctx.waitUntil(task)),
  );
  return (
    <HomepageMediaProvider config={config}>
      <link rel="preload" href="/fonts/newsreader-ui.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
      <BetaLandingPage />
    </HomepageMediaProvider>
  );
}
