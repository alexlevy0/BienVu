import './style.css';
import './privacy-choice.css';
import './dialog-backdrop.css';
import {Suspense} from 'react';
import {ProductAnalytics} from '../components/product-analytics';
import {AccountProvider} from '../components/account';
import {GenerationStoreProvider} from '../components/generation-store';
import type {Metadata} from 'next';
import {seoMetadata, siteOrigin} from '../lib/seo';
import {PublicWebVitals} from '../components/web-vitals';
export const metadata:Metadata = {...seoMetadata({title:'BienVu — Marketing immobilier IA et création de vidéos',description:'Créez, personnalisez et publiez les vidéos immobilières de votre agence avec BienVu.',path:'/'}), metadataBase:new URL(siteOrigin),title: {default: 'BienVu — Marketing immobilier IA et création de vidéos', template: '%s · BienVu'},verification:process.env.GOOGLE_SITE_VERIFICATION ? {google:process.env.GOOGLE_SITE_VERIFICATION}:undefined};
export default function Layout({children}: {children: React.ReactNode}) {
  return <html lang="fr"><body><AccountProvider><GenerationStoreProvider>{children}</GenerationStoreProvider><Suspense fallback={null}><ProductAnalytics/></Suspense></AccountProvider><PublicWebVitals/></body></html>;
}
