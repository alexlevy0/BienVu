import './style.css';
import {AccountProvider} from '../components/account';
import {GenerationStoreProvider} from '../components/generation-store';
export const metadata = {title: {default: 'BienVu · Votre espace vidéo', template: '%s · BienVu'}, description: 'Vos annonces immobilières prennent vie en vidéo.', robots: {index: false, follow: false}};
export default function Layout({children}: {children: React.ReactNode}) {
  return <html lang="fr"><body><AccountProvider><GenerationStoreProvider>{children}</GenerationStoreProvider></AccountProvider></body></html>;
}
