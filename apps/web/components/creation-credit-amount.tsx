'use client';
import { useRef } from 'react';
import { useReducedMotion } from 'motion/react';
import { AnimatePresence, m, useCreationMotionReady } from './creation-motion';

/** Swap exact amounts; never display intermediate, unbillable credit totals. */
export function CreationCreditAmount({ value }: { value: number }) {
  const ready = useCreationMotionReady(),
    reduced = useReducedMotion(),
    previous = useRef({ value, direction: 1 });
  if (previous.current.value !== value)
    previous.current = { value, direction: value > previous.current.value ? 1 : -1 };
  const { direction } = previous.current;
  const text = `${value} crédit${value > 1 ? 's' : ''}`;
  return (
    <span className="creation-credit-amount">
      <span className="sr-only">{text}</span>
      <span className="creation-credit-window" aria-hidden="true">
        <AnimatePresence initial={false} custom={direction} mode="popLayout">
          <m.span
            key={value}
            custom={direction}
            initial={ready && !reduced ? { opacity: 0, y: direction * 7 } : false}
            animate={{ opacity: 1, y: 0 }}
            exit="out"
            variants={{ out: (sign: number) => ({ opacity: 0, y: reduced ? 0 : -sign * 7 }) }}
            transition={{ duration: reduced ? 0 : 0.18, ease: 'easeOut' }}
          >
            {text}
          </m.span>
        </AnimatePresence>
      </span>
    </span>
  );
}
