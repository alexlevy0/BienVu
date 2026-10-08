'use client';

import {useEffect, useId, useMemo, useRef, useState, type ChangeEvent} from 'react';
import {PricingSimulationInput, cartesiaPricingPlans, type PricingSavedScenario} from '@bienvu/contracts';
import {calculatePricing, pricingCsv, pricingPreset, type PricingReport} from '../lib/pricing-calculator';
import type {PricingBootstrap, PricingObservations, PricingObservation} from '../lib/pricing-simulator';
import {HomeIcon} from './home-icons';

type Input = PricingSimulationInput;
type Tab = 'offers' | 'usage' | 'production' | 'volume' | 'forecast' | 'observations';
type Group = 'market' | 'production' | 'cloudflare';
type NumericKey<T> = {[K in keyof T]: T[K] extends number ? K : never}[keyof T];
const money = (value: number | null, decimals = 2) => value === null ? '—' : new Intl.NumberFormat('fr-FR', {style: 'currency', currency: 'EUR', minimumFractionDigits: decimals, maximumFractionDigits: decimals}).format(value);
const num = (value: number, decimals = 1) => value.toLocaleString('fr-FR', {maximumFractionDigits: decimals});
const pct = (value: number | null) => value === null ? '—' : num(value) + ' %';
const providerNames: Record<string, string> = {openai: 'OpenAI · rédaction', google: 'Google · voix', fish: 'Fish Audio · voix', cartesia: 'Cartesia · voix', runway: 'Runway · animations', cloudflare: 'Cloudflare', other: 'Autres'};
const tabs: {id: Tab; label: string}[] = [
  {id: 'offers', label: 'Packs & abonnements'}, {id: 'usage', label: 'Profils d’usage'},
  {id: 'production', label: 'Coûts de production'}, {id: 'volume', label: 'Volume & frais'},
  {id: 'forecast', label: 'Prévisions & sensibilité'}, {id: 'observations', label: 'Données observées'},
];
const parts: [keyof PricingReport['months'][number]['costs'], string][] = [
  ['runway', 'Animations IA'], ['text', 'Rédaction'], ['voice', 'Voix off'], ['compute', 'Calcul Cloudflare'],
  ['browser', 'Imports par navigateur'], ['storage', 'Stockage R2'], ['operations', 'Opérations R2'],
  ['workers', 'Requêtes et CPU Workers'], ['support', 'Support'], ['other', 'Autres coûts variables'],
];

function NumberField({label, value, onChange, step = 0.01, hint}: {label: string; value: number; onChange: (value: number) => void; step?: number; hint?: string}) {
  const id = useId();
  return <label className="pricing-field" htmlFor={id}><span>{label}</span>
    <input id={id} type="number" step={step} value={Number.isFinite(value) ? value : ''} onChange={e => onChange(Number(e.currentTarget.value))} aria-describedby={hint ? id + '-hint' : undefined}/>
    {hint && <small id={id + '-hint'}>{hint}</small>}
  </label>;
}
function download(name: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], {type})), anchor = document.createElement('a');
  anchor.href = url; anchor.download = name; document.body.appendChild(anchor); anchor.click(); anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
async function read<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {cache: 'no-store', ...init});
  const payload = await response.json() as T & {fields?: Record<string, string>};
  if (!response.ok) throw Error(response.status === 409 ? payload.fields?.scenario ?? 'Ce scénario a changé dans une autre fenêtre. Rechargez-le ou enregistrez une copie.'
    : response.status === 429 ? 'Trop de sauvegardes. Réessayez dans une minute.'
    : response.status === 401 || response.status === 403 ? 'Votre accès superadmin doit être confirmé à nouveau.'
    : 'Le simulateur ne peut pas traiter cette demande. Vos paramètres restent disponibles.');
  return payload;
}
function ForecastChart({report}: {report: PricingReport}) {
  const rows = report.months, width = 900, height = 220, left = 70, bottom = 35, top = 16;
  const minimum = Math.min(0, ...rows.map(m => m.profit)), maximum = Math.max(1, ...rows.flatMap(m => [m.revenueHt, m.totalCosts, m.profit]));
  const x = (i: number) => left + i / Math.max(1, rows.length - 1) * (width - left - 16);
  const y = (n: number) => top + (maximum - n) / (maximum - minimum) * (height - top - bottom);
  const path = (key: 'revenueHt' | 'profit' | 'totalCosts') => rows.map((m, i) => `${i ? 'L' : 'M'}${x(i).toFixed(2)},${y(m[key]).toFixed(2)}`).join(' ');
  return <figure className="pricing-chart"><svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`Prévision de recettes, coûts et résultat sur ${rows.length} mois. Les valeurs exactes figurent dans le tableau.`}>
    {[minimum, 0, maximum].filter((n, i, a) => a.indexOf(n) === i).map(n => <g key={n}><line x1={left} x2={width - 16} y1={y(n)} y2={y(n)} stroke="#d9dfd4"/><text x={left - 8} y={y(n) + 4} textAnchor="end">{num(n, 0)} €</text></g>)}
    <path d={path('revenueHt')} fill="none" stroke="#9dad8e" strokeWidth="3"/><path d={path('totalCosts')} fill="none" stroke="#bd9765" strokeWidth="2"/>
    <path d={path('profit')} fill="none" stroke="#34523a" strokeWidth="3"/>
    {rows.filter((_, i) => i === 0 || i === rows.length - 1 || i % Math.ceil(rows.length / 6) === 0).map(m => <text key={m.month} x={x(m.month - 1)} y={height - 10} textAnchor="middle">M{m.month}</text>)}
  </svg><figcaption><span><i className="pricing-dot is-revenue"/>Recettes HT après pertes</span><span><i className="pricing-dot is-cost"/>Coûts totaux</span><span><i className="pricing-dot is-profit"/>Résultat simulé</span></figcaption></figure>;
}

