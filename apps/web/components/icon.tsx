import type {CSSProperties} from 'react';
export type IconName = 'grid' | 'spark' | 'building' | 'history' | 'card' | 'arrow' | 'link' | 'play' | 'check' | 'lock' | 'film';
const paths: Record<IconName, React.ReactNode> = {
  grid: <><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></>,
  spark: <><path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5L12 3Z"/><path d="m20 2 .5 1.5L22 4l-1.5.5L20 6l-.5-1.5L18 4l1.5-.5L20 2Z"/></>,
  building: <><path d="M4 21V8l8-5 8 5v13H4Z"/><path d="M9 21v-6h6v6M8 9h1m6 0h1m-8 3h1m6 0h1"/></>,
  history: <><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5m4-1v5l3 2"/></>,
  card: <><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 10h18M7 15h3"/></>,
  arrow: <path d="M4 12h15m-6-6 6 6-6 6"/>,
  link: <><path d="m10 14 4-4m-5 7-1 1a4.2 4.2 0 0 1-6-6l4-4a4.2 4.2 0 0 1 6 0m0 8a4.2 4.2 0 0 0 6 0l4-4a4.2 4.2 0 0 0-6-6l-1 1"/></>,
  play: <path d="m9 5 11 7-11 7V5Z"/>,
  check: <path d="m5 12 4 4L19 6"/>,
  lock: <><rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V6a4 4 0 0 1 8 0v4m-4 5v2"/></>,
  film: <><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 3v18M16 3v18M4 8h4m-4 8h4m8-8h4m-4 8h4"/></>,
};
export function Icon({name, size = 20, style}: {name: IconName; size?: number; style?: CSSProperties}) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={style}>{paths[name]}</svg>;
}
