import './style.css';
import {AccountProvider} from '../components/account';
import {GenerationStoreProvider} from '../components/generation-store';
import type {Metadata} from 'next';
export const metadata:Metadata = {metadataBase:new URL('https://bienvu.online'),title: {default: 'BienVu · Vidéos immobilières', template: '%s · BienVu'}, description: 'Vos annonces immobilières prennent vie en vidéo.', robots: {index: true, follow: true}};
export default function Layout({children}: {children: React.ReactNode}) {
  return <html lang="fr"><body><AccountProvider><GenerationStoreProvider>{children}</GenerationStoreProvider></AccountProvider></body></html>;
}
