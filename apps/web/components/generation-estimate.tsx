'use client';
import { useEffect, useState } from 'react';
import type { GenerationView } from '@bienvu/contracts';
import {
  recordProgress,
  remainingEstimate,
  remainingEstimateText,
  type ProgressSample,
} from '../lib/generation-estimate';
import './generation-estimate.css';

function Countdown({ percent, updatedAt, unavailable }: { percent: number; updatedAt: string; unavailable: boolean }) {
  const [samples, setSamples] = useState<ProgressSample[]>([]),
    [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const observedAt = Date.now();
    setNow(observedAt);
    setSamples((current) => recordProgress(current, percent, updatedAt, observedAt));
  }, [percent, updatedAt]);
  useEffect(() => {
    const tick = () => {
      if (document.visibilityState === 'visible') setNow(Date.now());
    };
    const timer = window.setInterval(tick, 1000);
    document.addEventListener('visibilitychange', tick);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', tick);
    };
  }, []);
  const text = remainingEstimateText(remainingEstimate(samples, now ?? NaN, unavailable));
  return (
    <span
      className="generation-remaining"
      title="Temps restant estimé jusqu’à la vidéo prête, recalculé selon l’avancement réel."
    >
      {text}
    </span>
  );
}

export function GenerationRenderProgress({
  job,
  unavailable = false,
  className = '',
}: {
  job: GenerationView;
  unavailable?: boolean;
  className?: string;
}) {
  if (job.status !== 'rendering') return null;
  return (
    <span className={`generation-render-progress ${className}`}>
      <strong>{job.progressPercent} %</strong>
      <span aria-hidden="true">·</span>
      <Countdown
        key={`${job.id}:${job.attempt}`}
        percent={job.progressPercent}
        updatedAt={job.updatedAt}
        unavailable={unavailable}
      />
    </span>
  );
}
