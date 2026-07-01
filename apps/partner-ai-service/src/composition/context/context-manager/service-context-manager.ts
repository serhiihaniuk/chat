import { type ContextManagerPort } from "@side-chat/partner-ai-core";
import { Effect } from "effect";
import {
  admitContextCandidates,
  admitConversationHistory,
  gatherContextSources,
  renderPreparedTurnContext,
  resolveContextProfile,
} from "./context-preparation-lifecycle.js";
import type { ServiceContextManagerOptions } from "./service-context-manager-types.js";

export type { ServiceContextManagerOptions } from "./service-context-manager-types.js";

/**
 * Build the context manager used before each runtime turn.
 *
 * Authorized context from history, host, and tools becomes a prepared context
 * board and runtime chat messages. Runtime streaming has not started here, so
 * lookup, admission, and rendering failures stay pre-start failures instead of
 * partial assistant responses.
 *
 * The body reads as an ordered narrative; each step lives in
 * `context-preparation-lifecycle.ts`.
 */
export const createServiceContextManager = (
  options: ServiceContextManagerOptions,
): ContextManagerPort => ({
  prepareTurnContext: (input) =>
    Effect.gen(function* () {
      // Resolve the profile core already admitted for this turn.
      const profile = yield* resolveContextProfile(input);

      // Read every policy-allowed source before anything becomes model-visible.
      const sources = yield* gatherContextSources(options, input);

      // Score host/tool/message candidates and enforce the admission budget.
      const admitted = yield* admitContextCandidates(options, input);

      // Select the prior messages allowed to become runtime chat messages.
      const history = yield* admitConversationHistory(options, input, sources);

      // Assemble the core-owned prepared context contract from the admitted parts.
      return renderPreparedTurnContext(input, { profile, admitted, history });
    }),
});
