'use client';

import Link from 'next/link';
import {useState} from 'react';
import {coverageLabels, coverageSources, sourceCoverage, type SourceCoverage} from '@bienvu/contracts';
import {HomeIcon} from './home-icons';

type Filter = 'all' | 'importable' | 'manual';
const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[’']/g, '').toLowerCase();
const filters: readonly {id: Filter; label: string}[] = [
  {id: 'all', label: 'Toutes les sources'}, {id: 'importable', label: 'Import complet ou à compléter'}, {id: 'manual', label: 'Saisie manuelle conseillée'},
];
const date = (value: string) => new Intl.DateTimeFormat('fr-FR', {day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC'}).format(new Date(value));
const hasImport = (result: SourceCoverage) => result.successfulImports + result.partialImports > 0;

export function SourceDirectory() {
  const [query, setQuery] = useState(''), [filter, setFilter] = useState<Filter>('all');
  const visible = coverageSources.filter(source => {
    const result = sourceCoverage[source.id];
    return normalize(`${source.name} ${source.hosts.join(' ')}`).includes(normalize(query.trim()))
      && (filter === 'all' || (filter === 'importable' ? hasImport(result) : !hasImport(result)));
  });
  return <section className="source-directory" aria-label="Couverture des sources" id="sources-testees">
    <div className="source-directory-tools">
      <label className="source-search"><HomeIcon name="search" size={21}/><span className="sr-only">Rechercher une agence ou un portail</span>
        <input type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Rechercher une agence ou un portail…"/>
      </label>
      <div className="source-filters" role="group" aria-label="Filtrer par résultat">{filters.map(item => <button type="button" key={item.id}
        aria-pressed={filter === item.id} onClick={() => setFilter(item.id)}>{item.label}</button>)}</div>
    </div>
    <p className="source-result-count" aria-live="polite" aria-atomic="true">{visible.length} source{visible.length > 1 ? 's' : ''}
      {query.trim() || filter !== 'all' ? ' trouvées.' : ' testées · les résultats sont détaillés ci-dessous.'}</p>
    {visible.length === 0 && <div className="source-no-results"><HomeIcon name="search" size={28}/><h2>Aucune source trouvée.</h2>
      <p>Votre agence n’est pas dans la liste ? Vous pouvez essayer le lien direct de votre annonce ou renseigner le bien manuellement.</p>
      <button type="button" onClick={() => {setQuery(''); setFilter('all');}}>Afficher toutes les sources</button>
    </div>}
    {(['agency', 'portal'] as const).map(kind => {
      const sources = visible.filter(source => source.kind === kind);
      if (!sources.length) return null;
      return <section className="source-group" aria-labelledby={`source-group-${kind}`} key={kind}>
        <div className="source-group-heading"><h2 id={`source-group-${kind}`}>{kind === 'agency' ? 'Agences et réseaux immobiliers' : 'Portails d’annonces'}</h2>
          <span>{sources.length} source{sources.length > 1 ? 's' : ''}</span></div>
        {kind === 'portal' && <p className="source-group-intro">Les portails peuvent limiter la récupération automatique. Le lien du bien sur le site de son agence est une bonne alternative.</p>}
        <div className="source-coverage-grid">{sources.map(source => {
          const result = sourceCoverage[source.id];
          return <article className={`source-card source-status-${result.status}`} key={source.id}>
            <div className="source-card-heading"><span className="source-initial" aria-hidden="true">{source.name.charAt(0).toUpperCase()}</span>
              <div><h3>{source.name}</h3><span className="source-domain">{source.hosts[0].replace(/^www\./, '')}</span></div></div>
            <span className="source-status"><span aria-hidden="true"/>{coverageLabels[result.status]}</span>
            <p className="source-summary">{result.summary}</p>
            <div className="source-card-evidence"><span>{result.successfulImports} import{result.successfulImports > 1 ? 's' : ''} complet{result.successfulImports > 1 ? 's' : ''}
              {result.partialImports > 0 && ` · ${result.partialImports} à compléter`} sur {result.listingAttempts} lien{result.listingAttempts > 1 ? 's' : ''}</span>
              <time dateTime={result.checkedAt}>Dernier essai : {date(result.checkedAt)}</time></div>
            <details className="source-samples"><summary>Voir {result.samples.length > 1 ? 'les annonces testées' : 'l’annonce testée'}</summary>
              <ul>{result.samples.map(sample => <li key={`${sample.url}-${sample.checkedAt}`}>
                <a href={sample.url} target="_blank" rel="noopener noreferrer">{sample.label} <span aria-hidden="true">↗</span><span className="sr-only"> (nouvel onglet)</span></a>
                <time dateTime={sample.checkedAt}>{date(sample.checkedAt)}</time><p>{sample.note}</p>
                {sample.environment !== 'cloudflare' && <p>Essai local : résultat non confirmé dans BienVu.</p>}
              </li>)}</ul>
            </details>
          </article>;
        })}</div>
      </section>;
    })}
    <div className="source-directory-cta"><p>Vous avez votre lien ?</p><Link className="button primary" href="/generer">Préparer mon annonce <HomeIcon name="arrow" size={20}/></Link></div>
  </section>;
}
