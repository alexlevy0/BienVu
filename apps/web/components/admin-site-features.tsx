'use client';
import { useEffect, useState, type FormEvent } from 'react';
import { AdminSiteFeatures } from '@bienvu/contracts';
import { siteFeaturesChanged } from './site-features';

export function AdminSiteFeatureSettings() {
  const [data, setData] = useState<AdminSiteFeatures | null>(null),
    [explorer, setExplorer] = useState(false),
    [loading, setLoading] = useState(true),
    [saving, setSaving] = useState(false),
    [error, setError] = useState(''),
    [message, setMessage] = useState(''),
    [reload, setReload] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    void fetch('/api/admin/features', { cache: 'no-store', signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw Error('Les fonctionnalités n’ont pas pu être chargées.');
        const result = AdminSiteFeatures.parse(await response.json());
        if (!controller.signal.aborted) {
          setData(result);
          setExplorer(result.features.explorer);
        }
      })
      .catch((cause) => {
        if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Chargement interrompu.');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [reload]);
  async function save(event: FormEvent) {
    event.preventDefault();
    if (!data || saving || explorer === data.features.explorer) return;
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const response = await fetch('/api/admin/features', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ revision: data.revision, features: { explorer } }),
      });
      if (!response.ok)
        throw Error(
          response.status === 409
            ? 'Ce réglage a été modifié ailleurs. Rechargez-le avant d’enregistrer.'
            : response.status === 429
              ? 'Trop de modifications. Patientez une minute.'
              : 'Enregistrement impossible. Vous pouvez réessayer.',
        );
      const result = AdminSiteFeatures.parse(await response.json());
      setData(result);
      setExplorer(result.features.explorer);
      window.dispatchEvent(
        new CustomEvent(siteFeaturesChanged, { detail: { revision: result.revision, features: result.features } }),
      );
      setMessage(
        result.features.explorer
          ? 'Explorer et les inspirations sont activés.'
          : 'Explorer et les inspirations sont masqués.',
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Enregistrement interrompu.');
    } finally {
      setSaving(false);
    }
  }
  return (
    <section className="admin-card" aria-labelledby="admin-site-features-title">
      <div className="admin-card-heading">
        <h3 id="admin-site-features-title">Visibilité des fonctionnalités</h3>
        {data && <span>{data.features.explorer ? 'Explorer activé' : 'Explorer désactivé'}</span>}
      </div>
      <p className="admin-muted">
        Réactivez Explorer et les exemples de vidéos quand vous le souhaitez, sans redéploiement.
      </p>
      {loading ? (
        <p role="status">Chargement des fonctionnalités…</p>
      ) : (
        data && (
          <form onSubmit={save}>
            <label className="admin-budget-pause">
              <input
                type="checkbox"
                checked={explorer}
                disabled={saving}
                onChange={(event) => {
                  setExplorer(event.target.checked);
                  setMessage('');
                }}
              />
              Afficher Explorer et « À découvrir sur BienVu »
            </label>
            <p className="admin-muted">
              Un même réglage contrôle le lien dans la navigation, le footer, les liens de découverte et la publication
              depuis les fiches de biens. Les pages et vidéos déjà partagées restent accessibles par leurs liens. Les
              visiteurs voient le nouvel état au prochain chargement de page.
            </p>
            <div className="admin-video-map-actions">
              <button
                type="submit"
                className="admin-button admin-button-dark"
                disabled={saving || explorer === data.features.explorer}
              >
                {saving ? 'Enregistrement…' : 'Enregistrer la visibilité'}
              </button>
              <button
                type="button"
                className="admin-button"
                disabled={saving}
                onClick={() => {
                  setReload((n) => n + 1);
                  setMessage('');
                }}
              >
                Recharger
              </button>
            </div>
          </form>
        )
      )}
      {error && (
        <p className="admin-error" role="alert">
          {error}
          {!data && !loading && (
            <button type="button" className="admin-button" onClick={() => setReload((n) => n + 1)}>
              Réessayer
            </button>
          )}
        </p>
      )}
      {message && (
        <p className="admin-notice" role="status">
          {message}
        </p>
      )}
    </section>
  );
}
