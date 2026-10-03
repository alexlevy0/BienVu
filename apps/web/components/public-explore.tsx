'use client';

import Link from 'next/link';
import {useEffect, useRef, useState} from 'react';
import {AgencySeal, HomeIcon} from './home-icons';

type Category = 'all' | 'apartments' | 'houses' | 'exceptional';
type Sort = 'newest' | 'oldest';
type PublicVideo = {id: string; title: string; locality: string; propertyType: 'apartment' | 'house' | 'other' | null;
  agency: string; publishedAt: string; expiresAt: string|null; durationSeconds: number; posterUrl: string; pageUrl: string};
type Demo = {id: 'paris' | 'sud' | 'lyon' | 'bordeaux'; title: string; agency: string; locality: string;
  category: 'apartments' | 'houses'; exceptional: boolean; durationSeconds: number};

// Les quatre animations de l’accueil restent des démonstrations, jamais des publications d’agences.
const demos: Demo[] = [
  {id: 'paris', title: 'Lumière sur Paris', agency: 'Maison & Quartier', locality: 'Paris', category: 'apartments', exceptional: false, durationSeconds: 28},
  {id: 'sud', title: 'L’air du Sud', agency: 'Agence Horizon', locality: 'Aix-en-Provence', category: 'houses', exceptional: true, durationSeconds: 32},
  {id: 'lyon', title: 'Un loft à Lyon', agency: 'Atelier Immobilier', locality: 'Lyon', category: 'apartments', exceptional: true, durationSeconds: 27},
  {id: 'bordeaux', title: 'Une maison à Bordeaux', agency: 'Les Belles Adresses', locality: 'Bordeaux', category: 'houses', exceptional: false, durationSeconds: 30},
];
const categories: {value: Category; label: string}[] = [
  {value: 'all', label: 'Tout'}, {value: 'apartments', label: 'Appartements'},
  {value: 'houses', label: 'Maisons'}, {value: 'exceptional', label: 'Biens d’exception'},
];
const duration = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.round(seconds % 60)).padStart(2, '0')}`;
const plain = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('fr-FR');

function Cover({src, title, seconds, demo}: {src: string; title: string; seconds: number; demo?: boolean}) {
  return <>
    <img src={src} alt={`Photo du bien : ${title}`} loading="lazy" onError={event => {event.currentTarget.style.display = 'none';}}/>
    <span className="public-explore-shade"/>
    {demo && <span className="public-explore-demo-badge">Démo</span>}
    <span className="public-explore-duration">{duration(seconds)}</span>
    <span className="public-explore-play" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="m9 5 11 7-11 7V5Z"/></svg></span>
    <span className="public-explore-cover-title">{title}</span>
  </>;
}

function PublicCard({video}: {video: PublicVideo}) {
  return <article className="public-explore-card">
    <Link href={video.pageUrl} className="public-explore-cover" aria-label={`Voir ${video.title}, vidéo publiée par ${video.agency}`}>
      <Cover src={video.posterUrl} title={video.title} seconds={video.durationSeconds}/>
    </Link>
    <div className="public-explore-byline"><span className="public-explore-agency-mark" aria-hidden="true">{video.agency.slice(0, 1).toUpperCase()}</span>
      <span className="public-explore-agency-copy"><strong>{video.agency}</strong><small>{video.locality}</small></span><HomeIcon name="arrow" size={19}/></div>
  </article>;
}

function DemoCard({demo, onPlay}: {demo: Demo; onPlay(demo: Demo): void}) {
  return <article className="public-explore-card">
    <button className="public-explore-cover" type="button" onClick={() => onPlay(demo)} aria-label={`Lire la démonstration ${demo.title}`} aria-haspopup="dialog">
      <Cover src={`/images/studio-home/${demo.id}.webp`} title={demo.title} seconds={demo.durationSeconds} demo/>
    </button>
    <div className="public-explore-byline"><AgencySeal kind={demo.id}/><span className="public-explore-agency-copy"><strong>{demo.agency}</strong><small>{demo.locality}</small></span><HomeIcon name="arrow" size={19}/></div>
  </article>;
}

export function PublicExplore() {
  const [query, setQuery] = useState(''), [search, setSearch] = useState('');
  const [category, setCategory] = useState<Category>('all'), [sort, setSort] = useState<Sort>('newest');
  const [videos, setVideos] = useState<PublicVideo[]>([]), [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true), [moreBusy, setMoreBusy] = useState(false);
  const [error, setError] = useState(''), [moreError, setMoreError] = useState(''), [revision, setRevision] = useState(0);
  const [selected, setSelected] = useState<Demo | null>(null);
  const requestVersion = useRef(0), dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {const timer = setTimeout(() => setSearch(query.trim()), 250); return () => clearTimeout(timer);}, [query]);
  const parameters = () => new URLSearchParams({q: search, category, sort});

  useEffect(() => {
    const version = ++requestVersion.current, controller = new AbortController();
    setVideos([]); setCursor(null); setLoading(true); setError(''); setMoreError('');
    void (async () => {
      try {
        const response = await fetch(`/api/explorer?${parameters()}`, {cache: 'no-store', signal: controller.signal});
        if (!response.ok) throw new Error('Impossible de charger les vidéos publiées.');
        const value = await response.json() as {videos: PublicVideo[]; nextCursor: string | null};
        if (version !== requestVersion.current || controller.signal.aborted) return;
        setVideos(value.videos); setCursor(value.nextCursor);
      } catch {if (!controller.signal.aborted && version === requestVersion.current) setError('Impossible de charger les vidéos publiées.');}
      finally {if (!controller.signal.aborted && version === requestVersion.current) setLoading(false);}
    })();
    return () => controller.abort();
  }, [search, category, sort, revision]);

  useEffect(() => {
    if (!selected) return;
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialog.current?.showModal();
    return () => {dialog.current?.close(); trigger?.focus();};
  }, [selected]);

  async function loadMore() {
    if (!cursor || moreBusy) return;
    const version = requestVersion.current;
    setMoreBusy(true); setMoreError('');
    try {
      const params = parameters(); params.set('cursor', cursor);
      const response = await fetch(`/api/explorer?${params}`, {cache: 'no-store'});
      if (!response.ok) throw new Error();
      const value = await response.json() as {videos: PublicVideo[]; nextCursor: string | null};
      if (version !== requestVersion.current) return;
      setVideos(old => [...old, ...value.videos.filter(video => !old.some(item => item.id === video.id))]);
      setCursor(value.nextCursor);
    } catch {if (version === requestVersion.current) setMoreError('Impossible de charger les vidéos suivantes.');}
    finally {setMoreBusy(false);}
  }

  const normalized = plain(search);
  const matchingDemos = demos.filter(demo => (category === 'all' ||
    category === 'exceptional' && demo.exceptional || category === demo.category) &&
    (!normalized || plain(`${demo.title} ${demo.agency} ${demo.locality}`).includes(normalized)));
  if (sort === 'oldest') matchingDemos.reverse();
  const showDemos = !loading && matchingDemos.length > 0;

  return <section className="public-explore" aria-labelledby="public-explore-title">
    <div className="public-explore-heading"><div><h1 id="public-explore-title">Explorer</h1><p>Les vidéos de la communauté, pour vous inspirer.</p></div>
      <Link href="/" className="public-explore-create">Créer ma vidéo <HomeIcon name="arrow" size={20}/></Link></div>
    <div className="public-explore-toolbar"><label className="public-explore-search"><HomeIcon name="search" size={24}/>
      <span className="sr-only">Rechercher une ville ou un bien</span><input value={query} onChange={event => setQuery(event.target.value)} maxLength={80} placeholder="Rechercher une ville ou un bien…"/></label>
      <label className="public-explore-sort"><span className="sr-only">Trier les vidéos</span><select value={sort} onChange={event => setSort(event.target.value as Sort)}><option value="newest">Les plus récentes</option><option value="oldest">Les plus anciennes</option></select><HomeIcon name="chevron" size={17}/></label></div>
    <div className="public-explore-filters" role="group" aria-label="Filtrer les vidéos">{categories.map(item =>
      <button key={item.value} type="button" aria-pressed={category === item.value} onClick={() => setCategory(item.value)}>{item.label}</button>)}</div>

    {loading && <p className="public-explore-state" role="status">Chargement des vidéos…</p>}
    {error && <p className="public-explore-state" role="alert">{error} <button type="button" onClick={() => setRevision(value => value + 1)}>Réessayer</button></p>}
    {!loading && !error && videos.length > 0 && <div className="public-explore-grid">{videos.map(video => <PublicCard key={video.id} video={video}/>)}</div>}
    {cursor && <button className="public-explore-more" type="button" disabled={moreBusy} onClick={() => void loadMore()}>{moreBusy ? 'Chargement…' : 'Voir plus de vidéos'}</button>}
    {moreError && <p className="public-explore-state" role="alert">{moreError} <button type="button" onClick={() => void loadMore()}>Réessayer</button></p>}
    {showDemos && <div className={videos.length ? 'public-explore-demos public-explore-demos-after' : 'public-explore-demos'}>
      <p className="public-explore-demo-note">{videos.length ? 'Inspirations de démonstration' : 'En attendant les premiers partages : des démonstrations'} · Images et agences fictives, animations sans voix.</p>
      <div className="public-explore-grid">{matchingDemos.map(demo => <DemoCard key={demo.id} demo={demo} onPlay={setSelected}/>)}</div>
    </div>}
    {!loading && !error && videos.length === 0 && matchingDemos.length === 0 && <div className="public-explore-empty"><h2>Aucun résultat pour cette recherche.</h2><p>Essayez une autre ville ou un autre type de bien.</p><button type="button" onClick={() => {setQuery(''); setCategory('all');}}>Effacer les filtres</button></div>}
    {selected && <dialog ref={dialog} className="public-explore-dialog" onCancel={() => setSelected(null)} onClick={event => {if (event.target === event.currentTarget) setSelected(null);}} aria-label={`Démonstration : ${selected.title}`}>
      <button type="button" className="public-explore-dialog-close" onClick={() => setSelected(null)} aria-label="Fermer">×</button><h2>{selected.title}</h2>
      <video src={`/videos/studio-home/${selected.id}.mp4`} poster={`/images/studio-home/${selected.id}.webp`} controls autoPlay playsInline preload="metadata" aria-label={`Démonstration : ${selected.title}`}/>
      <p>Animation sans voix · Images et agence fictives. Les vidéos publiées par les agences utilisent leurs propres photos.</p>
    </dialog>}
  </section>;
}
