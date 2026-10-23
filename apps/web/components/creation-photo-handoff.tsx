'use client';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { useReducedMotion } from 'motion/react';
import { m, useCreationMotionReady } from './creation-motion';

type Bounds = { x: number; y: number; width: number; height: number };
type Flight = { id: number; slot: number; src: string; from: Bounds; to?: Bounds };
type Handoff = {
  flight: Flight | null;
  capture(): void;
  cancel(): void;
  source(node: HTMLDivElement | null, slot: number): void;
  destination(node: HTMLDivElement, slot: number): () => void;
};
const idle: Handoff = {
  flight: null,
  capture() {},
  cancel() {},
  source() {},
  destination() {
    return () => {};
  },
};
const context = createContext<Handoff>(idle);
const bounds = (node: HTMLElement): Bounds => {
  const r = node.getBoundingClientRect();
  return { x: r.x, y: r.y, width: r.width, height: r.height };
};
const visible = (r: Bounds) =>
  r.width > 0 &&
  r.height > 0 &&
  r.x + r.width > 0 &&
  r.y + r.height > 0 &&
  r.x < window.innerWidth &&
  r.y < window.innerHeight;

/** Bridge async draft preparation, without keeping an obsolete form mounted. */
export function CreationPhotoHandoff({ children }: { children: ReactNode }) {
  const ready = useCreationMotionReady(),
    reduced = useReducedMotion(),
    origin = useRef<{ node: HTMLDivElement; slot: number } | null>(null),
    sequence = useRef(0);
  const [flight, setFlight] = useState<Flight | null>(null),
    current = useRef(flight);
  current.current = flight;
  const cancel = useCallback(() => setFlight(null), []);
  const source = useCallback((node: HTMLDivElement | null, slot: number) => {
    origin.current = node ? { node, slot } : null;
  }, []);
  const capture = useCallback(() => {
    const entry = origin.current,
      image = entry?.node.querySelector('img');
    if (!ready || reduced || !entry || !image?.complete || !image.naturalWidth) return;
    const from = bounds(entry.node);
    if (!visible(from)) return;
    setFlight({ id: ++sequence.current, slot: entry.slot, src: image.currentSrc || image.src, from });
  }, [ready, reduced]);
  const destination = useCallback(
    (node: HTMLDivElement, slot: number) => {
      const pending = current.current;
      if (!pending || pending.to || pending.slot !== slot) return () => {};
      let first = 0,
        second = 0,
        disposed = false;
      const image = node.querySelector('img');
      const measure = () => {
        if (disposed || current.current?.id !== pending.id) return;
        const to = bounds(node);
        if (!visible(to)) {
          cancel();
          return;
        }
        if (image && (!image.complete || !image.naturalWidth)) return;
        setFlight((value) => (value?.id === pending.id ? { ...value, to } : value));
      };
      // Let the conversation layout and the gallery's intrinsic aspect ratio settle.
      const schedule = () => {
        cancelAnimationFrame(first);
        cancelAnimationFrame(second);
        first = requestAnimationFrame(() => {
          second = requestAnimationFrame(measure);
        });
      };
      schedule();
      image?.addEventListener('load', schedule);
      image?.addEventListener('error', cancel);
      return () => {
        disposed = true;
        cancelAnimationFrame(first);
        cancelAnimationFrame(second);
        image?.removeEventListener('load', schedule);
        image?.removeEventListener('error', cancel);
      };
    },
    [cancel],
  );
  useEffect(() => {
    if (!current.current) return;
    const timer = setTimeout(cancel, 1800);
    const scroll = () => {
      if (current.current?.to) cancel();
    };
    window.addEventListener('resize', cancel);
    window.addEventListener('scroll', scroll, { passive: true });
    return () => {
      clearTimeout(timer);
      window.removeEventListener('resize', cancel);
      window.removeEventListener('scroll', scroll);
    };
  }, [flight?.id, cancel]);
  useEffect(() => {
    if (reduced) cancel();
  }, [reduced, cancel]);
  const to = flight?.to;
  return (
    <context.Provider value={{ flight, capture, cancel, source, destination }}>
      {children}
      {flight &&
        createPortal(
          <m.div
            className="creation-photo-flight"
            key={flight.id}
            aria-hidden="true"
            initial={false}
            style={{ position: 'fixed', left: 0, top: 0, borderRadius: 8 }}
            animate={{ ...(to ?? flight.from), boxShadow: to ? '0 0 0 0 #243c2200' : '0 8px 25px #243c2220' }}
            transition={{ duration: to ? 0.48 : 0, ease: [0.22, 0.68, 0.3, 1] }}
            onAnimationComplete={() => {
              if (to) cancel();
            }}
          >
            <img src={flight.src} alt="" />
          </m.div>,
          document.body,
        )}
    </context.Provider>
  );
}

export function useCreationPhotoHandoff() {
  return useContext(context);
}
export function CreationPhotoSource({ slot, children }: { slot: number; children: ReactNode }) {
  const { source } = useCreationPhotoHandoff(),
    ref = useCallback((node: HTMLDivElement | null) => source(node, slot), [source, slot]);
  return (
    <div ref={ref} className="home-import-cover">
      {children}
    </div>
  );
}
export function CreationPhotoDestination({ slot, children }: { slot: number; children: ReactNode }) {
  const { flight, destination } = useCreationPhotoHandoff(),
    ref = useRef<HTMLDivElement>(null),
    active = flight?.slot === slot;
  useLayoutEffect(() => {
    if (active && ref.current) return destination(ref.current, slot);
  }, [active, flight?.id, destination, slot]);
  return (
    <div
      ref={ref}
      className="customizer-photo-visual"
      data-photo-handoff={active || undefined}
      style={{ opacity: active ? 0 : 1 }}
    >
      {children}
    </div>
  );
}
