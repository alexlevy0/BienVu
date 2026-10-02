import type {ReactNode} from 'react';

const shapes = {
  play: <path d="m8 5 11 7-11 7V5Z"/>,
  stop: <rect x="6" y="6" width="12" height="12" rx="1"/>,
  settings: <><path d="M3 6h5m4 0h9M3 12h10m4 0h4M3 18h3m4 0h11"/><circle cx="10" cy="6" r="2"/><circle cx="15" cy="12" r="2"/><circle cx="8" cy="18" r="2"/></>,
  image: <><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8" cy="8" r="1"/><path d="m3 17 6-6 4 4 3-3 5 5"/></>,
  palette: <><path d="M12 2a10 10 0 1 0 0 20c2 0 3-1 2-3s0-3 2-3h2c6 0 3-14-6-14Z"/><circle cx="7" cy="9" r=".7"/><circle cx="12" cy="6" r=".7"/><circle cx="17" cy="9" r=".7"/></>,
  plus: <path d="M12 3v18M3 12h18"/>,
  video: <><rect x="2.5" y="4" width="19" height="16" rx="1.5"/><path d="m10 9 5 3-5 3V9Z"/></>,
  compass: <><circle cx="12" cy="12" r="10"/><path d="m16.5 7.5-3 6-6 3 3-6 6-3Z"/></>,
  house: <><path d="m2.5 10 9.5-8 9.5 8v12h-19V10Z"/><path d="M9 22v-8h6v8"/></>,
  building: <><path d="M3 22V8h8v14M11 22V2h10v20M2 22h20M6 11h2m-2 4h2m-2 4h2m7-13h2m-2 4h2m-2 4h2m-2 4h2"/></>,
  pencil: <><path d="m3 21 4.5-1 12-12a2.5 2.5 0 0 0-3.5-3.5l-12 12L3 21Zm11-15 4 4"/></>,
  document: <><path d="M13 2H5a1 1 0 0 0-1 1v18a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1V9l-7-7Z"/><path d="M13 2v7h7"/></>,
  microphone: <><rect x="9" y="2" width="6" height="13" rx="3"/><path d="M5 10v2a7 7 0 0 0 14 0v-2m-7 9v3m-4 0h8"/></>,
  subtitles: <><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M6 11h4m4 0h4M6 15h7m3 0h2"/></>,
  phone: <><rect x="6" y="1.5" width="12" height="21" rx="2"/><path d="M10 4h4m-3 16h2"/></>,
  landscape: <><rect x="1.5" y="5" width="21" height="14" rx="2"/><path d="M4 10v4"/></>,
  arrow: <path d="M4 12h16m-6-6 6 6-6 6"/>,
  refresh: <><path d="M20 7v5h-5M4 17v-5h5"/><path d="M6 7a7 7 0 0 1 12-1l2 6M4 12l2 6a7 7 0 0 0 12-1"/></>,
  external: <path d="M6 18 18 6M6 6h12v12"/>,
  chevron: <path d="m6 9 6 6 6-6"/>,
  close: <path d="m5 5 14 14M5 19 19 5"/>,
  menu: <path d="M3 5h18M3 12h18M3 19h18"/>,
  more: <><circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/></>,
  trash: <><path d="M3 6h18M9 6V3h6v3M5 6l1 16h12l1-16M10 10v8m4-8v8"/></>,
  user: <><circle cx="12" cy="8" r="4"/><path d="M4 22v-2a8 8 0 0 1 16 0v2"/></>,
  link: <><path d="m9 15 6-6m-5-3 1-1a5 5 0 0 1 7 7l-3 3a5 5 0 0 1-7 0m6 3-1 1a5 5 0 0 1-7-7l3-3a5 5 0 0 1 7 0"/></>,
  search: <><circle cx="10.5" cy="10.5" r="7.5"/><path d="m16 16 5 5"/></>,
  download: <><path d="M12 2v14m-5-5 5 5 5-5M3 18v4h18v-4"/></>,
  upload: <><path d="M12 17V3m-5 5 5-5 5 5M3 17v4h18v-4"/></>,
  eye: <><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></>,
  lock: <><rect x="5" y="10" width="14" height="12" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></>,
  globe: <><circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2c-3 3-4 6-4 10s1 7 4 10m0-20c3 3 4 6 4 10s-1 7-4 10"/></>,
} satisfies Record<string, ReactNode>;

export function HomeIcon({name, size = 24}: {name: keyof typeof shapes; size?: number}) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{shapes[name]}</svg>;
}

export function HomeWordmark() {
  return <span className="home-wordmark"><svg viewBox="0 0 40 40" fill="none" aria-hidden="true"><path d="M14 3H3v11M26 3h11v11M3 26v11h11m12 0h11V26" stroke="currentColor" strokeWidth="3.5"/></svg><span>bienvu</span></span>;
}

export function AgencySeal({kind}: {kind: 'paris' | 'sud' | 'lyon' | 'bordeaux'}) {
  return <span className="home-agency-seal" aria-hidden="true"><svg viewBox="0 0 38 38" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round">
    {kind === 'paris' && <><path d="M10 10c12-7 21 5 16 15S6 27 9 16c2-7 9-8 13-3l6 13M11 28l14-19M13 10l10 17M11 22l8-7"/><circle cx="19" cy="19" r="12"/></>}
    {kind === 'sud' && <><path d="M7 24h24M10 20h18M14 19a5 5 0 0 1 10 0M19 7v4m-9 0 3 3m15-3-3 3M8 17h3m16 0h3M12 27h14"/></>}
    {kind === 'lyon' && <><path d="m9 29 10-23 10 23M13 21h13m-7-15 2 7"/></>}
    {kind === 'bordeaux' && <>{[0,45,90,135].map(angle => <ellipse key={angle} cx="19" cy="19" rx="5" ry="13" transform={`rotate(${angle} 19 19)`}/>)}</>}
  </svg></span>;
}
