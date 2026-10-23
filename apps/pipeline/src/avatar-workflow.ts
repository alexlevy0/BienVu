import type { WorkflowStep, WorkflowStepConfig } from 'cloudflare:workers';

const waitMilliseconds = 30 * 60_000,
  pollMilliseconds = 30_000;
type Checkpoint = { deadline: number; checkedAt: number; done: boolean };
type AvatarSteps = Pick<WorkflowStep, 'sleepUntil'> & {
  do(name: string, config: WorkflowStepConfig, perform: () => Promise<Checkpoint>): Promise<Checkpoint>;
};
const checkConfig: WorkflowStepConfig = { retries: { limit: 1, delay: '2 seconds' }, timeout: '2 minutes' };

// Persist the deadline once: hibernation/replay must not grant another thirty
// minutes. Checks and sleeps remain separate durable steps, with no renderer
// running while HeyGen prepares the existing tasks.
export async function waitForWorkflowAvatars(
  step: AvatarSteps,
  generationDeadline: () => Promise<string>,
  check: (maySubmit: boolean) => Promise<boolean>,
) {
  const policy = await step.do('avatar-wait-deadline', checkConfig, async () => {
    const deadline = Date.parse(await generationDeadline()),
      now = Date.now();
    return { deadline: Math.min(deadline, now + waitMilliseconds), checkedAt: now, done: false };
  });
  // The time limit is authoritative; this cap also bounds durable step count.
  // Keep these results separate from the old avatar-status checkpoints.
  for (let poll = 0; poll <= Math.ceil(waitMilliseconds / pollMilliseconds); poll++) {
    const state = await step.do(`avatar-wait-status-${poll}`, checkConfig, async () => {
      const done = await check(Date.now() < policy.deadline);
      return { deadline: policy.deadline, checkedAt: Date.now(), done };
    });
    if (state.done) return true;
    if (state.checkedAt >= state.deadline) return false;
    await step.sleepUntil(`avatar-wait-until-${poll}`, Math.min(state.deadline, state.checkedAt + pollMilliseconds));
  }
  return false;
}
