import type {AdminRow} from '@bienvu/contracts';

export const importDiagnosticKeys = ['errorStage', 'blockedHost', 'blockedPath', 'blockReason', 'resourceType'];
const stages: Record<string, string> = {admission: 'Vérification du budget et des limites', page: 'Téléchargement de l’annonce', extraction: 'Lecture des informations',
  browser: 'Navigateur d’import', photo: 'Récupération des photos', storage: 'Enregistrement des photos'};
const reasons: Record<string, string> = {invalid_url: 'URL privée ou invalide', host_not_allowed: 'Domaine extérieur à la source autorisée',
  transport_refused: 'Refus du transport sécurisé : résolution DNS ou redirection à vérifier'};
const types: Record<string, string> = {page: 'Page', document: 'Page', image: 'Image', script: 'Script',
  asset: 'Ressource', xhr: 'Requête de données', fetch: 'Requête de données', stylesheet: 'Feuille de style', font: 'Police', media: 'Média'};
const value = (v: AdminRow[string]) => typeof v === 'string' && v ? v : null;

export function AdminImportError({row}: {row: AdminRow}) {
  return <span className="admin-import-error"><span>{value(row.error) ?? '—'}</span>
    {value(row.errorStage) && <small>{stages[String(row.errorStage)] ?? 'Import'}</small>}
    {value(row.blockedHost) && <small title={String(row.blockedHost)}>{row.blockedHost}</small>}</span>;
}
export function AdminImportDiagnostic({row}: {row: AdminRow}) {
  if (!value(row.error)) return null;
  if (!value(row.errorStage)) return <p className="admin-muted">Cet import ne contient pas de diagnostic détaillé. Les prochains essais préciseront l’étape du blocage.</p>;
  const fields = [{label: 'Étape du blocage', content: stages[String(row.errorStage)] ?? 'Import'},
    {label: 'Motif', content: row.error==='IMPORT_BUDGET_LIMIT'?'Budget de sécurité des imports atteint':row.error==='IMPORT_RESOURCE_LIMIT'?'Limite de transfert atteinte':reasons[String(row.blockReason)]}, {label: 'Domaine bloqué', content: value(row.blockedHost)},
    {label: 'Chemin de la ressource', content: value(row.blockedPath)},
    {label: 'Type de ressource', content: value(row.resourceType) ? types[String(row.resourceType)] ?? String(row.resourceType) : null}];
  return <section aria-label="Diagnostic de l’import"><h3>Diagnostic de l’import</h3><dl className="admin-facts">
    {fields.filter(f => f.content).map(f => <div key={f.label}><dt>{f.label}</dt><dd>{f.content}</dd></div>)}
  </dl></section>;
}
