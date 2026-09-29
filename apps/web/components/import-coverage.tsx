import Link from 'next/link';
import {ImportUrl, coverageLabels, sourceCoverage, sourceForHost, sourceListingId} from '@bienvu/contracts';

export function ImportCoverage({url}: {url: string}) {
  const parsed = ImportUrl.safeParse(url);
  if (!parsed.success) return <p className="field-help"><Link href="/sources">Quels liens puis-je importer ?</Link></p>;
  const sourceUrl = new URL(parsed.data), source = sourceForHost(sourceUrl.hostname);
  if (!source) return <p className="field-help">Import générique à essayer : ce site n’a pas été vérifié. <Link href="/sources">Voir les sources testées</Link></p>;
  if (!sourceListingId(source, sourceUrl.pathname)) return <p className="field-help">{source.name} : collez le lien direct d’un bien, plutôt qu’une page de recherche. <Link href="/sources">En savoir plus</Link></p>;
  const coverage = sourceCoverage[source.id];
  return <div className="field-help" aria-live="polite"><strong>{source.name} · {coverageLabels[coverage.status]}</strong>
    <p>{coverage.summary} {coverage.status === 'temporarily_unavailable'
      ? 'Vous pouvez utiliser le lien de l’agence ou la saisie manuelle ci-dessous.' : 'Ce résultat ne garantit pas toutes les annonces de ce site.'} <Link href="/sources">Détails des tests</Link></p></div>;
}
