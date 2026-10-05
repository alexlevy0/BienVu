import Link from 'next/link';
import {coverageSources, sourceCoverage} from '@bienvu/contracts';
import {Shell} from '../../components/shell';
import {SourceDirectory} from '../../components/source-directory';
import {HomeIcon} from '../../components/home-icons';
import './sources.css';

export const metadata = {title: 'Sources testées', description: 'Les sites testés par BienVu, les limites constatées et les alternatives pour préparer votre annonce.', alternates: {canonical: '/sources'}};
export default function SourcesPage() {
  const latest = Object.values(sourceCoverage).map(result => result.checkedAt).sort().at(-1)!;
  const checkedDate = new Intl.DateTimeFormat('fr-FR', {day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC'}).format(new Date(latest));
  return <Shell><div className="sources-page">
    <Link className="source-back" href="/">← Retour au studio</Link>
    <header className="source-page-heading"><p className="eyebrow">IMPORTER VOTRE ANNONCE</p><h1>Les sources,<br/><em>en toute clarté.</em></h1>
      <p className="page-intro">De votre annonce à votre vidéo, tout commence par un lien.<br/>Découvrez les résultats de nos essais sur les principaux réseaux immobiliers.</p>
      <span className="source-updated"><HomeIcon name="check" size={16}/> Dernière campagne : <time dateTime={latest}>{checkedDate}</time></span>
    </header>
    <section className="source-overview" aria-label="Notre couverture">
      <div><strong>{coverageSources.filter(s => s.kind === 'agency').length}</strong><span>agences et réseaux testés</span></div>
      <div><strong>{coverageSources.filter(s => s.kind === 'portal').length}</strong><span>portails d’annonces testés</span></div>
      <p><HomeIcon name="link" size={23}/><span>Collez le <strong>lien direct d’un bien</strong>.<br/>Les pages de recherche ne sont pas des annonces.</span></p>
    </section>
    <SourceDirectory/>
    <section className="source-alternatives" aria-labelledby="other-source-title"><div><span className="source-note-icon"><HomeIcon name="building" size={26}/></span>
      <h2 id="other-source-title">Votre agence n’est pas dans la liste ?</h2><p>Essayez son lien public dans BienVu. Si l’import ne suffit pas, renseignez les informations du bien et ajoutez vos photos grâce à la saisie manuelle.</p></div>
      <Link className="button secondary" href="/generer">Préparer mon annonce <HomeIcon name="arrow" size={20}/></Link></section>
    <details className="source-methodology"><summary>Comment testons-nous les sources ?</summary>
      <p>Nous sélectionnons des annonces publiques de réseaux d’agences et de mandataires présents en France, puis utilisons le même import que dans BienVu.</p>
      <p>Un import complet signifie que les informations nécessaires et au moins trois photos distinctes ont été récupérées, vérifiées et enregistrées. Un brouillon à compléter n’est pas compté comme un import complet.</p>
      <p>Chaque résultat précise son lien et sa date. Les essais portent sur un petit échantillon : ils ne garantissent pas l’ensemble des annonces d’un réseau. Une annonce peut aussi être retirée entre deux essais. Les précédents tests restent datés, y compris ceux des portails.</p>
      <p>Un accès refusé ou une annonce retirée ne déclenche pas de nouvelle tentative automatique. Nous ne contournons pas les restrictions d’accès des sites.</p>
    </details>
    <p className="source-rights-note">Utilisez uniquement des textes et des photos que vous êtes autorisé à exploiter.</p>
  </div></Shell>;
}
