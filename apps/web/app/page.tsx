import { getCloudflareContext } from '@opennextjs/cloudflare';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { BetaLandingPage } from '../components/beta-landing-page';
import { HomepageMediaProvider } from '../components/homepage-media';
import { LandingPage } from '../components/landing-page';
import { StructuredData } from '../components/structured-data';
import { requireAdmin } from '../lib/admin-access';
import { hasHeroDepth } from '../lib/home-hero-depth';
import { homeHeroDepth } from '../lib/home-hero-depth-assets';
import { heroPosterSizes, homeImageSrcSet, imageWidthUrl, resolveHomeMedia } from '../lib/home-media-view';
import { homepageEdgeCache, readHomepageConfig, readHomepageHeroPoster } from '../lib/homepage-media';
import { seoMetadata, siteSchema } from '../lib/seo';
import './landing.css';
import './home-composer.css';
import './home-noise.css';
import './home-typography.css';
import './home-hero-depth.css';
import './home-avatars.css';
import './home-render-comparison.css';
import './home-editor-showcase.css';
import './home-vitrine.css';
import './home-footer.css';
import './beta/beta.css';
import './beta/auto.css';

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const auto = query.mode === 'auto';
  return seoMetadata({
    title: auto ? 'BienVu — Vos annonces auto en vidéo' : 'BienVu — Marketing immobilier IA et création de vidéos',
    description: auto
      ? 'Le studio marketing IA de vos annonces automobiles : import par lien, voix off, avatars et animations.'
      : 'Créez des vidéos immobilières à partir de vos annonces et photos. Personnalisez vos contenus et programmez leur publication sur Instagram et Facebook.',
    path: '/',
    noindex: Boolean(query.homePreview || query.draft || query.job),
  });
}
export const dynamic = 'force-dynamic';
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ homePreview?: string; mode?: string; draft?: string }>;
}) {
  const query = await searchParams;
  const { env, ctx } = await getCloudflareContext({ async: true }),
    preview = query.homePreview === '1';
  const category = query.mode === 'auto' ? 'vehicle' : 'real-estate';
  if (preview) {
    try {
      await requireAdmin(new Request(env.BETTER_AUTH_URL, { headers: await headers() }), env);
    } catch {
      notFound();
    }
  }
  const cache = await homepageEdgeCache(env.BETTER_AUTH_URL, (task) => ctx.waitUntil(task));
  const config = await readHomepageConfig(env.DB, preview, cache),
    heroPoster = preview ? null : await readHomepageHeroPoster(env, config, cache),
    hero = resolveHomeMedia(config, 'hero.visual');
  const heroImage = hero.kind === 'image' ? hero.src : (hero.poster ?? resolveHomeMedia(config, 'hero.video').poster);
  const depth = hasHeroDepth(resolveHomeMedia(config, 'hero.video'));
  return (
    <HomepageMediaProvider config={config} heroPoster={heroPoster}>
      {category === 'real-estate' &&
        (depth ? (
          <link
            rel="preload"
            as="image"
            href={homeHeroDepth.backgroundPoster}
            media="(min-width: 761px)"
            fetchPriority="high"
          />
        ) : (
          heroPoster &&
          heroImage && (
            <link
              rel="preload"
              as="image"
              href={imageWidthUrl(heroImage, 640)}
              imageSrcSet={homeImageSrcSet(heroImage)}
              imageSizes={heroPosterSizes}
              media="(min-width: 761px)"
              fetchPriority="high"
            />
          )
        ))}
      <link rel="preload" href="/fonts/newsreader-ui.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
      <link
        rel="preload"
        href="/fonts/newsreader-italic-ui.woff2"
        as="font"
        type="font/woff2"
        crossOrigin="anonymous"
      />
      {!preview && <StructuredData data={siteSchema} />}{' '}
      {preview && (
        <div className="homepage-preview-banner" role="status">
          Aperçu privé · Ces changements ne sont pas encore publiés.{' '}
          <a href="/admin?view=homepage">Retour à l’administration →</a>
        </div>
      )}
      {category === 'vehicle' ? <BetaLandingPage betaPreview={false} initialCategory="vehicle" /> : <LandingPage />}
    </HomepageMediaProvider>
  );
}
