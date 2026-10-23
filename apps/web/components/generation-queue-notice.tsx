import type { GenerationView } from '@bienvu/contracts';
import { generationQueueText } from '../lib/generation-steps';
import './generation-queue-notice.css';

export function GenerationQueueNotice({ job }: { job: GenerationView | null }) {
  if (!job?.queue || ['ready', 'failed'].includes(job.status)) return null;
  return (
    <div className="generation-queue-notice" role="status">
      <strong>{generationQueueText(job)}</strong>
      <span>La création reprend automatiquement dès qu’une place se libère. Vous pouvez quitter cette page.</span>
    </div>
  );
}
