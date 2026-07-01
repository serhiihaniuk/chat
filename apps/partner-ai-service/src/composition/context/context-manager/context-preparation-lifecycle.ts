import {
  admitConversationHistoryContext,
  HISTORY_CONTEXT_MODES,
  PARTNER_AI_CORE_ERROR_CODES,
  PARTNER_AI_CORE_PROTOCOL_ERROR_CODES,
  PartnerAiCoreError,
  resolveTurnProfileFromManifest,
  toContextId,
  type ContextCandidate,
  type ConversationHistoryAdmission,
  type PreparedTurnContext,
  type TurnProfile,
} from "@side-chat/partner-ai-core";
import { Effect } from "effect";
import { DEFAULT_SERVICE_CAPABILITY_CONFIG } from "#composition/capabilities/service-capability-settings";
import { createContextCandidates } from "./candidates/context-candidate-creation.js";
import {
  createBudgetedContextAdmission,
  type ContextAdmission,
} from "./candidates/context-admission.js";
import {
  createPreparedContextManifest,
  createPreparedContextSections,
  createRuntimeMessages,
} from "./rendering/context-rendering.js";
import type {
  GatheredTurnContext,
  PrepareTurnContextInput,
  ServiceContextManagerOptions,
} from "./service-context-manager-types.js";

/**
 * The ordered steps that turn one turn's inputs into prepared context.
 *
 * Each step reads `options`/`input` (plus any prior step's result) and returns
 * an `Effect`, so `prepareTurnContext` can read as a flat narrative. Step bodies
 * stay here; the heavy pure logic lives in the sibling admission and rendering
 * files these steps compose.
 */

/**
 * Resolve the profile core already admitted for this turn.
 *
 * Policy has already selected the profile id. If the manifest no longer contains
 * it, that is a service configuration failure, not a denial.
 */
export const resolveContextProfile = (
  input: PrepareTurnContextInput,
): Effect.Effect<TurnProfile, PartnerAiCoreError> => {
  const resolution = resolveTurnProfileFromManifest(input.manifest, input.policyDecision.profileId);
  if (resolution.resolved) return Effect.succeed(resolution.profile);

  return Effect.fail(
    new PartnerAiCoreError(
      PARTNER_AI_CORE_ERROR_CODES.RUNTIME_FAILED,
      resolution.issue.message,
      PARTNER_AI_CORE_PROTOCOL_ERROR_CODES.INTERNAL_ERROR,
    ),
  );
};

/**
 * Gather every policy-allowed context source before model execution.
 *
 * Conversation history is read while the turn is still pre-runtime. The gathered
 * records stay service-private until admission and rendering decide what becomes
 * model-visible.
 */
export const gatherContextSources = (
  options: ServiceContextManagerOptions,
  input: PrepareTurnContextInput,
) =>
  Effect.gen(function* () {
    const historyMessages = yield* readAllowedConversationHistory(options, input);

    return {
      historyMessages,
    } satisfies GatheredTurnContext;
  });

const readAllowedConversationHistory = (
  options: ServiceContextManagerOptions,
  input: PrepareTurnContextInput,
) => {
  const config = options.history ?? DEFAULT_SERVICE_CAPABILITY_CONFIG.history;
  if (config.mode !== HISTORY_CONTEXT_MODES.RECENT_MESSAGES || config.maxMessages <= 0) {
    return Effect.succeed([]);
  }

  return options.historyContext.readConversationHistory({
    authContext: input.authContext,
    workspace: input.workspace,
    conversation: input.conversation,
    currentUserMessage: input.currentUserMessage,
    limit: config.maxMessages + 1,
    abortSignal: input.abortSignal,
  });
};

/**
 * Candidates plus the budget decision that selected among them.
 *
 * The full candidate list is kept for the persisted context snapshot; the
 * admission decides which candidates become model-visible sections.
 */
export type AdmittedContext = {
  readonly candidates: readonly ContextCandidate[];
  readonly admission: ContextAdmission;
};

/**
 * Prepare candidate metadata and enforce the configured admission budget before
 * any optional context can become model-visible.
 */
export const admitContextCandidates = (
  options: ServiceContextManagerOptions,
  input: PrepareTurnContextInput,
): Effect.Effect<AdmittedContext, unknown> =>
  Effect.gen(function* () {
    const candidates = createContextCandidates(input);
    const admission = yield* Effect.try({
      try: () => createBudgetedContextAdmission(candidates, options.contextAdmission),
      catch: (error) => error,
    });

    return { candidates, admission };
  });

/**
 * Select the prior conversation messages that may become runtime chat messages.
 */
export const admitConversationHistory = (
  options: ServiceContextManagerOptions,
  input: PrepareTurnContextInput,
  sources: GatheredTurnContext,
): Effect.Effect<ConversationHistoryAdmission> =>
  Effect.sync(() =>
    admitConversationHistoryContext({
      messages: sources.historyMessages,
      config: options.history ?? DEFAULT_SERVICE_CAPABILITY_CONFIG.history,
      currentUserMessageId: input.currentUserMessage.messageId,
    }),
  );

/**
 * Assemble the core-owned prepared context contract from the admitted parts.
 *
 * Downstream runtime code receives messages and context, not service adapter
 * records. History can become runtime messages, while host/tool context stays in
 * named context-board sections.
 */
export const renderPreparedTurnContext = (
  input: PrepareTurnContextInput,
  prepared: {
    readonly profile: TurnProfile;
    readonly admitted: AdmittedContext;
    readonly history: ConversationHistoryAdmission;
  },
): PreparedTurnContext => {
  const sections = createPreparedContextSections(input, prepared.admitted.admission.included);
  const manifest = createPreparedContextManifest({
    requestId: input.request.requestId,
    profile: prepared.profile,
    policyDecision: input.policyDecision,
    sections,
    admission: prepared.admitted.admission,
    history: prepared.history.manifest,
    createdAt: input.now,
  });
  const runtimeMessages = createRuntimeMessages(input, prepared.history.admittedMessages);

  return {
    contextId: toContextId(`context_${input.request.requestId}`),
    profile: prepared.profile,
    policyDecision: input.policyDecision,
    history: prepared.history.manifest,
    candidates: prepared.admitted.candidates,
    runtimeMessages,
    contextBoard: { sections, manifest },
  } satisfies PreparedTurnContext;
};
