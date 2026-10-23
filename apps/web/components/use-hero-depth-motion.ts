'use client';
import { useEffect, type RefObject } from 'react';
import { useMotionValue, useSpring, useTransform } from 'motion/react';
import { heroParallaxTarget } from '../lib/hero-parallax';

export function useHeroDepthMotion(root: RefObject<HTMLDivElement | null>, paused: boolean, fullscreen: boolean) {
  const targetX = useMotionValue(0),
    targetY = useMotionValue(0),
    x = useSpring(targetX, { stiffness: 145, damping: 22, mass: 0.75 }),
    y = useSpring(targetY, { stiffness: 145, damping: 22, mass: 0.75 });
  const rotateX = useTransform(y, [-1, 1], [3, -3]),
    rotateY = useTransform(x, [-1, 1], [-4.5, 4.5]);
  const backgroundX = useTransform(x, [-1, 1], [-8, 8]),
    backgroundY = useTransform(y, [-1, 1], [-7, 7]);
  const foregroundX = useTransform(x, [-1, 1], [9, -9]),
    foregroundY = useTransform(y, [-1, 1], [7, -7]);
  const avatarX = useTransform(x, [-1, 1], [-22, 22]),
    avatarY = useTransform(y, [-1, 1], [-14, 14]);
  const badgeX = useTransform(x, [-1, 1], [-16, 16]),
    badgeY = useTransform(y, [-1, 1], [-10, 10]),
    badgeRotate = useTransform(x, [-1, 1], [-1.2, 1.2]);
  useEffect(() => {
    const anchor = root.current;
    if (!anchor) return;
    const desktop = matchMedia('(min-width:761px) and (hover:hover) and (pointer:fine)'),
      reduced = matchMedia('(prefers-reduced-motion:reduce)');
    let visible = false,
      pressed = false,
      dirty = true,
      bounds: DOMRect | undefined;
    const reset = () => {
      targetX.set(0);
      targetY.set(0);
      dirty = true;
    };
    const eligible = () =>
      desktop.matches && !reduced.matches && visible && !document.hidden && !paused && !fullscreen && !pressed;
    const move = (event: PointerEvent) => {
      if (event.pointerType !== 'mouse' || !eligible()) return;
      if (event.target instanceof Element && event.target.closest('.home-hero-depth-controls')) {
        reset();
        return;
      }
      if (dirty || !bounds) {
        bounds = anchor.getBoundingClientRect();
        dirty = false;
      }
      const point = heroParallaxTarget(event.clientX, event.clientY, bounds);
      targetX.set(point.x);
      targetY.set(point.y);
    };
    const press = () => {
        pressed = true;
        reset();
      },
      release = () => {
        pressed = false;
      };
    const observer = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      if (!visible) reset();
    });
    observer.observe(anchor);
    window.addEventListener('pointermove', move, { passive: true });
    window.addEventListener('pointerdown', press, { passive: true });
    window.addEventListener('pointerup', release, { passive: true });
    window.addEventListener('pointercancel', release);
    window.addEventListener('blur', reset);
    window.addEventListener('resize', reset, { passive: true });
    window.addEventListener('scroll', reset, { passive: true, capture: true });
    document.addEventListener('visibilitychange', reset);
    document.documentElement.addEventListener('pointerleave', reset);
    desktop.addEventListener('change', reset);
    reduced.addEventListener('change', reset);
    reset();
    return () => {
      observer.disconnect();
      reset();
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerdown', press);
      window.removeEventListener('pointerup', release);
      window.removeEventListener('pointercancel', release);
      window.removeEventListener('blur', reset);
      window.removeEventListener('resize', reset);
      window.removeEventListener('scroll', reset, true);
      document.removeEventListener('visibilitychange', reset);
      document.documentElement.removeEventListener('pointerleave', reset);
      desktop.removeEventListener('change', reset);
      reduced.removeEventListener('change', reset);
    };
  }, [root, targetX, targetY, paused, fullscreen]);
  return {
    stage: { rotateX, rotateY },
    background: { x: backgroundX, y: backgroundY, scale: 1.075 },
    foreground: { x: foregroundX, y: foregroundY },
    avatar: { x: avatarX, y: avatarY },
    badge: { x: badgeX, y: badgeY, rotate: badgeRotate },
  };
}
