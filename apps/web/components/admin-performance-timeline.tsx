'use client';
import { useEffect, useId, useRef, useState } from 'react';
import type { AdminPerformanceTimeline } from '@bienvu/contracts';
import { HomeIcon } from './home-icons';
import './admin-performance-timeline.css';

const n = (value: number) => value.toLocaleString('fr-FR');
const duration = (seconds: number | null) => {
  if (seconds === null) return 'Non mesurée';
  const rounded = Math.round(seconds);
  return rounded < 60
    ? `${rounded} s`
    : `${Math.floor(rounded / 60)} min ${(rounded % 60).toString().padStart(2, '0')} s`;
};
const date = (day: string) =>
  new Date(day + 'T12:00:00Z').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', timeZone: 'UTC' });

function DurationChart({ data }: { data: AdminPerformanceTimeline }) {
  const [selected, setSelected] = useState(() =>
    data.daily.reduce((last, row, i) => (row.averageSeconds === null ? last : i), 0),
  );
  const plot = useRef<HTMLDivElement>(null),
    [width, setWidth] = useState(760);
  useEffect(() => {
    const element = plot.current;
    if (!element) return;
    const measure = () => setWidth(Math.max(240, element.clientWidth));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const height = 264,
    left = 65,
    right = 16,
    top = 18,
    bottom = 36,
    plotWidth = width - left - right,
    plotHeight = height - top - bottom;
  const labelEvery = width < 500 ? Math.ceil(data.days / 2) : data.days === 90 ? 15 : data.days === 30 ? 7 : 1;
  const max = Math.max(1, ...data.daily.map((row) => row.averageSeconds ?? 0)),
    unit = max >= 120 ? 60 : 10,
    ceiling = Math.ceil(max / unit) * unit;
  const x = (i: number) => left + ((i + 0.5) / data.days) * plotWidth,
    y = (value: number) => top + (1 - value / ceiling) * plotHeight;
  let path = '',
    connected = false;
  for (const [i, row] of data.daily.entries()) {
    if (row.averageSeconds === null) {
      connected = false;
      continue;
    }
    path += `${connected ? 'L' : 'M'}${x(i).toFixed(2)},${y(row.averageSeconds).toFixed(2)} `;
    connected = true;
  }
  const active = data.daily[selected]!;
  return (
    <>
      <div ref={plot} className="admin-duration-plot">
        <svg viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
          {Array.from({ length: 5 }, (_, i) => {
            const value = (ceiling * i) / 4;
            return (
              // biome-ignore lint/suspicious/noArrayIndexKey: Position identifies a fixed visual slot or read-only snapshot row; editable/reorderable records use IDs.
              <g key={i}>
                <line x1={left} x2={width - right} y1={y(value)} y2={y(value)} className="admin-duration-grid" />
                <text x={left - 10} y={y(value) + 4} textAnchor="end">
                  {value < 60
                    ? `${Math.round(value)} s`
                    : `${(value / 60).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} min`}
                </text>
              </g>
            );
          })}
          <path d={path} className="admin-duration-line" />
          {data.daily.map((row, i) =>
            row.averageSeconds === null ? null : (
              <circle
                key={row.day}
                cx={x(i)}
                cy={y(row.averageSeconds)}
                r={i === selected ? 6 : 3.5}
                className={i === selected ? 'admin-duration-point is-selected' : 'admin-duration-point'}
              />
            ),
          )}
          {data.daily.map((row, i) =>
            i === 0 || i === data.days - 1 || (i % labelEvery === 0 && data.days - 1 - i >= labelEvery / 2) ? (
              <text key={row.day} x={x(i)} y={height - 9} textAnchor="middle">
                {date(row.day)}
              </text>
            ) : null,
          )}
        </svg>
        <div
          className="admin-duration-columns"
          role="group"
          aria-label="Durée moyenne quotidienne. Utilisez les flèches pour changer de jour."
          style={{
            left: `${(left / width) * 100}%`,
            right: `${(right / width) * 100}%`,
            top: `${(top / height) * 100}%`,
            bottom: `${(bottom / height) * 100}%`,
          }}
        >
          {data.daily.map((row, i) => (
            <button
              type="button"
              key={row.day}
              tabIndex={selected === i ? 0 : -1}
              aria-label={`${date(row.day)} : ${duration(row.averageSeconds)}, ${n(row.measuredReady)} vidéo(s) mesurée(s)`}
              onMouseEnter={() => setSelected(i)}
              onFocus={() => setSelected(i)}
              onClick={() => setSelected(i)}
              onKeyDown={(event) => {
                const next =
                  event.key === 'ArrowRight'
                    ? Math.min(data.days - 1, i + 1)
                    : event.key === 'ArrowLeft'
                      ? Math.max(0, i - 1)
                      : event.key === 'Home'
                        ? 0
                        : event.key === 'End'
                          ? data.days - 1
                          : null;
                if (next === null) return;
                event.preventDefault();
                const target = event.currentTarget.parentElement?.children.item(next);
                if (target instanceof HTMLElement) target.focus();
              }}
            />
          ))}
        </div>
      </div>
      <div className="admin-duration-selection" aria-live="polite">
        <span>{date(active.day)}</span>
        <strong>{duration(active.averageSeconds)}</strong>
        <span>
          {n(active.measuredReady)} / {n(active.ready)} vidéos prêtes mesurées
          {active.measuredReady > 0 ? ` · de ${duration(active.minSeconds)} à ${duration(active.maxSeconds)}` : ''}
        </span>
      </div>
    </>
  );
}

export function AdminPerformanceTimelineDialog({ onClose }: { onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null),
    titleId = useId();
  const [days, setDays] = useState<7 | 30 | 90>(30),
    [data, setData] = useState<AdminPerformanceTimeline | null>(null),
    [error, setError] = useState(''),
    [retry, setRetry] = useState(0);
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    setData(null);
    setError('');
    void fetch('/api/admin?section=performance&days=' + days, { signal: controller.signal, cache: 'no-store' })
      .then(async (response) => {
        if (!response.ok) throw Error();
        return response.json() as Promise<AdminPerformanceTimeline>;
      })
      .then((value) => {
        if (!controller.signal.aborted) setData(value);
      })
      .catch(() => {
        if (!controller.signal.aborted) setError('L’historique des durées ne peut pas être chargé.');
      });
    return () => controller.abort();
  }, [days, retry]);
  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: Native dialog keyboard handling and close buttons provide dismissal; this handler only handles backdrop clicks.
    <dialog
      ref={dialog}
      className="admin-dialog admin-duration-dialog"
      aria-labelledby={titleId}
      onClose={onClose}
      onClick={(event) => {
        if (event.target !== event.currentTarget) return;
        const rect = event.currentTarget.getBoundingClientRect();
        if (
          event.clientX < rect.left ||
          event.clientX > rect.right ||
          event.clientY < rect.top ||
          event.clientY > rect.bottom
        )
          event.currentTarget.close();
      }}
    >
      <div className="admin-dialog-top">
        <span className="admin-muted">Performance des générations</span>
        <button
          type="button"
          className="admin-close"
          aria-label="Fermer le graphique"
          onClick={() => dialog.current?.close()}
        >
          <HomeIcon name="close" size={18} />
        </button>
      </div>
      <h2 id={titleId}>Évolution de la durée de génération</h2>
      <div role="group" className="admin-period" aria-label="Période du graphique">
        {([7, 30, 90] as const).map((period) => (
          <button type="button" key={period} aria-pressed={days === period} onClick={() => setDays(period)}>
            {period} jours
          </button>
        ))}
      </div>
      {error ? (
        <div role="alert">
          <p className="admin-error">{error}</p>
          <button type="button" className="admin-button" onClick={() => setRetry((value) => value + 1)}>
            Réessayer
          </button>
        </div>
      ) : !data ? (
        <p role="status">Lecture de l’historique…</p>
      ) : (
        <>
          <div className="admin-duration-summary">
            <div>
              <span>Durée moyenne</span>
              <strong>{duration(data.averageSeconds)}</strong>
            </div>
            <div>
              <span>Vidéos chronométrées</span>
              <strong>
                {n(data.measuredReady)} / {n(data.ready)}
              </strong>
            </div>
            <div>
              <span>Période · UTC</span>
              <strong>
                {date(data.from)} — {date(data.until)}
              </strong>
            </div>
          </div>
          {data.measuredReady ? (
            <DurationChart key={days + ':' + retry} data={data} />
          ) : (
            <p className="admin-empty">Aucune durée mesurée sur cette période.</p>
          )}
          <p className="admin-muted">
            Moyenne par jour de création, du lancement jusqu’à la vidéo prête, attentes et reprises comprises. Comptes,
            essais anonymes et tests internes inclus. Les échecs et les vidéos en cours sont exclus. Un jour sans mesure
            reste vide.
          </p>
          <details className="admin-duration-values">
            <summary>Voir les valeurs par jour</summary>
            <div className="admin-table-scroll">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Date UTC</th>
                    <th>Durée moyenne</th>
                    <th>Mesurées / prêtes</th>
                    <th>Minimum</th>
                    <th>Maximum</th>
                  </tr>
                </thead>
                <tbody>
                  {data.daily.map((row) => (
                    <tr key={row.day}>
                      <th scope="row">{row.day}</th>
                      <td>{duration(row.averageSeconds)}</td>
                      <td>
                        {n(row.measuredReady)} / {n(row.ready)}
                      </td>
                      <td>{duration(row.minSeconds)}</td>
                      <td>{duration(row.maxSeconds)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </>
      )}
    </dialog>
  );
}
