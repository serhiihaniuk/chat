import { resumeHook } from "workflow/api";
import {
  HookNotFoundError,
  RunExpiredError,
  WorkflowRunNotFoundError,
} from "workflow/internal/errors";

import { chatTurnCancellationHookToken } from "../../chat-turn.js";
import { wakeChatTurnProviderStep } from "./chat-turn-abort-stream.js";

const CANCEL_HOOK_RETRY = {
  INTERVAL_MS: 25,
  MAX_ATTEMPTS: 80,
} as const;

type CancelChatTurnDependencies = Readonly<{
  maxAttempts: number;
  resume: (token: string, payload: { reason: string }) => Promise<void>;
  signalInFlightAbort: (runId: string) => Promise<boolean>;
  waitForRetry: () => Promise<void>;
}>;

/**
 * Record the durable user intent before waking the host-native provider signal.
 * This module stays outside the workflow entry so Postgres runtime code cannot
 * leak into the deterministic workflow sandbox bundle.
 */
export async function cancelChatTurn(
  runId: string,
  reason: string,
  dependencies: CancelChatTurnDependencies = defaultCancelDependencies(),
): Promise<boolean> {
  const token = chatTurnCancellationHookToken(runId);
  for (let attempt = 1; attempt <= dependencies.maxAttempts; attempt += 1) {
    try {
      await dependencies.resume(token, { reason });
      await dependencies.signalInFlightAbort(runId);
      return true;
    } catch (error) {
      if (isMissingOrExpiredRun(error)) return false;
      if (!HookNotFoundError.is(error)) throw error;
      if (attempt === dependencies.maxAttempts) return false;
      await dependencies.waitForRetry();
    }
  }
  return false;
}

function defaultCancelDependencies(): CancelChatTurnDependencies {
  return {
    maxAttempts: CANCEL_HOOK_RETRY.MAX_ATTEMPTS,
    resume: async (token, payload) => {
      await resumeHook(token, payload);
    },
    signalInFlightAbort: wakeChatTurnProviderStep,
    waitForRetry: () =>
      new Promise((resolve) => {
        setTimeout(resolve, CANCEL_HOOK_RETRY.INTERVAL_MS);
      }),
  };
}

function isMissingOrExpiredRun(error: unknown): boolean {
  return WorkflowRunNotFoundError.is(error) || RunExpiredError.is(error);
}
