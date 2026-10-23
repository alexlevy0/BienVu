'use client';
import { useEffect, useRef, type ButtonHTMLAttributes } from 'react';
import './home-create-button.css';

export function HomeCreateButton({
  children,
  className = '',
  disabled,
  type = 'submit',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  const button = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const node = button.current;
    if (!node || disabled) return;
    const mouse = matchMedia('(hover: hover) and (pointer: fine)'),
      reduced = matchMedia('(prefers-reduced-motion: reduce)');
    let frame: number | null = null,
      last = 0,
      visible = true,
      pressed = false,
      pointer: { x: number; y: number } | null = null;
    const position = { x: 0, y: 0 },
      velocity = { x: 0, y: 0 };
    const paint = () => {
      node.style.setProperty('--home-magnet-x', `${position.x.toFixed(3)}px`);
      node.style.setProperty('--home-magnet-y', `${position.y.toFixed(3)}px`);
    };
    const reset = () => {
      if (frame !== null) cancelAnimationFrame(frame);
      frame = null;
      last = 0;
      pointer = null;
      pressed = false;
      position.x = position.y = velocity.x = velocity.y = 0;
      node.style.removeProperty('--home-magnet-x');
      node.style.removeProperty('--home-magnet-y');
      delete node.dataset.magnetActive;
    };
    const eligible = () =>
      mouse.matches && !reduced.matches && visible && !pressed && !document.hidden && !node.matches(':focus-visible');
    const target = () => {
      if (!pointer) return { x: 0, y: 0 };
      const box = node.getBoundingClientRect();
      if (!box.width || !box.height) return { x: 0, y: 0 };
      const dx = pointer.x - (box.left - position.x + box.width / 2),
        dy = pointer.y - (box.top - position.y + box.height / 2);
      const distance = Math.hypot(
        Math.max(0, Math.abs(dx) - box.width / 2),
        Math.max(0, Math.abs(dy) - box.height / 2),
      );
      const attraction = Math.max(0, 1 - distance / 85),
        clamp = (value: number) => Math.max(-1, Math.min(1, value));
      return { x: clamp(dx / (box.width / 2)) * 6 * attraction, y: clamp(dy / (box.height / 2)) * 4 * attraction };
    };
    const tick = (now: number) => {
      frame = null;
      if (!eligible()) {
        reset();
        return;
      }
      const goal = target(),
        dt = last ? Math.min((now - last) / 1000, 1 / 30) : 1 / 60;
      last = now;
      // A lightly damped spring gives the return a small, natural overshoot.
      for (const axis of ['x', 'y'] as const) {
        velocity[axis] += (180 * (goal[axis] - position[axis]) - 16 * velocity[axis]) * dt;
        position[axis] += velocity[axis] * dt;
      }
      if (Math.hypot(goal.x - position.x, goal.y - position.y) < 0.015 && Math.hypot(velocity.x, velocity.y) < 0.05) {
        position.x = goal.x;
        position.y = goal.y;
        velocity.x = velocity.y = 0;
        last = 0;
        paint();
        delete node.dataset.magnetActive;
        return;
      }
      paint();
      frame = requestAnimationFrame(tick);
    };
    const wake = () => {
      if (eligible() && frame === null) {
        node.dataset.magnetActive = 'true';
        frame = requestAnimationFrame(tick);
      }
    };
    const move = (event: PointerEvent) => {
      if (event.pointerType !== 'mouse' || !eligible()) return;
      pointer = { x: event.clientX, y: event.clientY };
      wake();
    };
    const leave = (event: PointerEvent) => {
      if (event.relatedTarget === null) {
        pointer = null;
        wake();
      }
    };
    const focus = () => {
      if (node.matches(':focus-visible')) reset();
    };
    const press = (event: PointerEvent) => {
      if (event.pointerType !== 'mouse' || event.button !== 0) return;
      // Keep the hit area still until the native click has been dispatched.
      pressed = true;
      pointer = null;
      if (frame !== null) cancelAnimationFrame(frame);
      frame = null;
      last = 0;
      velocity.x = velocity.y = 0;
      delete node.dataset.magnetActive;
    };
    const release = () => {
      if (pressed) {
        pressed = false;
        wake();
      }
    };
    const observer =
      typeof IntersectionObserver === 'undefined'
        ? null
        : new IntersectionObserver((entries) => {
            visible = entries[0]?.isIntersecting ?? false;
            if (!visible) reset();
          });
    observer?.observe(node);
    document.addEventListener('pointermove', move, { passive: true });
    document.addEventListener('pointerout', leave, { passive: true });
    document.addEventListener('visibilitychange', reset);
    window.addEventListener('blur', reset);
    window.addEventListener('scroll', reset, { passive: true, capture: true });
    window.addEventListener('resize', reset, { passive: true });
    node.addEventListener('focus', focus);
    node.addEventListener('pointerdown', press);
    window.addEventListener('pointerup', release);
    window.addEventListener('pointercancel', reset);
    mouse.addEventListener('change', reset);
    reduced.addEventListener('change', reset);
    return () => {
      reset();
      observer?.disconnect();
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerout', leave);
      document.removeEventListener('visibilitychange', reset);
      window.removeEventListener('blur', reset);
      window.removeEventListener('scroll', reset, true);
      window.removeEventListener('resize', reset);
      node.removeEventListener('focus', focus);
      node.removeEventListener('pointerdown', press);
      window.removeEventListener('pointerup', release);
      window.removeEventListener('pointercancel', reset);
      mouse.removeEventListener('change', reset);
      reduced.removeEventListener('change', reset);
    };
  }, [disabled]);
  return (
    <button
      {...props}
      ref={button}
      type={type}
      disabled={disabled}
      className={`home-primary-button home-rainbow-button ${className}`}
    >
      {children}
    </button>
  );
}
