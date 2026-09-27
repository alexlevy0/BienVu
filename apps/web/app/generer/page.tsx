import {Shell} from '../../components/shell';
import {GenerationForm} from '../../components/generation-form';
import {VideoIllustration} from '../../components/video-illustration';
export const metadata = {title: 'Créer une vidéo'};
export default function Page() {
  return <Shell><div className="page-heading"><div><p className="eyebrow">UNE ANNONCE, UNE HISTOIRE</p><h1>Préparez votre<br/><em>prochaine vidéo.</em></h1><p className="page-intro">Vos photos et vos informations, dans un format fait pour être vu.</p></div></div><section className="creation-card"><div className="creation-content"><span className="section-kicker">NOUVELLE VIDÉO</span><h2>Collez le lien de votre annonce.</h2><p>La génération sera disponible après l’ouverture des comptes.</p><GenerationForm/><p className="quiet-note">L’essai comprendra une vidéo avec filigrane. Le droit utilisé sera indiqué avant chaque génération.</p></div><div className="creation-preview"><VideoIllustration/></div></section><div className="information-note"><strong>Un parcours sans éditeur</strong><p>BienVu préparera automatiquement la vidéo à partir des informations vérifiées du bien. La compatibilité de chaque site sera contrôlée à l’import.</p></div></Shell>;
}
