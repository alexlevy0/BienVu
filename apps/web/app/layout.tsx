import './style.css';
import './privacy-choice.css';
import './dialog-backdrop.css';
import './view-transitions.css';
import { Suspense } from 'react';
import { ProductAnalytics } from '../components/product-analytics';
import { TawkChat } from '../components/tawk-chat';
import { AccountProvider } from '../components/account';
import { AccountAvatarFavoritesProvider } from '../components/account-avatar-favorites';
import { GenerationStoreProvider } from '../components/generation-store';
import type { Metadata } from 'next';
import { seoMetadata, siteOrigin } from '../lib/seo';
import { PublicWebVitals } from '../components/web-vitals';
import { SiteFeaturesProvider } from '../components/site-features';
import { BrowserNotifications } from '../components/browser-notifications';
export const metadata: Metadata = {
  ...seoMetadata({
    title: 'BienVu — Marketing immobilier IA et création de vidéos',
    description: 'Créez, personnalisez et publiez les vidéos immobilières de votre agence avec BienVu.',
    path: '/',
  }),
  metadataBase: new URL(siteOrigin),
  title: { default: 'BienVu — Marketing immobilier IA et création de vidéos', template: '%s · BienVu' },
  verification: process.env.GOOGLE_SITE_VERIFICATION ? { google: process.env.GOOGLE_SITE_VERIFICATION } : undefined,
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" data-bienvu-sidebar="expanded" suppressHydrationWarning>
      <head>
        <script
          // biome-ignore lint/security/noDangerouslySetInnerHtml: This sidebar bootstrap is a static source-controlled string, with no interpolated request content.
          dangerouslySetInnerHTML={{
            __html:
              "try{if(localStorage.getItem('bienvu:sidebar:collapsed')==='1')document.documentElement.dataset.bienvuSidebar='collapsed'}catch{}",
          }}
        />
      </head>
      <body>
        <SiteFeaturesProvider>
          <AccountProvider>
            <AccountAvatarFavoritesProvider>
              <GenerationStoreProvider>
                {children}
                <BrowserNotifications />
              </GenerationStoreProvider>
            </AccountAvatarFavoritesProvider>
            <Suspense fallback={null}>
              <ProductAnalytics />
              <TawkChat />
            </Suspense>
          </AccountProvider>
        </SiteFeaturesProvider>
        <PublicWebVitals />
      </body>
    </html>
  );
}
