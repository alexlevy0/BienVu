import Link from 'next/link';
import {coverageLabels, importSources, sourceCoverage} from '@bienvu/contracts';
import {Shell} from '../../components/shell';
import './sources.css';

export const metadata = {title: 'Sources testées', description: 'Les sites testés par BienVu, les limites constatées et les alternatives pour préparer votre annonce.'};
export default function SourcesPage() {
  return <Shell><div className="page-heading"><div><p className="eyebrow">IMPORTER VOTRE ANNONCE</p><h1>Les sources,<br/><em>en toute clarté.</em></h1>
    <p className="page-intro">Un site testé n’est pas une garantie pour toutes ses annonces.<br/>Voici ce que nos essais ont réellement permis.</p></div></div>
    <section aria-label="Couverture des sources" className="source-coverage-grid">{importSources.map(source => {
      const result = sourceCoverage[source.id];
      const date = new Intl.DateTimeFormat('fr-FR', {day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC'}).format(new Date(result.checkedAt));
      return <article className="step-card" key={source.id}><span className="mini-label">{coverageLabels[result.status]}</span><h2>{source.name}</h2><p>{result.summary}</p>
        <p className="field-help">{result.successfulImports} import{result.successfulImports > 1 ? 's' : ''} abouti{result.successfulImports > 1 ? 's' : ''} sur {result.listingAttempts} lien{result.listingAttempts > 1 ? 's' : ''} essayé{result.listingAttempts > 1 ? 's' : ''} · <time dateTime={result.checkedAt}>{date}</time></p>
        <p className="field-help">{result.environment === 'cloudflare'
          ? result.successfulImports > 0 ? 'Import confirmé dans BienVu.' : 'Import essayé dans BienVu, sans résultat exploitable.'
          : 'Essai exploratoire. L’import n’est pas encore confirmé dans BienVu.'}</p></article>;
    })}</section>
    <section className="information-note"><h2>Un autre site d’agence ?</h2><p>L’import générique peut être essayé sur une annonce publique. Les informations et la galerie sont vérifiées avant l’enregistrement ; seules les photos du bien doivent être conservées.</p>
      <p>Un accès refusé ou une annonce retirée ne déclenche pas de nouvelle tentative automatique. Vous pouvez utiliser le lien de l’agence ou renseigner le bien et ses photos vous-même.</p><Link className="button primary" href="/generer">Préparer mon annonce →</Link></section>
    <p className="field-help">Ces résultats sont datés et portent sur un petit échantillon. Les simulations ne comptent pas comme des imports réussis. Utilisez uniquement des textes et des photos que vous êtes autorisé à exploiter.</p>
  </Shell>;
}
