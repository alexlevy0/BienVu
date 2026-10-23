'use client';
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type Ref,
} from 'react';
import type { HomepageConfig, HomepageSlot } from '@bienvu/contracts';
import {
  resolveHomeMedia,
  imageWidthUrl,
  homeImageSrcSet,
  previewVideoUrl,
  type HomeMediaView,
} from '../lib/home-media-view';
export type { HomeMediaView } from '../lib/home-media-view';

const Context = createContext<HomepageConfig>({ version: 0, slots: {} });
const HeroPosterContext = createContext<string | null>(null);
export function HomepageMediaProvider({
  config,
  children,
  heroPoster = null,
}: {
  config: HomepageConfig;
  children: ReactNode;
  heroPoster?: string | null;
}) {
  return (
    <Context.Provider value={config}>
      <HeroPosterContext.Provider value={heroPoster}>{children}</HeroPosterContext.Provider>
    </Context.Provider>
  );
}
export function useHomepageHeroPoster() {
  return useContext(HeroPosterContext);
}
export function useHomepageConfig() {
  return useContext(Context);
}
export function useHomepageMedia(id: HomepageSlot): HomeMediaView {
  return resolveHomeMedia(useContext(Context), id);
}
// Static areas use the poster of a selected video. In the editor demonstration,
// the same component follows the selected clip and its timeline playhead.
export function HomeVisual({
  media,
  alt = '',
  className,
  style,
  loading = 'lazy',
  fetchPriority,
  time,
  playing = false,
  sizes = '(max-width: 760px) 90vw, (max-width: 1100px) 45vw, 33vw',
  imageRef,
}: {
  media: HomeMediaView;
  alt?: string;
  className?: string;
  style?: CSSProperties;
  loading?: 'eager' | 'lazy';
  fetchPriority?: 'high' | 'low' | 'auto';
  time?: number;
  playing?: boolean;
  sizes?: string;
  imageRef?: Ref<HTMLImageElement>;
}) {
  const ref = useRef<HTMLVideoElement>(null),
    moving = media.kind === 'video' && (!media.poster || playing || (time !== undefined && time > 0));
  const [near, setNear] = useState(loading === 'eager'),
    sourceReady = near || playing || (time ?? 0) > 0;
  useEffect(() => {
    if (!moving || near) return;
    if (typeof IntersectionObserver === 'undefined') {
      setNear(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setNear(true);
          observer.disconnect();
        }
      },
      { rootMargin: '200px' },
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, [moving, near]);
  useEffect(() => {
    const player = ref.current;
    if (!player || !moving || !sourceReady) return;
    const sync = () => {
      if (time !== undefined && Number.isFinite(player.duration) && player.duration > 0) {
        const target = time % player.duration;
        if (Math.abs(player.currentTime - target) > 0.2) player.currentTime = target;
      }
      if (playing) {
        void player.play().catch(() => {});
      } else player.pause();
    };
    sync();
    player.addEventListener('loadedmetadata', sync);
    return () => player.removeEventListener('loadedmetadata', sync);
  }, [moving, sourceReady, media.src, time, playing]);
  useEffect(() => () => ref.current?.pause(), []);
  if (moving)
    return (
      <video
        ref={ref}
        src={sourceReady ? previewVideoUrl(media.src) : undefined}
        poster={media.poster ? imageWidthUrl(media.poster, 640) : undefined}
        className={className}
        style={style}
        width="768"
        height="1024"
        muted
        playsInline
        loop={playing}
        preload={sourceReady ? 'metadata' : 'none'}
        aria-label={alt || undefined}
      />
    );
  const src = media.kind === 'video' ? media.poster! : media.src;
  return (
    <img
      ref={imageRef}
      src={imageWidthUrl(src, 640)}
      srcSet={homeImageSrcSet(src)}
      sizes={sizes}
      className={className}
      style={style}
      width={media.width ?? 768}
      height={media.height ?? 1024}
      alt={alt}
      loading={loading}
      fetchPriority={fetchPriority}
      decoding="async"
    />
  );
}

export function homeClock(seconds: number) {
  const time = Math.max(0, Math.round(seconds));
  return `${Math.floor(time / 60)}:${String(time % 60).padStart(2, '0')}`;
}
