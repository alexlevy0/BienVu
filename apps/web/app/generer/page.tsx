import {Shell} from '../../components/shell';
import {GenerationForm} from '../../components/generation-form';
import {VideoIllustration} from '../../components/video-illustration';
import '../manual-listing.css';
export const metadata = {title: 'Créer une vidéo'};
export default function Page() {
  return <Shell><div className="page-heading"><div><p className="eyebrow">UNE ANNONCE, UNE HISTOIRE</p><h1>Préparez votre<br/><em>prochaine vidéo.</em></h1><p className="page-intro">Vos photos et vos informations, dans un format fait pour être vu.</p></div></div><section className="creation-card"><div className="creation-content"><span className="section-kicker">VOTRE ANNONCE</span><h2>Collez le lien de votre annonce.</h2><p>BienVu récupère les informations et les photos du bien. Vous pouvez aussi saisir votre annonce ci-dessous.</p><GenerationForm/><p className="quiet-note">La vidéo utilise votre identité d’agence enregistrée. Le téléchargement reste disponible pendant sept jours.</p></div><div className="creation-preview"><VideoIllustration/></div></section><div className="information-note"><strong>Votre annonce, deux possibilités</strong><p>Importez un lien public ou renseignez les informations et les photos du bien. BienVu préparera ensuite la vidéo automatiquement, sans éditeur vidéo.</p></div></Shell>;
}
