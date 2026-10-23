import { useEffect, type RefObject } from 'react';

const axes = ['x', 'y', 'light'] as const;
const properties = [
  '--avatar-rotate-x',
  '--avatar-rotate-y',
  '--avatar-shift-x',
  '--avatar-shift-y',
  '--avatar-scale',
  '--avatar-light',
  '--avatar-glare-x',
  '--avatar-glare-y',
  '--avatar-foil-x',
  '--avatar-foil-y',
];
const clamp = (value: number) => Math.max(-1, Math.min(1, value));
type Position = Record<(typeof axes)[number], number>;
type Card = { node: HTMLElement; bounds: DOMRect; position: Position; velocity: Position; target: Position };

/** One on-demand animation loop for both cards; pointer movement never renders React. */
export function useAvatarCardMotion(stage: RefObject<HTMLDivElement | null>, paused: boolean, revision: string) {
  useEffect(() => {
    const root = stage.current;
    if (!root || paused) return;
    const mouse = matchMedia('(hover: hover) and (pointer: fine) and (min-width: 768px)');
    const reduced = matchMedia('(prefers-reduced-motion: reduce)');
    let cards: Card[] = [],
      frame: number | null = null,
      last = 0,
      visible = true,
      pressed = false,
      keyboard = false;
    let pointer: { x: number; y: number } | null = null,
      dirty = true;
    const eligible = () => mouse.matches && !reduced.matches && visible && !document.hidden && !keyboard;
    const stop = () => {
      if (frame !== null) cancelAnimationFrame(frame);
      frame = null;
      last = 0;
    };
    const reset = () => {
      stop();
      pointer = null;
      pressed = false;
      dirty = true;
      for (const card of cards) {
        for (const name of properties) card.node.style.removeProperty(name);
        delete card.node.dataset.tiltMoving;
      }
      cards = [];
    };
    const measure = () => {
      // Anchors stay still while their inner cards tilt, avoiding cursor feedback.
      cards = [...root.querySelectorAll<HTMLElement>('.home-avatar-tilt-anchor')].map((anchor) => {
        const node = anchor.querySelector<HTMLElement>('.home-avatar-backlight-frame')!;
        const previous = cards.find((card) => card.node === node);
        return {
          node,
          bounds: anchor.getBoundingClientRect(),
          position: previous?.position ?? { x: 0, y: 0, light: 0 },
          velocity: previous?.velocity ?? { x: 0, y: 0, light: 0 },
          target: { x: 0, y: 0, light: 0 },
        };
      });
      dirty = false;
    };
    const paint = (card: Card) => {
      const { x, y } = card.position,
        light = Math.max(0, Math.min(1, card.position.light));
      const values = [
        `${(-y * 5).toFixed(3)}deg`,
        `${(x * 6).toFixed(3)}deg`,
        `${(x * 3).toFixed(3)}px`,
        `${(y * 2 - light * 4).toFixed(3)}px`,
        (1 + light * 0.012).toFixed(4),
        light.toFixed(4),
        `${(50 + x * 42).toFixed(2)}%`,
        `${(50 + y * 42).toFixed(2)}%`,
        `${(50 - x * 32).toFixed(2)}%`,
        `${(50 - y * 32).toFixed(2)}%`,
      ];
      properties.forEach((name, index) => {
        card.node.style.setProperty(name, values[index]);
      });
    };
    const tick = (now: number) => {
      frame = null;
      if (!eligible()) {
        reset();
        return;
      }
      if (pressed) return;
      const dt = last ? Math.min((now - last) / 1000, 1 / 30) : 1 / 60;
      last = now;
      let moving = false;
      for (const card of cards) {
        for (const axis of axes) {
          const delta = card.target[axis] - card.position[axis];
          card.velocity[axis] += (180 * delta - 22 * card.velocity[axis]) * dt;
          card.position[axis] += card.velocity[axis] * dt;
          if (Math.abs(delta) > 0.0006 || Math.abs(card.velocity[axis]) > 0.003) moving = true;
        }
        paint(card);
      }
      if (moving) frame = requestAnimationFrame(tick);
      else {
        last = 0;
        for (const card of cards) {
          card.position = { ...card.target };
          card.velocity = { x: 0, y: 0, light: 0 };
          paint(card);
          delete card.node.dataset.tiltMoving;
        }
        if (!pointer) reset();
      }
    };
    const wake = () => {
      if (!eligible() || pressed || frame !== null) return;
      for (const card of cards) card.node.dataset.tiltMoving = 'true';
      frame = requestAnimationFrame(tick);
    };
    const move = (event: PointerEvent) => {
      if (event.pointerType !== 'mouse' || !eligible() || pressed) return;
      pointer = { x: event.clientX, y: event.clientY };
      if (dirty) measure();
      for (const card of cards) {
        const box = card.bounds;
        if (!box.width || !box.height) continue;
        const x = clamp(((pointer.x - box.left) / box.width) * 2 - 1),
          y = clamp(((pointer.y - box.top) / box.height) * 2 - 1);
        const inside =
          pointer.x >= box.left && pointer.x <= box.right && pointer.y >= box.top && pointer.y <= box.bottom;
        const strength = inside ? 1 : 0.3;
        card.target = { x: x * strength, y: y * strength, light: inside ? 0.85 : 0.22 };
      }
      wake();
    };
    const leave = () => {
      pointer = null;
      for (const card of cards) card.target = { x: 0, y: 0, light: 0 };
      wake();
    };
    const press = (event: PointerEvent) => {
      if (event.pointerType === 'mouse') {
        pressed = true;
        stop();
      }
    };
    const release = () => {
      if (pressed) {
        pressed = false;
        wake();
      }
    };
    const focus = (event: FocusEvent) => {
      keyboard = event.target instanceof Element && event.target.matches(':focus-visible');
      if (keyboard) reset();
    };
    const blur = () => {
      keyboard = false;
    };
    const observer = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      if (!visible) reset();
    });
    observer.observe(root);
    const resize = new ResizeObserver(() => {
      dirty = true;
    });
    resize.observe(root);
    root.addEventListener('pointermove', move, { passive: true });
    root.addEventListener('pointerleave', leave);
    root.addEventListener('pointerdown', press);
    root.addEventListener('focusin', focus);
    root.addEventListener('focusout', blur);
    window.addEventListener('pointerup', release);
    window.addEventListener('pointercancel', reset);
    window.addEventListener('blur', reset);
    window.addEventListener('scroll', reset, { passive: true, capture: true });
    window.addEventListener('resize', reset, { passive: true });
    document.addEventListener('visibilitychange', reset);
    mouse.addEventListener('change', reset);
    reduced.addEventListener('change', reset);
    return () => {
      reset();
      observer.disconnect();
      resize.disconnect();
      root.removeEventListener('pointermove', move);
      root.removeEventListener('pointerleave', leave);
      root.removeEventListener('pointerdown', press);
      root.removeEventListener('focusin', focus);
      root.removeEventListener('focusout', blur);
      window.removeEventListener('pointerup', release);
      window.removeEventListener('pointercancel', reset);
      window.removeEventListener('blur', reset);
      window.removeEventListener('scroll', reset, true);
      window.removeEventListener('resize', reset);
      document.removeEventListener('visibilitychange', reset);
      mouse.removeEventListener('change', reset);
      reduced.removeEventListener('change', reset);
    };
  }, [stage, paused, revision]);
}
