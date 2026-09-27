import Link from 'next/link';
import {Shell} from '../../components/shell';
import {Icon} from '../../components/icon';
export const metadata = {title: 'Mes vidéos'};
export default function Page() {
  return <Shell><div className="page-heading"><div><p className="eyebrow">VOS BIENS PRENNENT VIE</p><h1>Vos vidéos,<br/><em>au même endroit.</em></h1><p className="page-intro">Retrouvez vos créations et téléchargez-les quand vous en avez besoin.</p></div></div><section className="panel empty-state"><span className="empty-icon"><Icon name="film" size={38}/></span><span className="section-kicker">VOTRE HISTOIRE COMMENCE ICI</span><h2>Aucune vidéo pour le moment.</h2><p>Votre historique sera disponible après la connexion et la création de votre première vidéo. Aucune vidéo de démonstration n’est ajoutée à votre compte.</p><Link href="/generer" className="button primary">Préparer ma première vidéo<Icon name="arrow" size={18}/></Link><span className="field-help">Génération en cours de développement</span></section></Shell>;
}
