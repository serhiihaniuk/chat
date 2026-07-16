import { sleep } from "workflow";

/** Workflow-safe time seam shared by durable waits and deterministic tests. */
export interface WorkflowClock {
  now(): number;
  wait(milliseconds: number): Promise<void>;
}

export const WORKFLOW_CLOCK: WorkflowClock = {
  now: Date.now,
  wait: (milliseconds) => sleep(`${milliseconds}ms`),
};
