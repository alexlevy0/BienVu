import type { WorkflowStep, WorkflowStepConfig } from 'cloudflare:workers';
import type { AnimationAttempt, AnimationResult } from './photo-animations';

type AnimationSteps = Pick<WorkflowStep, 'sleep'> & {
  do(name: string, config: WorkflowStepConfig, perform: () => Promise<AnimationResult>): Promise<AnimationResult>;
};

// Each photo has its own durable steps, rather than sharing a ten-minute
// deadline across twelve paid tasks. The SDK still owns polling within a step.
// Follow-ups only read the persisted task; they never resubmit a generation.
export async function animateWorkflowPhotos(
  step: AnimationSteps,
  requested: number,
  perform: (attempt: AnimationAttempt) => Promise<AnimationResult>,
) {
  for (let slot = 0; slot < requested; slot++) {
    for (let round = 0; round < 4; round++) {
      const result = await step.do(
        `animate-photo-${slot}-${round}`,
        { retries: { limit: 0, delay: '1 second' }, timeout: '3 minutes' },
        () => perform({ slot, finalAttempt: round === 3 }),
      );
      if (result.stop) return;
      if (!result.pending) break;
      await step.sleep(`animate-photo-wait-${slot}-${round}`, `${result.waitSeconds ?? 10} seconds`);
    }
  }
}
