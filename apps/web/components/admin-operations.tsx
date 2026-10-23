'use client';
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import type { OperationsData, OperationsFilter } from '../lib/admin-operations';
import { AdminGenerationQueueSettings } from './admin-generation-queue';
import type { AdminAvatarData } from '@bienvu/contracts';
import { readPreferences, syncFilters } from './admin-workspace-client';
import { CreateAdminTask } from './admin-workspace';

export const adminDate = (v: string | null | undefined) =>
  v
    ? new Date(v).toLocaleString('fr-FR', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '—';
const n = (v: number | null | undefined) => (v == null ? '—' : v.toLocaleString('fr-FR', { maximumFractionDigits: 1 }));
const seconds = (v: number | null) => (v === null ? 'Non mesuré' : n(v) + ' s');
const money = (v: number | null) =>
  v === null ? 'Incomplète' : new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(v / 1e6);
const ratio = (v: number, total: number) => (total ? n((v / total) * 100) + ' %' : 'Non mesuré');
export const adminVideoHref = (id: string) => '/admin/videos/' + encodeURIComponent(id);
export const adminAgencyHref = (id: string) => '/admin/agencies/' + encodeURIComponent(id);
export const operationLabels: Record<string, string> = {
  none: 'Sans abonnement',
  account: 'Compte client',
  anonymous: 'Essai anonyme',
  internal: 'Test interne',
  solo: 'Solo',
  agence: 'Agence',
  equipe: 'Équipe',
  reseau: 'Réseau',
  free: 'Gratuit',
  paid: 'Payant',
  trial: 'Essai',
  observed: 'Activité observée',
  unverified: 'Non vérifié',
  degraded: 'Erreurs sur la période',
  standard: 'Standard',
  avatar: 'Avec avatar',
  avatar_ai: 'Avatar + animations IA',
  ai: 'Animations IA',
  open: 'À traiter',
  reviewing: 'En cours',
  resolved: 'Résolu',
  ready: 'Prêt',
  failed: 'Échec',
  working: 'En cours',
  skipped: 'Non réalisé',
  waiting: 'En attente',
  active: 'En cours',
  released: 'Terminé',
  preparation: 'Préparation',
  runway: 'Animations IA',
  render: 'Assemblage',
  map: 'Carte',
  animations: 'Animations IA',
  importing: 'Import',
  scripting: 'Narration',
  voicing: 'Voix off',
  rendering: 'Assemblage',
  queued: 'En attente',
  retry_wait: 'Nouvel essai',
  pending: 'En attente',
  sending: 'Envoi en cours',
  sent: 'Accepté par le service push',
  cancelled: 'Annulé',
  watch: 'Notification demandée',
  attempt: 'Tentative d’envoi',
  accepted: 'Accepté par le service push',
  device_disabled: 'Appareil désactivé ou abonnement push expiré',
  requested: 'Génération demandée',
  started: 'Génération démarrée',
  download: 'Téléchargement',
  claimed: 'Rattachée au compte',
  login: 'Connexion',
  done: 'Terminé',
  submitting: 'Envoi au fournisseur',
  submitted: 'Chez le fournisseur',
  uncertain: 'Résultat incertain',
};
export function OpsBadge({ value }: { value: string }) {
  return <span className={'ops-badge ops-state-' + value}>{operationLabels[value] ?? value}</span>;
}
export function opsAnchor(title: string) {
  return (
    'ops-' +
    title
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/-$/, '')
  );
}
export function OpsCard({ title, children, note }: { title: string; children: ReactNode; note?: string }) {
  return (
    <section id={opsAnchor(title)} className="admin-card ops-card">
      <h3>{title}</h3>
      {note && <p className="admin-muted">{note}</p>}
      {children}
    </section>
  );
}
function Metric({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <article>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{note}</small>
    </article>
  );
}
export function useOperations(
  section: OperationsFilter['section'],
  filters: Partial<OperationsFilter> = {},
  enabled = true,
) {
  const [data, setData] = useState<OperationsData | null>(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(true),
    [revision, setRevision] = useState(0);
  const lastParams = useRef('');
  const params = new URLSearchParams({
    section,
    ...Object.fromEntries(
      Object.entries(filters)
        .filter(([, v]) => v !== undefined)
        .map(([k, v]) => [k, String(v)]),
    ),
  }).toString();
  useEffect(() => {
    if (!enabled) return;
    const c = new AbortController();
    setBusy(true);
    setError('');
    if (lastParams.current !== params) {
      setData(null);
      lastParams.current = params;
    }
    void fetch('/api/admin/operations?' + params, { cache: 'no-store', signal: c.signal })
      .then(async (r) => {
        if (!r.ok)
          throw Error(
            r.status === 403
              ? 'Accès réservé au super admin.'
              : r.status === 404
                ? 'Élément introuvable.'
                : 'Lecture interrompue. Actualisez les données.',
          );
        return r.json() as Promise<OperationsData>;
      })
      .then(setData)
      .catch((e) => {
        if (!c.signal.aborted) setError(e.message);
      })
      .finally(() => {
        if (!c.signal.aborted) setBusy(false);
      });
    return () => c.abort();
  }, [params, revision, enabled]);
  useEffect(() => {
    if (!enabled || !['dashboard', 'providers', 'video'].includes(section)) return;
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') setRevision((v) => v + 1);
    }, 30000);
    return () => clearInterval(timer);
  }, [section, enabled]);
  return { data, error, busy, refresh: () => setRevision((v) => v + 1) };
}
const filterKeys = ['days', 'audience', 'duration', 'avatar', 'animations', 'mode', 'compare', 'from', 'to'] as const;
const defaults: Partial<OperationsFilter> = {
  days: '30',
  audience: 'account',
  duration: 'all',
  avatar: 'all',
  animations: 'all',
  mode: 'live',
  compare: 'yes',
};
function validFilters(raw: Record<string, unknown>): Partial<OperationsFilter> {
  const result = { ...defaults };
  const choices = {
    days: ['7', '30', '90'],
    audience: ['account', 'anonymous', 'internal', 'all'],
    duration: ['all', '20', '30', '40'],
    avatar: ['all', 'yes', 'no'],
    animations: ['all', 'yes', 'no'],
    mode: ['live', 'test'],
    compare: ['yes', 'no'],
  };
  for (const key of filterKeys) {
    const value = raw[key];
    if (typeof value !== 'string') continue;
    if (key === 'from' || key === 'to') {
      if (/^\d{4}-\d{2}-\d{2}$/.test(value)) result[key] = value;
    } else if (choices[key].includes(value)) Object.assign(result, { [key]: value });
  }
  return result;
}
export function AdminOperations({
  section,
  accountId,
}: {
  section: 'dashboard' | 'performance' | 'incidents' | 'providers' | 'retention' | 'profit' | 'changes';
  accountId: string;
}) {
  const [filters, setFilters] = useState<Partial<OperationsFilter>>(defaults),
    [initialized, setInitialized] = useState(false);
  useEffect(() => {
    setInitialized(false);
    let live = true;
    let saved: Record<string, unknown> = {};
    try {
      saved = JSON.parse(localStorage.getItem('bv:admin:ops:' + accountId + ':' + section) ?? '{}');
    } catch {}
    const url = Object.fromEntries(new URLSearchParams(location.search)),
      hasFilter = filterKeys.some((k) => url[k]);
    void readPreferences()
      .then((d) => {
        saved = d?.value.filters['ops-' + section] ?? saved;
      })
      .catch(() => {})
      .finally(() => {
        if (live) {
          setFilters(validFilters(hasFilter ? url : saved));
          setInitialized(true);
        }
      });
    return () => {
      live = false;
    };
  }, [section, accountId]);
  useEffect(() => {
    if (!initialized) return;
    try {
      localStorage.setItem('bv:admin:ops:' + accountId + ':' + section, JSON.stringify(filters));
    } catch {
      /* local preference */
    }
    syncFilters(
      accountId,
      'ops-' + section,
      Object.fromEntries(
        Object.entries(filters)
          .filter(([, v]) => v !== undefined)
          .map(([k, v]) => [k, String(v)]),
      ),
    );
    const params = new URLSearchParams(location.search);
    for (const key of filterKeys) {
      if (filters[key]) params.set(key, String(filters[key]));
      else params.delete(key);
    }
    history.replaceState(history.state, '', location.pathname + '?' + params);
  }, [filters, initialized, accountId, section]);
  const { data, error, busy, refresh } = useOperations(section, filters, initialized);
  function select(key: keyof OperationsFilter, value: string) {
    setFilters((f) => ({
      ...f,
      [key]: value || undefined,
      ...(key === 'days' ? { from: undefined, to: undefined } : {}),
    }));
  }
  return (
    <div className="admin-operations">
      {section === 'providers' && (
        <button type="button" className="admin-button" disabled={busy} onClick={refresh}>
          Actualiser le suivi des fournisseurs
        </button>
      )}
      {section !== 'providers' && (
        <form className="admin-filters ops-filters" onSubmit={(e) => e.preventDefault()}>
          <label>
            Période
            <select value={filters.days} onChange={(e) => select('days', e.target.value)}>
              {['7', '30', '90'].map((v) => (
                <option key={v} value={v}>
                  {v} jours
                </option>
              ))}
            </select>
          </label>
          {section !== 'changes' && (
            <label>
              Origine
              <select value={filters.audience} onChange={(e) => select('audience', e.target.value)}>
                <option value="account">Clients</option>
                <option value="anonymous">Essais anonymes</option>
                <option value="internal">Interne et démonstrations</option>
                <option value="all">Toutes les origines</option>
              </select>
            </label>
          )}
          {['performance', 'profit'].includes(section) && (
            <>
              <label>
                Durée de la vidéo
                <select value={filters.duration} onChange={(e) => select('duration', e.target.value)}>
                  <option value="all">Toutes</option>
                  {['20', '30', '40'].map((v) => (
                    <option key={v} value={v}>
                      {v} secondes
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Avatar
                <select value={filters.avatar} onChange={(e) => select('avatar', e.target.value)}>
                  <option value="all">Avec et sans</option>
                  <option value="yes">Avec avatar</option>
                  <option value="no">Sans avatar</option>
                </select>
              </label>
              <label>
                Animations IA
                <select value={filters.animations} onChange={(e) => select('animations', e.target.value)}>
                  <option value="all">Avec et sans</option>
                  <option value="yes">Demandées</option>
                  <option value="no">Sans animations</option>
                </select>
              </label>
            </>
          )}
          {section === 'profit' && (
            <label>
              Paiements
              <select value={filters.mode} onChange={(e) => select('mode', e.target.value)}>
                <option value="live">Réels</option>
                <option value="test">Tests Stripe</option>
              </select>
            </label>
          )}
          <label>
            Du (UTC)
            <input type="date" value={filters.from ?? ''} onChange={(e) => select('from', e.target.value)} />
          </label>
          <label>
            Au (UTC)
            <input type="date" value={filters.to ?? ''} onChange={(e) => select('to', e.target.value)} />
          </label>
          {['performance', 'profit', 'retention'].includes(section) && (
            <label className="admin-check">
              <input
                type="checkbox"
                checked={filters.compare === 'yes'}
                onChange={(e) => select('compare', e.target.checked ? 'yes' : 'no')}
              />{' '}
              Comparer à la période précédente
            </label>
          )}
          <button type="button" className="admin-button" disabled={busy} onClick={refresh}>
            Actualiser
          </button>
        </form>
      )}
      {error && (
        <p role="alert" className="admin-error">
          {error}
        </p>
      )}
      {busy && !data && (
        <p role="status" className="ops-loading">
          Lecture des indicateurs…
        </p>
      )}
      {data && (
        <p className="admin-muted" role="status">
          Dernière lecture : {adminDate(data.at)}
          {['dashboard', 'providers'].includes(section)
            ? ' · actualisation toutes les 30 secondes, lorsque cet écran est visible'
            : ''}
        </p>
      )}
      {data && 'stats' in data && data.stats && <Performance data={data} />}
      {data && 'incidents' in data && data.incidents && (
        <>
          {'stalled' in data && data.stalled && (
            <div className="ops-grid">
              <OpsCard
                title="Générations à vérifier"
                note="Sans changement depuis plus de 15 minutes. Une attente fournisseur reste possible."
              >
                {data.stalled.length ? (
                  data.stalled.map((j) => (
                    <a className="ops-action" key={j.id} href={adminVideoHref(j.id)}>
                      <span>
                        <strong>{j.agency ?? 'Essai / espace interne'}</strong>
                        <small>
                          {operationLabels[j.stage] ?? j.stage} · depuis {adminDate(j.updatedAt)}
                        </small>
                      </span>
                      <span>Diagnostic →</span>
                    </a>
                  ))
                ) : (
                  <p>Aucune génération immobile depuis 15 minutes.</p>
                )}
              </OpsCard>
              <OpsCard title="Signalements en attente">
                {data.reports?.length ? (
                  data.reports.map((r) => (
                    <a className="ops-action" key={r.id} href={adminVideoHref(r.jobId)}>
                      <span>
                        <strong>{r.agency ?? 'Agence'}</strong>
                        <small>
                          {r.category} · {adminDate(r.at)}
                        </small>
                      </span>
                      <span>Ouvrir →</span>
                    </a>
                  ))
                ) : (
                  <p>Aucun signalement ouvert.</p>
                )}
                <a className="admin-text-button" href="/admin?view=reports&status=new">
                  Tous les signalements →
                </a>
              </OpsCard>
            </div>
          )}
          <IncidentList items={data.incidents} editable={section === 'incidents'} refresh={refresh} />
        </>
      )}
      {data && 'summary' in data && data.summary && (
        <>
          <div className="admin-insight-metrics ops-metrics">
            <Metric
              label="Agences activées"
              value={n(data.summary.activated)}
              note="Première vidéo prête pendant la période"
            />
            <Metric
              label="Une deuxième vidéo"
              value={ratio(data.summary.secondVideo ?? 0, data.summary.activated)}
              note={`${n(data.summary.secondVideo ?? 0)} agences · à la fin de la fenêtre`}
            />
            <Metric
              label="Retour dans les 7 jours"
              value={ratio(data.summary.returned7 ?? 0, data.summary.eligible7 ?? 0)}
              note={`${n(data.summary.returned7 ?? 0)} / ${n(data.summary.eligible7 ?? 0)} agences observables 7 jours`}
            />
            <Metric
              label="Retour dans les 30 jours"
              value={ratio(data.summary.returned30 ?? 0, data.summary.eligible30 ?? 0)}
              note={`${n(data.summary.returned30 ?? 0)} / ${n(data.summary.eligible30 ?? 0)} agences observables 30 jours`}
            />
          </div>
          {data.comparison && (
            <OpsCard
              title="Rétention : période précédente"
              note="Même durée d’observation. Les retours sont évalués à la fin de chaque fenêtre ; comparez aussi le nombre d’agences ayant assez de recul."
            >
              <p>
                {adminDate(data.comparison.from)} → {adminDate(data.comparison.to)}
              </p>
              <div className="admin-workspace-comparison">
                <Metric
                  label="Agences activées avant"
                  value={n(data.comparison.summary?.activated ?? 0)}
                  note={`Actuellement : ${n(data.summary.activated)}`}
                />
                <Metric
                  label="Deuxième vidéo avant"
                  value={ratio(data.comparison.summary?.secondVideo ?? 0, data.comparison.summary?.activated ?? 0)}
                  note={`Actuellement : ${ratio(data.summary.secondVideo ?? 0, data.summary.activated)}`}
                />
                <Metric
                  label="Retour à 7 jours avant"
                  value={ratio(data.comparison.summary?.returned7 ?? 0, data.comparison.summary?.eligible7 ?? 0)}
                  note={`${n(data.comparison.summary?.eligible7 ?? 0)} agences observables`}
                />
                <Metric
                  label="Retour à 30 jours avant"
                  value={ratio(data.comparison.summary?.returned30 ?? 0, data.comparison.summary?.eligible30 ?? 0)}
                  note={`${n(data.comparison.summary?.eligible30 ?? 0)} agences observables`}
                />
              </div>
            </OpsCard>
          )}
          <OpsCard
            title="Des agences qui reviennent"
            note="Vidéos prêtes correspondant au filtre d’origine. Le filtre Clients exclut les administrateurs configurés et les agences classées internes ou démonstrations. Les cohortes trop récentes sont exclues des taux à 7 et 30 jours. La deuxième vidéo correspond à une nouvelle création terminée, pas à un téléchargement."
          >
            <div className="admin-table-scroll">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Agence</th>
                    <th>Vidéos</th>
                    <th>Jours actifs</th>
                    <th>Semaines actives</th>
                    <th>Dernière création</th>
                  </tr>
                </thead>
                <tbody>
                  {data.activity?.map((a) => (
                    <tr key={a.id}>
                      <td>
                        <a href={adminAgencyHref(a.id)}>{a.agency}</a>
                      </td>
                      <td>{n(a.videos)}</td>
                      <td>{n(a.activeDays)}</td>
                      <td>{n(a.weeks)}</td>
                      <td>{adminDate(a.lastAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!data.activity?.length && <p>Aucune agence active pendant la période.</p>}
            <p className="admin-muted">
              Jusqu’à 100 agences affichées ; les indicateurs de cohorte portent sur toutes les agences de la période.
            </p>
          </OpsCard>
        </>
      )}
      {data && 'groups' in data && data.groups && (
        <>
          <ProfitComparison data={data} />
          <OpsCard
            title="Rentabilité par rendu"
            note="Rendu demandé à la création. Les montants proviennent de la comptabilité existante, en euros HT, avec les frais et dépenses attribués. Une provision fournisseur n’est pas un coût réel."
          >
            <div className="admin-table-scroll">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Rendu</th>
                    <th>Vidéos</th>
                    <th>Crédits utilisés</th>
                    <th>Recettes attribuées</th>
                    <th>Frais</th>
                    <th>Coûts attribués</th>
                    <th>Couverture complète</th>
                    <th>Marge</th>
                  </tr>
                </thead>
                <tbody>
                  {data.groups.map((g) => (
                    <tr key={g.render}>
                      <td>{operationLabels[g.render] ?? g.render}</td>
                      <td>{n(g.videos)}</td>
                      <td>{n(g.credits)}</td>
                      <td>{money(g.revenueMicros)}</td>
                      <td>{money(g.feeMicros)}</td>
                      <td>{money(g.costMicros)}</td>
                      <td>
                        {n(g.videos - g.incomplete)} / {n(g.videos)}
                      </td>
                      <td>{money(g.marginMicros)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!data.groups.length && <p>Aucune vidéo pour ces critères et ce mode de paiement.</p>}
            <p className="admin-muted">
              Les recettes, frais et coûts restent partiels si la couverture est incomplète. La marge reste alors
              indisponible ; complétez les justificatifs dans la comptabilité ci-dessous.
            </p>
          </OpsCard>
        </>
      )}
      {data && 'queue' in data && 'activity' in data && data.queue && data.activity && <Providers data={data} />}
      {section === 'changes' && data && 'changes' in data && data.changes && (
        <>
          <ChangeForm refresh={refresh} />
          <ChangeList items={data.changes} />
        </>
      )}
    </div>
  );
}
function Performance({ data }: { data: Extract<OperationsData, { stats: unknown }> }) {
  const [metric, setMetric] = useState<'median' | 'p95' | 'errors'>('median'),
    [selected, setSelected] = useState<string | null>(null);
  const max = Math.max(
      1,
      ...data.daily.map((d) => (metric === 'errors' ? (d.total ? (d.failed / d.total) * 100 : 0) : (d[metric] ?? 0))),
    ),
    width = 860,
    height = 220;
  const x = (i: number) => 45 + (i * (width - 65)) / Math.max(1, data.daily.length - 1),
    y = (v: number) => height - 30 - (v / max) * (height - 55);
  const paths: string[] = [];
  let path = '';
  for (const [i, d] of data.daily.entries()) {
    const v = metric === 'errors' ? (d.total ? (d.failed / d.total) * 100 : null) : d[metric];
    if (v === null) {
      if (path) paths.push(path);
      path = '';
    } else path += (path ? ' L' : 'M') + x(i) + ',' + y(v);
  }
  if (path) paths.push(path);
  const active = data.daily.find((d) => d.day === selected);
  return (
    <>
      <div className="admin-insight-metrics ops-metrics">
        <Metric
          label="Durée moyenne"
          value={seconds(data.stats.average)}
          note={`${n(data.stats.measured)} vidéos prêtes mesurées`}
        />
        <Metric
          label="Durée médiane"
          value={seconds(data.stats.median)}
          note="La moitié des vidéos sont plus rapides"
        />
        <Metric
          label="95e percentile"
          value={seconds(data.stats.p95)}
          note="95 % des vidéos sont terminées avant ce délai"
        />
        <Metric
          label="Attentes cumulées"
          value={seconds(data.wait.median)}
          note={`Médiane · ${n(data.wait.measured)} vidéos avec une mesure de file`}
        />
      </div>
      {data.comparison && (
        <OpsCard
          title="Comparaison avec la période précédente"
          note="Créations sur deux fenêtres de durée égale, avec les mêmes filtres. Les états et durées sont ceux connus à la lecture ; une génération récente peut encore être en cours."
        >
          <p>
            {adminDate(data.comparison.from)} → {adminDate(data.comparison.to)}
          </p>
          <div className="admin-workspace-comparison">
            {[
              ['Durée médiane', data.stats.median, data.comparison.stats.median, ' s'],
              ['P95', data.stats.p95, data.comparison.stats.p95, ' s'],
              ['Créations', data.total, data.comparison.total, ''],
              [
                'Taux d’échec',
                data.total ? (data.daily.reduce((n, d) => n + d.failed, 0) / data.total) * 100 : null,
                data.comparison.total ? (data.comparison.failed / data.comparison.total) * 100 : null,
                ' %',
              ],
            ].map(([label, current, previous, unit]) => {
              const a = current as number | null,
                b = previous as number | null;
              return (
                <article key={String(label)}>
                  <span>{label}</span>
                  <strong>{a === null ? 'Non mesuré' : n(a) + unit}</strong>
                  <small>
                    Avant : {b === null ? 'Non mesuré' : n(b) + unit}
                    {a !== null && b !== null
                      ? unit === ' %'
                        ? ' · ' + n(a - b) + ' points'
                        : b > 0
                          ? ' · ' + n(((a - b) / b) * 100) + ' %'
                          : ' · variation non calculable'
                      : ''}
                  </small>
                </article>
              );
            })}
          </div>
          {data.comparison.truncated && (
            <p className="admin-error">
              Période précédente tronquée : réduisez la fenêtre pour comparer des mesures complètes.
            </p>
          )}
        </OpsCard>
      )}
      {data.truncated && (
        <p className="admin-error">
          Période trop chargée : statistiques limitées aux 20 000 créations les plus récentes sur {n(data.total)}.
          Réduisez la période.
        </p>
      )}
      <OpsCard
        title="La génération dans le temps"
        note="De la création à l’événement original « vidéo prête », attentes et reprises comprises. Les vidéos sans événement prêt sont exclues des durées. Dates UTC."
      >
        <div role="group" className="ops-chart-tabs" aria-label="Indicateur du graphique">
          {(['median', 'p95', 'errors'] as const).map((m) => (
            <button type="button" key={m} aria-pressed={metric === m} onClick={() => setMetric(m)}>
              {m === 'median' ? 'Médiane' : m === 'p95' ? '95e percentile' : 'Taux d’échec'}
            </button>
          ))}
        </div>
        <div className="ops-chart">
          <svg
            viewBox={`0 0 ${width} ${height}`}
            role="img"
            aria-label={
              (metric === 'errors' ? 'Taux d’échec en pourcentage' : 'Durée en secondes') +
              ' du ' +
              data.from +
              ' au ' +
              data.to
            }
          >
            <title>Évolution quotidienne ; détails dans le tableau ci-dessous</title>
            {[0, 0.5, 1].map((t) => (
              <g key={t}>
                <line x1="45" x2={width - 20} y1={y(max * t)} y2={y(max * t)} stroke="#e0e6dc" />
                <text x="2" y={y(max * t) - 5} fontSize="11" fill="#6c7567">
                  {Math.round(max * t)}
                  {metric === 'errors' ? ' %' : ' s'}
                </text>
              </g>
            ))}
            {data.changes.map((change) => {
              const i = data.daily.findIndex((d) => d.day === change.at.slice(0, 10));
              return i < 0 ? null : (
                <line
                  key={change.id}
                  x1={x(i)}
                  x2={x(i)}
                  y1="22"
                  y2={height - 30}
                  stroke="#b18b55"
                  strokeDasharray="3 5"
                >
                  <title>
                    {change.title} · {adminDate(change.at)}
                  </title>
                </line>
              );
            })}
            {paths.map((d, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: Position identifies a fixed visual slot or read-only snapshot row; editable/reorderable records use IDs.
              <path key={i} d={d} fill="none" stroke="#214f43" strokeWidth="2.5" strokeLinejoin="round" />
            ))}
            {data.daily.map((d, i) => {
              const v = metric === 'errors' ? (d.total ? (d.failed / d.total) * 100 : null) : d[metric];
              return v === null ? null : (
                <circle key={d.day} cx={x(i)} cy={y(v)} r={selected === d.day ? 5 : 3} fill="#547349">
                  <title>
                    {d.day} · {n(v)}
                    {metric === 'errors' ? ' %' : ' s'}
                  </title>
                </circle>
              );
            })}
            <text x="45" y={height - 5} fontSize="11" fill="#6c7567">
              {data.from}
            </text>
            <text x={width - 20} textAnchor="end" y={height - 5} fontSize="11" fill="#6c7567">
              {data.to}
            </text>
          </svg>
        </div>
        <p className="admin-muted">
          Repères pointillés : modifications et déploiements enregistrés. Une coïncidence ne prouve pas une cause.{' '}
          {n(data.total)} créations sur la période.
        </p>
        {active && (
          <p role="status" className="admin-notice">
            {active.day} · {active.total} créations · {active.failed} échecs · médiane {seconds(active.median)} · P95{' '}
            {seconds(active.p95)}
          </p>
        )}
        <details className="ops-details">
          <summary>Consulter les mesures quotidiennes</summary>
          <div className="admin-table-scroll">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Jour UTC</th>
                  <th>Créations</th>
                  <th>Prêtes</th>
                  <th>Mesurées</th>
                  <th>Médiane</th>
                  <th>P95</th>
                  <th>Échecs</th>
                </tr>
              </thead>
              <tbody>
                {data.daily.map((d) => (
                  <tr key={d.day}>
                    <td>
                      <button className="admin-row-button" type="button" onClick={() => setSelected(d.day)}>
                        {d.day}
                      </button>
                    </td>
                    <td>{n(d.total)}</td>
                    <td>{n(d.ready)}</td>
                    <td>{n(d.measured)}</td>
                    <td>{seconds(d.median)}</td>
                    <td>{seconds(d.p95)}</td>
                    <td>
                      {d.failed} · {ratio(d.failed, d.total)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      </OpsCard>
      <OpsCard
        title="Attente et traitement"
        note="Le cumul des attentes de préparation, avatar, animation et rendu est mesuré à partir des entrées en file. Ces files peuvent se chevaucher : leur somme ne se soustrait pas à la durée totale."
      >
        <p>
          Médiane des attentes : <strong>{seconds(data.wait.median)}</strong> · P95 :{' '}
          <strong>{seconds(data.wait.p95)}</strong>.
        </p>
        <p className="admin-muted">
          Les anciens jobs sans entrée de file restent non mesurés. Les intervalles de traitement enregistrés sont
          consultables dans le diagnostic de chaque vidéo.
        </p>
      </OpsCard>
      <ChangeList items={data.changes} />
    </>
  );
}
function IncidentList({
  items,
  editable,
  refresh,
}: {
  items: Extract<OperationsData, { incidents: unknown }>['incidents'];
  editable: boolean;
  refresh: () => void;
}) {
  return (
    <OpsCard
      title={editable ? 'Incidents récurrents' : 'Incidents à suivre'}
      note="Regroupés par étape et code ; une seule occurrence par vidéo, étape et code, y compris une animation manquante sur une vidéo terminée. Jusqu’à 50 groupes."
    >
      {!items.length ? (
        <p>Aucun incident pour ces critères.</p>
      ) : (
        items.map((i) => (
          <details className="ops-incident" key={i.key}>
            <summary>
              <span>
                <strong>{i.code}</strong>
                <small>
                  {operationLabels[i.stage] ?? i.stage} · {i.agencies} agence(s) · premier cas {adminDate(i.firstAt)}
                </small>
              </span>
              <span className="ops-incident-count">
                {i.count} vidéo(s)
                <OpsBadge value={i.review?.state ?? 'open'} />
              </span>
            </summary>
            <div className="ops-incident-body">
              <p>
                {i.reopened ? 'Nouvelle occurrence après résolution. ' : ''}Dernier cas : {adminDate(i.lastAt)}. Sur les
                7 derniers jours : <strong>{i.recent}</strong> ; les 7 jours précédents : <strong>{i.previous}</strong>{' '}
                (dans la période sélectionnée).
              </p>
              {i.review && (
                <p className="admin-notice">
                  {i.review.body}
                  <small className="ops-meta">
                    {i.review.actor} · {adminDate(i.review.at)}
                  </small>
                </p>
              )}
              <div className="ops-links">
                {i.jobs.map((j) => (
                  <a className="ops-action" key={j.id} href={adminVideoHref(j.id)}>
                    <span>
                      {j.agency ?? j.id}
                      <small>
                        {adminDate(j.at)} · {j.reports} signalement(s)
                      </small>
                    </span>
                    <span>Diagnostic →</span>
                  </a>
                ))}
              </div>
              <p className="admin-muted">
                Au plus 20 diagnostics récents par groupe, parmi les 500 dernières occurrences.
              </p>
              <CreateAdminTask target={{ targetKind: 'incident', target: i.key, title: 'Analyser ' + i.code }} />
              {editable ? (
                <IncidentForm incident={i} refresh={refresh} />
              ) : (
                <a className="admin-text-button" href="/admin?view=incidents">
                  Traiter les incidents →
                </a>
              )}
            </div>
          </details>
        ))
      )}
    </OpsCard>
  );
}
async function write(body: unknown) {
  const r = await fetch('/api/admin/operations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!r.ok)
    throw Error(
      r.status === 409
        ? 'Le suivi a changé. Actualisez avant de réessayer.'
        : r.status === 429
          ? 'Trop de modifications. Patientez une minute.'
          : 'Enregistrement impossible. Réessayez.',
    );
}
export function OpsForm({
  onSave,
  children,
  button = 'Enregistrer',
}: {
  onSave: (form: FormData) => Promise<void>;
  children: ReactNode;
  button?: string;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    setBusy(true);
    setError('');
    try {
      await onSave(new FormData(form));
      form.reset();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Enregistrement impossible.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="ops-form" onSubmit={(e) => void submit(e)}>
      {children}
      {error && (
        <p role="alert" className="admin-error">
          {error}
        </p>
      )}
      <button className="admin-button admin-button-dark" disabled={busy} type="submit">
        {busy ? 'Enregistrement…' : button}
      </button>
    </form>
  );
}
function IncidentForm({
  incident,
  refresh,
}: {
  incident: Extract<OperationsData, { incidents: unknown }>['incidents'][number];
  refresh: () => void;
}) {
  return (
    <OpsForm
      onSave={async (form) => {
        await write({
          action: 'incident',
          target: incident.key,
          state: String(form.get('state')),
          expected: incident.review?.id ?? null,
          body: String(form.get('body')),
        });
        refresh();
      }}
    >
      <label>
        Traitement
        <select name="state" defaultValue={incident.review?.state ?? 'open'}>
          <option value="open">À traiter</option>
          <option value="reviewing">En cours</option>
          <option value="resolved">Résolu</option>
        </select>
      </label>
      <label>
        Note de suivi
        <textarea
          name="body"
          required
          minLength={5}
          maxLength={2000}
          rows={2}
          placeholder="Diagnostic, décision ou correction apportée…"
        />
      </label>
    </OpsForm>
  );
}
function ChangeForm({ refresh }: { refresh: () => void }) {
  return (
    <OpsCard
      title="Documenter un changement"
      note="Ajoutez une décision ou une mise en production pour la retrouver sur les graphiques."
    >
      <OpsForm
        onSave={async (form) => {
          await write({ action: 'change', title: String(form.get('title')), body: String(form.get('body')) });
          refresh();
        }}
      >
        <label>
          Intitulé
          <input name="title" required minLength={3} maxLength={120} placeholder="Ex. Nouveau modèle de voix" />
        </label>
        <label>
          Ce qui a changé
          <textarea name="body" required minLength={5} maxLength={2000} rows={2} />
        </label>
      </OpsForm>
    </OpsCard>
  );
}
function ChangeList({
  items,
}: {
  items: { id: string; at: string; kind: string; title: string; body: string; actor: string | null }[];
}) {
  return (
    <OpsCard
      title="Changements et résultats"
      note="Historique des réglages administratifs et des changements documentés, jusqu’à 100 entrées. Les déploiements antérieurs à ce suivi ne sont pas reconstitués."
    >
      {items.length ? (
        <ol className="ops-timeline">
          {items.map((c) => (
            <li key={c.kind + ':' + c.id}>
              <time>{adminDate(c.at)}</time>
              <strong>{c.title}</strong>
              <p>{c.body}</p>
              {c.actor && <small>{c.actor}</small>}
            </li>
          ))}
        </ol>
      ) : (
        <p>Aucun changement enregistré pendant la période.</p>
      )}
    </OpsCard>
  );
}
function Providers({ data }: { data: Extract<OperationsData, { activity: unknown; queue: unknown }> }) {
  const [wallet, setWallet] = useState<AdminAvatarData['wallet']>(null),
    [walletAt, setWalletAt] = useState<string | null>(null),
    [walletError, setWalletError] = useState(''),
    [checking, setChecking] = useState(false);
  async function checkWallet() {
    setChecking(true);
    setWalletError('');
    try {
      const r = await fetch('/api/admin/avatars', { cache: 'no-store' });
      if (!r.ok) throw Error();
      const a = (await r.json()) as AdminAvatarData;
      setWallet(a.wallet);
      setWalletAt(new Date().toISOString());
      if (!a.wallet) setWalletError('Solde HeyGen indisponible.');
    } catch {
      setWalletError('Lecture HeyGen interrompue.');
    } finally {
      setChecking(false);
    }
  }
  return (
    <>
      <div className="ops-provider-grid">
        {['runway', 'heygen', 'cartesia', 'google', 'openai', 'cloudflare'].map((provider) => {
          const a = data.activity.find((a) => a.provider === provider),
            resource =
              provider === 'runway'
                ? 'runway'
                : provider === 'heygen'
                  ? 'avatar'
                  : provider === 'cloudflare'
                    ? 'render'
                    : null,
            q = resource ? data.queue.usage.find((q) => q.resource === resource) : null;
          return (
            <OpsCard
              key={provider}
              title={
                {
                  runway: 'Runway',
                  heygen: 'HeyGen',
                  cartesia: 'Cartesia',
                  google: 'Google · voix',
                  openai: 'OpenAI',
                  cloudflare: 'Cloudflare · rendu',
                }[provider] ?? provider
              }
            >
              <p>
                <OpsBadge value={a?.failed ? 'degraded' : a?.calls ? 'observed' : 'unverified'} />
              </p>
              <p>
                {provider === 'cloudflare'
                  ? 'Activité fournisseur non mesurée dans ce registre.'
                  : a
                    ? `${n(a.calls)} appels réels · ${n(a.failed)} échecs ou résultats incertains`
                    : 'Aucun appel réel dans les 30 derniers jours.'}
              </p>
              {q && (
                <p>
                  <strong>{q.active}</strong> en cours · <strong>{q.waiting}</strong> en attente · capacité{' '}
                  <strong>{q.concurrency}</strong>
                </p>
              )}
              <p className="admin-muted">Dernier appel enregistré : {adminDate(a?.lastAt)}</p>
              {provider === 'runway' ? (
                <>
                  <p>
                    Solde API :{' '}
                    <strong>
                      {data.queue.runway.balance?.credits == null
                        ? 'Indisponible'
                        : n(data.queue.runway.balance.credits) + ' crédits'}
                    </strong>
                  </p>
                  <p className="admin-muted">
                    Vérifié le {adminDate(data.queue.runway.balance?.checkedAt)}
                    {data.queue.runway.balance?.error ? ' · ' + data.queue.runway.balance?.error : ''}
                  </p>
                </>
              ) : provider === 'heygen' ? (
                <>
                  <p>
                    Solde :{' '}
                    <strong>
                      {wallet?.balance == null
                        ? 'Non vérifié'
                        : n(wallet.balance) + ' ' + (wallet.currency ?? 'unité non fournie')}
                    </strong>
                  </p>
                  {walletAt && <p className="admin-muted">Vérifié le {adminDate(walletAt)}</p>}
                  {walletError && <p role="status">{walletError}</p>}
                  <button className="admin-button" type="button" disabled={checking} onClick={() => void checkWallet()}>
                    {checking ? 'Vérification…' : 'Vérifier le solde'}
                  </button>
                </>
              ) : (
                <p className="admin-muted">Solde externe non disponible ici.</p>
              )}
            </OpsCard>
          );
        })}
      </div>
      <p className="admin-muted">
        L’activité observée n’est pas une mesure de disponibilité en temps réel. Aucune génération payante n’est lancée
        pour vérifier un fournisseur. Les quotas locaux restent distincts des soldes API.
      </p>
      <AdminGenerationQueueSettings />
    </>
  );
}
export function AgencyNotes({
  id,
  notes,
  refresh,
}: {
  id: string;
  notes: { id: string; body: string; actor: string; at: string }[];
  refresh: () => void;
}) {
  return (
    <OpsCard
      title="Notes internes"
      note="Visibles uniquement par les administrateurs. Aucun message n’est envoyé au client."
    >
      <OpsForm
        button="Ajouter la note"
        onSave={async (form) => {
          await write({ action: 'note', id, body: String(form.get('body')) });
          refresh();
        }}
      >
        <label>
          Nouvelle note
          <textarea
            name="body"
            required
            minLength={3}
            maxLength={2000}
            rows={3}
            placeholder="Contexte, échange ou prochaine action…"
          />
        </label>
      </OpsForm>
      {notes.map((note) => (
        <article className="ops-note" key={note.id}>
          <p>{note.body}</p>
          <small>
            {note.actor} · {adminDate(note.at)}
          </small>
        </article>
      ))}
      {!notes.length && <p className="admin-muted">Aucune note pour cette agence.</p>}
    </OpsCard>
  );
}
export function AdminAgencyNotes({ id }: { id: string }) {
  const { data, error, busy, refresh } = useOperations('notes', { id });
  return (
    <>
      {error && <p role="alert">{error}</p>}
      {busy && <p role="status">Lecture des notes…</p>}
      {data && 'notes' in data && data.notes && <AgencyNotes id={id} notes={data.notes} refresh={refresh} />}
    </>
  );
}

function ProfitComparison({ data }: { data: Extract<OperationsData, { groups: unknown }> }) {
  if (!data.comparison) return null;
  const summarize = (groups: typeof data.groups) => {
    const videos = groups.reduce((s, g) => s + g.videos, 0),
      incomplete = groups.reduce((s, g) => s + g.incomplete, 0);
    return {
      videos,
      incomplete,
      revenue: groups.reduce((s, g) => s + (g.revenueMicros ?? 0), 0),
      cost: groups.reduce((s, g) => s + (g.costMicros ?? 0), 0),
      fee: groups.reduce((s, g) => s + (g.feeMicros ?? 0), 0),
    };
  };
  const a = summarize(data.groups),
    b = summarize(data.comparison.groups);
  return (
    <OpsCard
      title="Rentabilité : comparaison des périodes"
      note="Même durée d’observation et mêmes filtres. Les montants sont ceux attribués à ce jour aux vidéos créées pendant chaque fenêtre ; ils peuvent évoluer après rapprochement."
    >
      <p>
        Période précédente : {adminDate(data.comparison.from)} → {adminDate(data.comparison.to)}
      </p>
      <div className="admin-table-scroll">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Indicateur</th>
              <th>Actuellement</th>
              <th>Période précédente</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <th scope="row">Vidéos</th>
              <td>{n(a.videos)}</td>
              <td>{n(b.videos)}</td>
            </tr>
            <tr>
              <th scope="row">Recettes attribuées HT</th>
              <td>{money(a.revenue)}</td>
              <td>{money(b.revenue)}</td>
            </tr>
            <tr>
              <th scope="row">Coût attribué par vidéo</th>
              <td>
                {a.videos ? money(a.cost / a.videos) : 'Non mesuré'}
                {a.incomplete ? ' · partiel' : ''}
              </td>
              <td>
                {b.videos ? money(b.cost / b.videos) : 'Non mesuré'}
                {b.incomplete ? ' · partiel' : ''}
              </td>
            </tr>
            <tr>
              <th scope="row">Marge contributive</th>
              <td>{a.videos ? money(a.incomplete ? null : a.revenue - a.cost - a.fee) : 'Non mesurée'}</td>
              <td>{b.videos ? money(b.incomplete ? null : b.revenue - b.cost - b.fee) : 'Non mesurée'}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </OpsCard>
  );
}