export function AdminPricingSimulator({accountId}: {accountId: string}) {
  const [boot, setBoot] = useState<PricingBootstrap | null>(null), [input, setInput] = useState<Input | null>(null);
  const [tab, setTab] = useState<Tab>('offers'), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const [saving, setSaving] = useState(false), [loadingObservations, setLoadingObservations] = useState(false);
  const [saved, setSaved] = useState<{id: string; revision: number} | null>(null), [savedJson, setSavedJson] = useState('');
  const [days, setDays] = useState(30), [mode, setMode] = useState<'all' | 'test' | 'live'>('all');
  const observationsVersion = useRef(0), importFile = useRef<HTMLInputElement>(null);
  const localKey = 'bienvu-pricing-draft-v1:' + accountId;
  useEffect(() => {
    const controller = new AbortController();
    void read<PricingBootstrap>('/api/admin/pricing', {signal: controller.signal}).then(data => {
      if (controller.signal.aborted) return;
      setBoot(data); setInput(data.defaults); setSavedJson(JSON.stringify(data.defaults));
      try {
        const raw = localStorage.getItem(localKey);
        if (raw && raw.length <= 100_000) {
          const draft = JSON.parse(raw) as {input?: unknown; id?: string; revision?: number; at?: number};
          const candidate = PricingSimulationInput.safeParse(draft.input);
          if (candidate.success && typeof draft.at === 'number' && Date.now() - draft.at < 7 * 86400_000) {
            setInput(candidate.data);
            const existing = data.scenarios.find(s => s.id === draft.id && s.revision === draft.revision);
            setSaved(existing ? {id: existing.id, revision: existing.revision} : null);
            setSavedJson(existing ? JSON.stringify(existing.input) : JSON.stringify(data.defaults));
            setNotice('Votre brouillon de simulation a été restauré sur cet appareil.');
          }
        }
      } catch {/* Browser storage is optional. */}
    }).catch(e => {if (!controller.signal.aborted) setError(e instanceof Error ? e.message : 'Chargement interrompu.');});
    return () => controller.abort();
  }, [localKey]);
  const checked = useMemo(() => input ? PricingSimulationInput.safeParse(input) : null, [input]);
  const report = useMemo(() => checked?.success ? calculatePricing(checked.data) : null, [checked]);
  const dirty = input !== null && JSON.stringify(input) !== savedJson;
  useEffect(() => {
    if (!checked?.success) return;
    try {localStorage.setItem(localKey, JSON.stringify({input: checked.data, id: saved?.id, revision: saved?.revision, at: Date.now()}));}
    catch {/* Financial hypotheses can still be saved on the server. */}
  }, [checked, saved, localKey]);

  function edit(update: (current: Input) => Input) {setInput(current => current ? update(current) : current); setNotice(''); setError('');}
  function field<G extends Group>(group: G, key: keyof Input[G], value: number | string | boolean) {
    edit(s => ({...s, [group]: {...s[group], [key]: value}}));
  }
  function fields<G extends Group>(group: G, configs: readonly (readonly [NumericKey<Input[G]>, string, number?, string?])[]) {
    return <div className="pricing-fields">{configs.map(([key, label, step, hint]) => <NumberField key={String(key)} label={label}
      value={Number(input![group][key])} step={step} hint={hint} onChange={value => field(group, key, value)}/>)}</div>;
  }
  function loadScenario(scenario: PricingSavedScenario) {
    setInput(structuredClone(scenario.input)); setSaved({id: scenario.id, revision: scenario.revision});
    setSavedJson(JSON.stringify(scenario.input)); setError(''); setNotice('Scénario chargé.');
  }
  async function save(copy = false) {
    if (!checked?.success || saving) return;
    setSaving(true); setError('');
    try {
      const value = await read<{scenario: PricingSavedScenario}>('/api/admin/pricing', {method: 'POST', headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({action: 'save', id: copy ? null : saved?.id ?? null, revision: copy ? null : saved?.revision ?? null, input: checked.data})});
      setBoot(b => b ? {...b, scenarios: [value.scenario, ...b.scenarios.filter(s => s.id !== value.scenario.id)]} : b);
      setSaved({id: value.scenario.id, revision: value.scenario.revision}); setSavedJson(JSON.stringify(value.scenario.input));
      setNotice('Scénario sauvegardé dans le superadmin.');
    } catch (e) {setError(e instanceof Error ? e.message : 'Sauvegarde interrompue.');} finally {setSaving(false);}
  }
  async function remove() {
    if (!saved || saving) return;
    setSaving(true); setError('');
    try {
      await read('/api/admin/pricing', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({action: 'delete', ...saved})});
      setBoot(b => b ? {...b, scenarios: b.scenarios.filter(s => s.id !== saved.id)} : b); setSaved(null);
      setNotice('Scénario retiré de la liste. Ses paramètres restent dans votre brouillon.');
    } catch (e) {setError(e instanceof Error ? e.message : 'Suppression interrompue.');} finally {setSaving(false);}
  }
  async function importJson(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]; event.target.value = '';
    if (!file) return;
    try {
      if (file.size > 131072) throw Error('Le fichier est limité à 128 Ko.');
      const data: unknown = JSON.parse(await file.text());
      const candidate = data && typeof data === 'object' && 'scenario' in data ? data.scenario : data;
      const parsed = PricingSimulationInput.safeParse(candidate);
      if (!parsed.success) throw Error('Ce fichier ne contient pas un scénario BienVu valide.');
      setInput(parsed.data); setSaved(null); setSavedJson(''); setError(''); setNotice('Scénario importé. Vous pouvez l’enregistrer comme nouvelle simulation.');
    } catch (e) {setError(e instanceof Error ? e.message : 'Import interrompu.');}
  }
  async function refreshObservations() {
    const version = ++observationsVersion.current; setLoadingObservations(true); setError('');
    try {
      const data = await read<PricingBootstrap>(`/api/admin/pricing?days=${days}&mode=${mode}`);
      if (version === observationsVersion.current) setBoot(b => b ? {...b, observations: data.observations, scenarios: data.scenarios} : data);
    } catch (e) {if (version === observationsVersion.current) setError(e instanceof Error ? e.message : 'Lecture interrompue.');}
    finally {if (version === observationsVersion.current) setLoadingObservations(false);}
  }
  function applyProvider(row: PricingObservation, source: 'estimate' | 'invoice') {
    if (!input) return;
    const cost = source === 'invoice' ? row.reconciledAverageJobEur
      : row.estimatedAverageJobUsd === null ? null : row.estimatedAverageJobUsd * input.market.eurPerUsd;
    if (cost === null || cost < 0) return;
    edit(s => ({...s, notes: (s.notes + `\n${providerNames[row.provider] ?? row.provider} : moyenne ${source === 'invoice' ? 'rapprochée EUR' : 'estimée USD convertie'} sur ${boot!.observations.days} jours, relevée le ${boot!.observations.at.slice(0, 10)}.`).trim().slice(0, 1500),
      production: {...s.production, ...(row.provider === 'openai' ? {textEurPerVideo: cost} : {voiceMode: 'per_video', voiceEurPerVideo: cost})}}));
    setNotice('Coût moyen copié dans les hypothèses. Vérifiez qu’il correspond à la durée et au fournisseur du scénario.');
  }

  if (!boot || !input) return <div className="admin-pricing">{error ? <p className="admin-error" role="alert">{error}</p> : <p role="status">Chargement du simulateur et des données de référence…</p>}</div>;
  const first = report?.months[0], last = report?.months.at(-1);
  const activeMargins = report?.offers.filter(o => o.enabled).flatMap(o => o.marginPercent === null ? [] : [o.marginPercent]) ?? [];
  const observations = boot.observations;
  return <div className="admin-pricing">
    <section className="pricing-intro"><div><span className="pricing-eyebrow">DÉCISIONS COMMERCIALES</span><h3>Un prix juste. Une marge mesurée.</h3>
      <p>Comparez les recharges et les abonnements, provisionnez les coûts futurs et testez vos hypothèses avant de définir vos tarifs.</p></div>
      <a href="/admin?view=finance" className="admin-button">Voir la rentabilité observée <HomeIcon name="arrow" size={16}/></a></section>
    <section className="pricing-scenario-bar" aria-label="Gestion des simulations">
      <label className="pricing-field"><span>Nom de la simulation</span><input value={input.name} maxLength={100} onChange={e => edit(s => ({...s, name: e.target.value}))}/></label>
      <label className="pricing-field"><span>Scénarios sauvegardés</span><select disabled={saving} value={saved?.id ?? ''} onChange={e => {const scenario = boot.scenarios.find(s => s.id === e.target.value); if (scenario) loadScenario(scenario); else setSaved(null);}}>
        <option value="">Brouillon courant</option>{boot.scenarios.map(s => <option key={s.id} value={s.id}>{s.input.name} · v{s.revision}</option>)}</select></label>
      <div className="pricing-actions"><button type="button" className="admin-button admin-button-dark" disabled={saving || !report || !dirty && saved !== null} onClick={() => void save()}>Enregistrer</button>
        <button type="button" className="admin-button" disabled={saving || !report} onClick={() => void save(true)}>Enregistrer une copie</button>
        {saved && <button type="button" className="admin-button" disabled={saving} onClick={() => void remove()}>Retirer</button>}</div>
      <span className="pricing-save-status">{saved ? `Version ${saved.revision}` : 'Brouillon local'}{dirty ? ' · modifications à enregistrer' : saved ? ' · sauvegardé' : ' · à enregistrer dans le superadmin'} · calculs en EUR HT</span>
    </section>
    <div className="pricing-presets"><span>Point de départ</span>{([['current', 'Usage courant'], ['intensive', 'IA intensive'], ['growth', 'Croissance']] as const).map(([preset, label]) =>
      <button type="button" className="admin-button" disabled={saving} key={preset} onClick={() => {try {edit(() => pricingPreset(input, preset));} catch {setError('Le volume du scénario dépasse les limites de prévision. Réduisez-le avant d’appliquer ce profil.');}}}>{label}</button>)}
      <button type="button" className="admin-button" disabled={saving} onClick={() => {setInput(structuredClone(boot.defaults)); setSaved(null); setSavedJson(''); setNotice('Catalogue et hypothèses de départ restaurés.');}}>Repartir du catalogue actuel</button>
    </div>
    {notice && <p role="status" className="admin-notice">{notice}</p>}{error && <p role="alert" className="admin-error">{error}</p>}
    {checked && !checked.success && <div className="pricing-validation" role="alert"><strong>Corrigez les hypothèses pour obtenir un calcul fiable.</strong><ul>{checked.error.issues.slice(0, 8).map((issue, i) => <li key={i}>{issue.path.join(' › ')} : {issue.message}</li>)}</ul></div>}
    <div className="pricing-metrics">
      <article><span>Production par crédit · prudente</span><strong>{money(report?.grossEurPerCredit ?? null, 3)}</strong><small>Hors quotas, avec {report?.holdingMonths ?? '—'} mois de stockage</small></article>
      <article><span>Marge minimale des offres</span><strong className={activeMargins.length && Math.min(...activeMargins) < input.market.targetMargin ? 'pricing-negative' : ''}>{pct(activeMargins.length ? Math.min(...activeMargins) : null)}</strong><small>À consommation intégrale · objectif {pct(input.market.targetMargin)}</small></article>
      <article><span>Résultat simulé · mois 1</span><strong className={first && first.profit < 0 ? 'pricing-negative' : ''}>{money(first?.profit ?? null)}</strong><small>Après quotas inclus, paiement et frais fixes</small></article>
      <article><span>Résultat cumulé · {input.market.horizonMonths} mois</span><strong className={last && last.cumulativeProfit < 0 ? 'pricing-negative' : ''}>{money(last?.cumulativeProfit ?? null)}</strong><small>Stockage et report des recharges inclus</small></article>
    </div>
    <nav className="pricing-tabs" aria-label="Sections du simulateur">{tabs.map(item => <button type="button" key={item.id} aria-pressed={tab === item.id} onClick={() => setTab(item.id)}>{item.label}</button>)}</nav>

    {tab === 'offers' && <>
      <section className="pricing-card"><div className="pricing-card-heading"><div><h3>Votre catalogue simulé</h3><p>Les prix sont HT. Le bonus ajoute des crédits à produire, sans augmenter le prix de vente.</p></div><div className="pricing-actions">
        {(['pack', 'subscription'] as const).map(kind => <button type="button" className="admin-button" key={kind} disabled={input.offers.length >= 16} onClick={() => edit(s => ({...s, offers: [...s.offers,
          {id: crypto.randomUUID(), name: kind === 'pack' ? 'Nouvelle recharge' : 'Nouvel abonnement', kind, credits: 30, bonusCredits: 0, priceHt: 19, quantity: 10, enabled: true, referenceCode: null}]}))}>+ {kind === 'pack' ? 'Recharge' : 'Abonnement'}</button>)}</div></div>
        <div className="admin-table-scroll"><table className="admin-table pricing-edit-table"><thead><tr><th>Inclure</th><th>Offre</th><th>Type</th><th>Crédits</th><th>Bonus</th><th>Prix HT (€)</th><th>Achats ou abonnés / mois</th><th/></tr></thead><tbody>{input.offers.map((offer, i) => <tr key={offer.id}>
          <td><input type="checkbox" checked={offer.enabled} aria-label={`Inclure ${offer.name}`} onChange={e => edit(s => ({...s, offers: s.offers.map((o, n) => n === i ? {...o, enabled: e.target.checked} : o)}))}/></td>
          <td><input aria-label={`Nom de l’offre ${i + 1}`} value={offer.name} maxLength={80} onChange={e => edit(s => ({...s, offers: s.offers.map((o, n) => n === i ? {...o, name: e.target.value} : o)}))}/>{offer.referenceCode && <small>Référence du catalogue : {offer.referenceCode}</small>}</td>
          <td><select aria-label={`Type de ${offer.name}`} value={offer.kind} onChange={e => edit(s => ({...s, offers: s.offers.map((o, n) => n === i ? {...o, kind: e.target.value as 'pack' | 'subscription'} : o)}))}><option value="pack">Recharge</option><option value="subscription">Abonnement mensuel</option></select></td>
          {(['credits', 'bonusCredits', 'priceHt', 'quantity'] as const).map(key => <td key={key}><input type="number" step={key === 'priceHt' ? 0.01 : 1} value={offer[key]} aria-label={`${{credits: 'Crédits', bonusCredits: 'Bonus', priceHt: 'Prix HT', quantity: 'Volume mensuel'}[key]} · ${offer.name}`}
            onChange={e => edit(s => ({...s, offers: s.offers.map((o, n) => n === i ? {...o, [key]: Number(e.target.value)} : o)}))}/></td>)}
          <td><button type="button" className="pricing-remove" disabled={input.offers.length === 1} aria-label={`Supprimer ${offer.name} de la simulation`} onClick={() => edit(s => ({...s, offers: s.offers.filter(o => o.id !== offer.id)}))}>×</button></td>
        </tr>)}</tbody></table></div>
        <p className="pricing-help">Un abonnement est facturé chaque mois au nombre d’abonnés indiqué. Une recharge correspond au nombre d’achats mensuels. La croissance s’applique à ces volumes.</p>
      </section>
      {fields('market', [['targetMargin', 'Objectif de marge (%)', 1], ['vatPercent', 'TVA simulée (%)', 1, 'La TVA collectée est séparée des recettes HT. Les frais de paiement sont calculés sur le montant TTC.']])}
      {report && <section className="pricing-card"><h3>Rentabilité prudente par vente</h3><p>Consommation de tous les crédits, quotas fournisseurs épuisés, stockage provisionné sur {report.holdingMonths} mois. Les frais partagés dépendent du volume saisi.</p>
        <div className="admin-table-scroll"><table className="admin-table"><thead><tr><th>Offre</th><th>Prix / crédit</th><th>Production</th><th>Paiement</th><th>Partagés</th><th>Marge</th><th>Prix cible HT</th><th>Remise max.</th></tr></thead><tbody>{report.offers.map(o => <tr key={o.id} className={!o.enabled ? 'pricing-inactive' : ''}>
          <td><strong>{o.name}</strong><small>{o.credits} crédits · {num(o.expectedVideos)} vidéos selon le profil</small><span className={`pricing-badge is-${o.status}`}>{o.status === 'target' ? 'Objectif atteint' : o.status === 'below_target' ? 'Sous l’objectif' : o.status === 'loss' ? 'Déficitaire' : 'Hors prévision'}</span>{o.currentPriceHt !== null && <small>Prix actuel : {money(o.currentPriceHt)} HT</small>}</td>
          <td>{money(o.pricePerCredit, 3)}<small>{money(o.priceTtc)} TTC / achat</small></td><td>{money(o.productionEur)}</td><td>{money(o.paymentFees)}</td><td>{money(o.sharedEur)}</td>
          <td className={o.profit < 0 ? 'pricing-negative' : ''}><strong>{pct(o.marginPercent)}</strong><small>{money(o.profit)} après coûts</small></td>
          <td><strong>{money(o.minimumPriceHt)}</strong>{o.minimumPriceHt !== null && <button type="button" className="pricing-link" onClick={() => edit(s => ({...s, offers: s.offers.map(offer => offer.id === o.id ? {...offer, priceHt: o.minimumPriceHt!} : offer)}))}>Simuler ce prix</button>}</td>
          <td>{pct(o.maxDiscountPercent)}<small>Budget variable disponible : {money(o.maxExtraPerOrderEur)}</small></td>
        </tr>)}</tbody></table></div>
        <p className="pricing-help">Marge = (recettes HT après remboursements et litiges − production − paiement − frais partagés) / recettes HT conservées. Le prix cible est arrondi au centime supérieur. Ces modifications concernent vos simulations.</p>
      </section>}
    </>}

    {tab === 'usage' && <>
      <section className="pricing-card"><div className="pricing-card-heading"><div><h3>Comment les crédits seront-ils utilisés ?</h3><p>Les parts représentent les vidéos générées. Leur total doit être égal à 100 %.</p></div><div className="pricing-actions">
        <button type="button" className="admin-button" onClick={() => edit(s => ({...s, profiles: s.profiles.map((p, i) => ({...p, share: i === s.profiles.length - 1 ? 100 - Math.floor(10000 / s.profiles.length) / 100 * i : Math.floor(10000 / s.profiles.length) / 100}))}))}>Répartir également</button>
        <button type="button" className="admin-button" disabled={input.profiles.length >= 6} onClick={() => edit(s => ({...s, profiles: [...s.profiles, {id: crypto.randomUUID(), name: 'Nouveau profil', share: 0, photos: 6, animations: 0, durationSeconds: 20, renderSeconds: 120, voice: true, map: false}]}))}>+ Profil</button></div></div>
        <div className="pricing-profiles">{input.profiles.map((profile, i) => <article key={profile.id} className="pricing-profile">
          <div className="pricing-profile-heading"><input aria-label={`Nom du profil ${i + 1}`} value={profile.name} maxLength={80} onChange={e => edit(s => ({...s, profiles: s.profiles.map((p, n) => n === i ? {...p, name: e.target.value} : p)}))}/>
            <button type="button" className="pricing-remove" disabled={input.profiles.length === 1} aria-label={`Supprimer le profil ${profile.name}`} onClick={() => edit(s => ({...s, profiles: s.profiles.filter(p => p.id !== profile.id)}))}>×</button></div>
          <div className="pricing-fields">{([['share', 'Part des vidéos (%)'], ['photos', 'Photos'], ['animations', 'Photos animées'], ['durationSeconds', 'Durée vidéo (s)'], ['renderSeconds', 'Calcul du rendu (s)']] as const).map(([key, label]) =>
            <NumberField key={key} label={label} value={profile[key]} step={key === 'share' ? 0.1 : 1} onChange={value => edit(s => ({...s, profiles: s.profiles.map((p, n) => n === i ? {...p, [key]: value} : p)}))}/>)}
          </div><div className="pricing-checks">{([['voice', 'Voix off'], ['map', 'Séquence carte']] as const).map(([key, label]) => <label key={key}><input type="checkbox" checked={profile[key]} onChange={e => edit(s => ({...s, profiles: s.profiles.map((p, n) => n === i ? {...p, [key]: e.target.checked} : p)}))}/>{label}</label>)}</div>
          {report && <p className="pricing-profile-result">{num(report.profiles[i].measures.credits, 2)} crédits par vidéo · {money(report.profiles[i].grossEur, 3)} de coût prudent</p>}
        </article>)}</div>
        <p className="pricing-help">1 crédit par génération, plus 1 par nouvelle animation IA. Une animation réutilisée réduit à la fois le coût fournisseur et les crédits facturés. Moyenne : {report ? num(report.averageCreditsPerVideo, 2) : '—'} crédits par vidéo.</p>
      </section>
      {fields('production', [['animationReusePercent', 'Animations réutilisées (%)', 1], ['extraAnimationAttemptsPercent', 'Tentatives IA facturées supplémentaires (%)', 1, 'Échecs facturés ou nouvelles générations. Une reprise sans nouvel appel fournisseur ne compte pas.'], ['extraRenderPercent', 'Rendus supplémentaires (%)', 1, 'Réexports offerts et reprises qui utilisent du calcul sans créer de nouveaux crédits.'], ['voiceExtraPercent', 'Voix régénérées supplémentaires (%)', 1]])}
    </>}

    {tab === 'production' && <>
      <section className="pricing-card"><h3>Animations et rédaction</h3>{fields('production', [
        ['runwayCreditsPerSecond', 'Crédits API Runway / seconde', 0.1], ['runwaySeconds', 'Durée d’un clip IA (s)', 1],
        ['runwayUsdPerCredit', 'Prix USD / crédit Runway', 0.001], ['textEurPerVideo', 'Rédaction EUR / vidéo', 0.001, 'Hypothèse initiale. Une moyenne de requêtes estimée peut être copiée depuis Données observées.'],
        ['otherEurPerVideo', 'Autres coûts EUR / vidéo', 0.001], ['mapExtraRenderSeconds', 'Calcul ajouté par carte (s)', 1],
      ])}<p className="pricing-help">Un nouveau clip coûte {report ? money(report.runwayClipEur, 3) : '—'} au taux de change saisi, avant tentatives supplémentaires.</p></section>
      <section className="pricing-card"><h3>Voix off</h3><div className="pricing-fields"><label className="pricing-field"><span>Mode de calcul</span><select value={input.production.voiceMode} onChange={e => field('production', 'voiceMode', e.target.value)}><option value="cartesia_plan">Forfait Cartesia</option><option value="per_video">Coût moyen par vidéo avec voix</option></select></label>
        {input.production.voiceMode === 'cartesia_plan' && <label className="pricing-field"><span>Forfait simulé</span><select value={input.production.cartesiaPlan} onChange={e => field('production', 'cartesiaPlan', e.target.value)}>
          <option value="auto">Automatique · forfait commercial adapté</option>{cartesiaPricingPlans.map(p => <option value={p.id} key={p.id}>{p.name} · {p.monthlyUsd} $/mois · ≈ {p.minutes} min</option>)}<option value="custom">Contrat personnalisé</option></select></label>}</div>
        {input.production.voiceMode === 'per_video' ? fields('production', [['voiceEurPerVideo', 'Coût EUR / vidéo avec voix', 0.001, 'Inclure toutes les scènes parlées. Le nombre de régénérations est réglable dans Profils d’usage.']])
          : input.production.cartesiaPlan === 'custom' ? fields('production', [['voiceCustomMonthlyUsd', 'Forfait voix USD / mois', 0.01], ['voiceCustomMinutes', 'Minutes incluses / mois', 1]]) : null}
        {(input.production.voiceMode === 'per_video' || input.production.cartesiaPlan === 'custom') && <label className="pricing-check"><input type="checkbox" checked={input.production.voiceCommercialLicense} onChange={e => field('production', 'voiceCommercialLicense', e.target.checked)}/>Le forfait retenu permet un usage commercial</label>}
        <p className="pricing-help">Les capacités Cartesia en minutes sont indicatives. Le mode automatique choisit Pro, Startup ou Scale selon le besoin mensuel. Au-delà de Scale, le scénario nécessite un contrat adapté. Free sert aux essais et ne comprend pas la licence commerciale indiquée sur le tarif public.</p>
      </section>
      <section className="pricing-card"><h3>Imports et support</h3>{fields('production', [['importsPerVideo', 'Imports nouveaux / vidéo', 0.1, 'Réduire cette valeur si plusieurs vidéos utilisent le même bien.'], ['importCpuSeconds', 'CPU d’un import (s)', 1], ['importUptimeSeconds', 'Temps alloué à un import (s)', 1], ['browserFallbackPercent', 'Imports avec navigateur (%)', 1], ['browserEurPerImport', 'Surcoût navigateur EUR / import', 0.001]])}
        {fields('market', [['supportMinutesPerVideo', 'Support (minutes / vidéo)', 0.1], ['supportHourlyEur', 'Coût horaire du support (€)', 1]])}</section>
      <section className="pricing-card"><h3>Médias conservés et opérations</h3>{fields('production', [['outputMB', 'MP4 final (Mo)', 1], ['photoMB', 'Une photo (Mo)', 0.1], ['animationMB', 'Un clip IA (Mo)', 0.1], ['voiceMB', 'Audio source (Mo / vidéo)', 0.1], ['writesPerVideo', 'Écritures R2 / vidéo', 1], ['readsPerVideo', 'Lectures R2 / vidéo', 1], ['workerRequestsPerVideo', 'Requêtes Workers / vidéo', 1], ['workerCpuMsPerVideo', 'CPU Workers / vidéo (ms)', 1]])}
        <p className="pricing-help">Les consultations et téléchargements sont à inclure dans les lectures. Le trafic sortant R2 est gratuit ; les services liés peuvent avoir leurs propres frais.</p></section>
      <section className="pricing-card"><h3>Moteur Cloudflare</h3>{fields('cloudflare', [['fixedMonthlyUsd', 'Workers Paid USD / mois', 0.01], ['vcpu', 'vCPU du rendu', 0.25], ['ramGiB', 'Mémoire allouée (GiB)', 0.25], ['diskGB', 'Disque temporaire alloué (Go)', 1], ['idleSeconds', 'Inactivité allouée / rendu (s)', 1], ['renderInstances', 'Instances de rendu disponibles', 1], ['quotaAvailablePercent', 'Part des quotas encore disponible (%)', 1, 'Les quotas sont partagés avec le reste du compte Cloudflare.']])}
        <details className="pricing-details"><summary>Tarifs unitaires et allocations incluses</summary>{fields('cloudflare', [
          ['cpuUsdPerSecond', 'USD / vCPU-seconde', 0.000001], ['memoryUsdPerGiBSecond', 'USD / GiB-seconde', 0.0000001], ['diskUsdPerGBSecond', 'USD / Go-seconde', 0.00000001],
          ['includedCpuSeconds', 'CPU inclus / mois (s)', 1], ['includedMemoryGiBSeconds', 'Mémoire incluse / mois (GiB-s)', 1], ['includedDiskGBSeconds', 'Disque inclus / mois (Go-s)', 1],
          ['storageUsdPerGBMonth', 'Stockage USD / Go-mois', 0.001], ['includedStorageGB', 'Stockage gratuit (Go)', 1],
          ['writeUsdPerMillion', 'Écritures R2 USD / million', 0.01], ['readUsdPerMillion', 'Lectures R2 USD / million', 0.01], ['includedWrites', 'Écritures R2 incluses / mois', 1], ['includedReads', 'Lectures R2 incluses / mois', 1],
          ['workerUsdPerMillionRequests', 'Workers USD / million de requêtes', 0.01], ['workerUsdPerMillionCpuMs', 'Workers USD / million de ms CPU', 0.01], ['includedWorkerRequests', 'Requêtes Workers incluses / mois', 1], ['includedWorkerCpuMs', 'CPU Workers inclus / mois (ms)', 1],
        ])}</details></section>
    </>}

    {tab === 'volume' && <>
      <section className="pricing-card"><h3>Consommation et croissance</h3>{fields('market', [['consumptionPercent', 'Crédits disponibles consommés / mois (%)', 1, 'Pour les recharges : stock initial, nouveaux achats et crédits reportés. Pour les abonnements : allocation du mois.'], ['growthPercent', 'Croissance des volumes / mois (%)', 1], ['horizonMonths', 'Horizon de simulation (mois)', 1], ['initialUnusedPackCredits', 'Crédits recharge déjà vendus, non consommés', 1, 'Leur consommation crée un coût futur, sans nouvelle recette.'], ['freeVideosMonthly', 'Essais ou vidéos offerts / mois', 1], ['freeRetentionDays', 'Conservation des médias gratuits (jours)', 1], ['initialStorageGB', 'Stockage existant (Go)', 1], ['storageRetentionMonths', 'Conservation des vidéos payantes (mois)', 1, '0 = conservation permanente. Le prix cible provisionne le stockage sur l’horizon choisi.']])}
        <p className="pricing-help">Les essais gratuits sont modélisés comme des vidéos classiques de 20 secondes avec voix off et six photos. Le stock existant est conservé pendant toute la simulation.</p></section>
      <section className="pricing-card"><h3>Paiements, change et pertes</h3>{fields('market', [['eurPerUsd', 'EUR pour 1 USD', 0.001, 'Hypothèse initiale : 1. Utiliser le taux réellement supporté, frais de conversion compris.'], ['paymentPercent', 'Frais de paiement (%) du TTC', 0.1], ['paymentFixedEur', 'Frais fixes EUR / transaction', 0.01], ['subscriptionFeePercent', 'Frais Billing supplémentaires (%)', 0.1, 'Appliqués aux abonnements seulement.'], ['refundsPercent', 'Achats remboursés (%)', 0.1], ['disputesPercent', 'Achats perdus en litige (%)', 0.1], ['disputeFeeEur', 'Frais par litige (€)', 0.01], ['otherPerOrderEur', 'Autres coûts EUR / achat', 0.01]])}
        <p className="pricing-help">Les frais de paiement restent engagés sur les achats d’origine. Le modèle conserve le coût de production des crédits consommés même en cas de remboursement. Les éventuels avoirs fournisseurs sont à rapprocher séparément.</p></section>
      <section className="pricing-card"><h3>Frais fixes complémentaires</h3>{fields('market', [['otherFixedMonthlyEur', 'Autres frais fixes EUR / mois', 1, 'Licences, outils, salaires fixes, comptabilité…'], ['marketingMonthlyEur', 'Acquisition et marketing EUR / mois', 1]])}
        <label className="pricing-field"><span>Notes et justification des hypothèses</span><textarea value={input.notes} maxLength={1500} rows={4} onChange={e => edit(s => ({...s, notes: e.target.value}))}/></label></section>
    </>}

    {tab === 'forecast' && report && first && last && <>
      <section className="pricing-card"><div className="pricing-card-heading"><div><h3>Prévision sur {input.market.horizonMonths} mois</h3><p>Recettes HT après pertes, coûts d’usage et frais fixes. Les prépaiements fournisseurs peuvent décaler les sorties de trésorerie.</p></div><button type="button" className="admin-button" onClick={() => download('bienvu-prix-previsions.csv', pricingCsv(input, report), 'text/csv;charset=utf-8')}>Exporter le tableau CSV</button></div>
        <ForecastChart report={report}/><div className="pricing-secondary-metrics"><div><span>Point mort prudent / mois</span><strong>{report.breakEvenOrders === null ? 'Non atteint' : num(report.breakEvenOrders, 0) + ' achats'}</strong><small>Mix de ventes conservé · hors quotas inclus</small></div>
          <div><span>Stockage au dernier mois</span><strong>{num(last.storedGB)} Go</strong><small>{money(last.costs.storage)} de stockage ce mois-là</small></div>
          <div><span>Coût futur des crédits en attente</span><strong>{money(last.exposureEur)}</strong><small>{num(last.unusedPackCredits, 0)} crédits recharge non consommés</small><small>Cumul après provision indicative : {money(last.cumulativeAfterExposureEur)}</small></div></div>
        <div className="admin-table-scroll"><table className="admin-table"><thead><tr><th>Mois</th><th>Recettes HT</th><th>Vidéos payantes / gratuites</th><th>Production & stockage</th><th>Paiement</th><th>Fixes</th><th>Résultat</th><th>Stock Go</th><th>Crédits reportés</th><th>Forfait voix</th></tr></thead><tbody>{report.months.map(m => <tr key={m.month}>
          <td>M{m.month}</td><td>{money(m.revenueHt)}</td><td>{num(m.paidVideos)} / {num(m.freeVideos)}</td><td>{money(Object.values(m.costs).reduce((a, b) => a + b, 0))}</td><td>{money(m.paymentFees)}</td><td>{money(m.fixedEur)}</td>
          <td className={m.profit < 0 ? 'pricing-negative' : ''}><strong>{money(m.profit)}</strong><small>{pct(m.marginPercent)}</small></td><td>{num(m.storedGB)}</td><td>{num(m.unusedPackCredits, 0)}</td><td>{m.voicePlan.name}<small>{num(m.voiceMinutes)} min · {pct(m.capacityPercent)} de capacité de rendu</small></td>
        </tr>)}</tbody></table></div>
        <p className="pricing-help">Les recettes suivent les ventes simulées. Le coût futur des recharges reportées est déduit séparément du cumul pour estimer une provision ; ce calcul ne constitue pas une reconnaissance comptable du chiffre d’affaires. Les nouveaux médias sont comptés dès le début du mois, de façon prudente. Les essais sont proratisés selon leur durée de conservation. Les arrondis R2 sont pris en compte. La capacité de rendu suppose 30 jours disponibles ; les pics nécessitent une marge supplémentaire.</p>
      </section>
      <section className="pricing-card"><h3>Quels changements fragilisent la marge ?</h3><div className="admin-table-scroll"><table className="admin-table"><thead><tr><th>Scénario</th><th>Résultat mois 1</th><th>Résultat dernier mois</th><th>Résultat cumulé</th><th>Cumul après provision des crédits</th><th>Marge mensuelle minimale</th><th>Coût des crédits en attente</th><th>Capacité & licence voix</th></tr></thead><tbody>{report.comparisons.map(c => <tr key={c.id}><td>{c.name}</td><td>{money(c.firstProfit)}</td><td>{money(c.finalProfit)}</td><td className={c.cumulativeProfit < 0 ? 'pricing-negative' : ''}>{money(c.cumulativeProfit)}</td><td className={c.cumulativeAfterExposureEur < 0 ? 'pricing-negative' : ''}>{money(c.cumulativeAfterExposureEur)}</td><td>{pct(c.minMargin)}</td><td>{money(c.closingExposureEur)}</td><td>{c.feasible ? 'Compatible' : 'À adapter'}</td></tr>)}</tbody></table></div>
        <p className="pricing-help">Le scénario défavorable augmente le change USD de 20 %, les tarifs d’animation et les coûts manuels IA de 20 %. Une promotion réduit le prix des offres de 10 % en maintenant la consommation. Ces comparaisons ne changent pas les hypothèses saisies.</p></section>
      <section className="pricing-card"><h3>Détail des coûts · premier mois</h3><div className="pricing-cost-breakdown">{parts.map(([key, label]) => <div key={key}><span>{label}</span><strong>{money(first.costs[key], 3)}</strong></div>)}<div><span>Frais fixes</span><strong>{money(first.fixedEur)}</strong></div><div><span>Frais de paiement</span><strong>{money(first.paymentFees)}</strong></div></div></section>
    </>}

    {tab === 'observations' && <>
      <section className="pricing-card"><div className="pricing-card-heading"><div><h3>Les chiffres enregistrés dans BienVu</h3><p>Seuls les appels fournisseurs réels sont comptés dans les estimations. Le mode financier distingue les paiements de test des paiements réels.</p></div>
        <div className="pricing-actions"><label className="pricing-field"><span>Période</span><select value={days} onChange={e => setDays(Number(e.target.value))}><option value={30}>30 jours</option><option value={90}>90 jours</option><option value={365}>365 jours</option></select></label>
          <label className="pricing-field"><span>Mode financier des vidéos</span><select value={mode} onChange={e => setMode(e.target.value as typeof mode)}><option value="all">Tous les modes</option><option value="live">Paiements réels</option><option value="test">Paiements de test</option></select></label>
          <button type="button" className="admin-button" disabled={loadingObservations} onClick={() => void refreshObservations()}>Actualiser l’échantillon</button></div></div>
        <p className="pricing-help">Échantillon chargé : {observations.days} jours · {observations.mode === 'all' ? 'tous les modes financiers' : observations.mode === 'live' ? 'paiements réels' : 'paiements de test'} · {new Date(observations.at).toLocaleString('fr-FR')}.</p>
        <div className="pricing-secondary-metrics"><div><span>Vidéos terminées / échecs</span><strong>{num(observations.activity.ready, 0)} / {num(observations.activity.failed, 0)}</strong></div>
          <div><span>Rendu moyen mesuré</span><strong>{observations.render.averageSeconds === null ? 'Non mesuré' : num(observations.render.averageSeconds) + ' s'}</strong><small>{num(observations.render.reports, 0)} rapports · taille finale {observations.render.averageOutputMB === null ? 'inconnue' : num(observations.render.averageOutputMB) + ' Mo'}</small></div>
          <div><span>Animations réutilisées</span><strong>{num(observations.activity.reusedAnimations, 0)}</strong><small>sur {num(observations.activity.requestedAnimations, 0)} animations sélectionnées</small></div></div>
        <div className="pricing-actions"><button type="button" className="admin-button" disabled={observations.render.averageSeconds === null} onClick={() => {const seconds = observations.render.averageSeconds!; edit(s => ({...s, profiles: s.profiles.map(p => ({...p, renderSeconds: Math.max(1, Math.min(3600, Math.round(seconds)))}))}));}}>Copier le temps de rendu moyen</button>
          <button type="button" className="admin-button" disabled={observations.render.averageOutputMB === null} onClick={() => field('production', 'outputMB', Math.min(1000, observations.render.averageOutputMB!))}>Copier la taille du MP4</button>
          <button type="button" className="admin-button" disabled={!observations.activity.requestedAnimations} onClick={() => field('production', 'animationReusePercent', Math.min(100, observations.activity.reusedAnimations / observations.activity.requestedAnimations * 100))}>Copier le taux de réutilisation</button>
          <button type="button" className="admin-button" onClick={() => field('market', 'initialUnusedPackCredits', observations.unusedPackCredits)}>Copier les {num(observations.unusedPackCredits, 0)} crédits recharge disponibles</button></div>
      </section>
      <section className="pricing-card"><h3>Estimations de requêtes et factures rapprochées</h3><p>Les moyennes concernent des vidéos terminées et des coûts complets pour le fournisseur. Une absence de données reste inconnue.</p>
        <div className="admin-table-scroll"><table className="admin-table"><thead><tr><th>Fournisseur</th><th>Appels mesurés / réels</th><th>Estimation moyenne / vidéo</th><th>Vidéos rapprochées</th><th>Coût rapproché moyen / vidéo</th><th>Appliquer aux hypothèses</th></tr></thead><tbody>{observations.providers.map(row => <tr key={row.provider}>
          <td>{providerNames[row.provider] ?? row.provider}</td><td>{num(row.measuredCalls, 0)} / {num(row.realCalls, 0)}<small>{num(row.completeJobs, 0)} vidéos avec estimation complète</small></td>
          <td>{row.estimatedAverageJobUsd === null ? 'Inconnue' : money(row.estimatedAverageJobUsd * input.market.eurPerUsd, 4)}<small>USD convertis · hors quotas fournisseurs</small></td>
          <td>{num(row.reconciledJobs, 0)}</td><td>{row.reconciledAverageJobEur === null ? 'Non rapproché' : money(row.reconciledAverageJobEur, 4)}</td>
          <td>{['openai', 'google', 'fish', 'cartesia'].includes(row.provider) ? <div className="pricing-actions"><button type="button" className="admin-button" disabled={row.estimatedAverageJobUsd === null || row.estimatedAverageJobUsd < 0} onClick={() => applyProvider(row, 'estimate')}>Copier estimation</button><button type="button" className="admin-button" disabled={row.reconciledAverageJobEur === null || row.reconciledAverageJobEur < 0} onClick={() => applyProvider(row, 'invoice')}>Copier facture</button></div> : 'Comparer au modèle de production'}</td>
        </tr>)}{!observations.providers.length && <tr><td colSpan={6}>Aucune mesure fournisseur sur cet échantillon. Les hypothèses du scénario restent modifiables.</td></tr>}</tbody></table></div>
        <p className="pricing-help">Les provisions de budget et les achats de crédits prépayés ne sont pas assimilés à un coût facturé par vidéo. Les coûts de test ne constituent pas des recettes réelles.</p>
        {observations.sales.length > 0 && <div className="admin-table-scroll"><table className="admin-table"><thead><tr><th>Paiements enregistrés</th><th>Transactions</th><th>Recettes HT après pertes</th><th>Frais connus</th><th>Frais non rapprochés</th></tr></thead><tbody>{observations.sales.map(s => <tr key={s.kind}><td>{s.kind === 'topup' ? 'Recharges' : 'Abonnements'}</td><td>{num(s.transactions, 0)}</td><td>{money(s.revenueHtEur)}</td><td>{money(s.feeEur)}</td><td>{num(s.missingFees, 0)}</td></tr>)}</tbody></table></div>}
      </section>
    </>}

    {report && <details className="pricing-warning-panel" open><summary>{report.warnings.length ? `${report.warnings.length} points à prendre en compte` : 'Hypothèses du calcul'}</summary>
      <ul>{report.warnings.map(w => <li key={w.code}>{w.message}</li>)}</ul>
      <p>Les coûts de requêtes et de production restent des estimations tant qu’ils ne sont pas rapprochés d’une facture. Les coûts manuels, volumes, frais de litige, taux de change et besoins de support sont des hypothèses à vérifier. D1, Durable Objects, journaux et autres services peuvent être intégrés aux coûts supplémentaires.</p>
    </details>}
    <footer className="pricing-footer"><div className="pricing-actions"><button type="button" className="admin-button" disabled={!report} onClick={() => {if (report) download('bienvu-simulation-prix.json', JSON.stringify({format: 'bienvu-pricing-simulation', at: new Date().toISOString(), sources: boot.sources, scenario: input, report}, null, 2), 'application/json');}}>Exporter JSON</button>
      <button type="button" className="admin-button" disabled={!report} onClick={() => {if (report) download('bienvu-simulation-prix.csv', pricingCsv(input, report), 'text/csv;charset=utf-8');}}>Exporter CSV</button>
      <button type="button" className="admin-button" disabled={saving} onClick={() => importFile.current?.click()}>Importer JSON</button><input ref={importFile} type="file" accept="application/json,.json" hidden disabled={saving} onChange={event => void importJson(event)}/></div>
      <details><summary>Sources des tarifs et méthode</summary><ul>{boot.sources.map(source => <li key={source.url}><a href={source.url} target="_blank" rel="noreferrer">{source.name}</a> · vérifié le {source.at}</li>)}</ul>
        <p>Les tarifs fournisseurs initiaux proviennent de ces sources. Les prix et allocations modifiés manuellement sont des hypothèses. Les valeurs de rendu, tailles de médias, rédaction et volume sont des exemples, à remplacer par vos mesures.</p>
        <p>Le prix cible couvre la production à consommation intégrale, les frais de paiement sur le TTC et une part des charges communes, avec une marge calculée sur les recettes HT conservées. Le point mort est une approximation prudente au mix de ventes saisi. Les prévisions déduisent une seule fois les allocations mensuelles partagées et reportent les recharges non consommées.</p></details></footer>
  </div>;
}
