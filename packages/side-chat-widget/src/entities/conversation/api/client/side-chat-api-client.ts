import { SideChatApiError } from "../http/side-chat-api-error.js";
import {
  listConversationsWithFetch,
  listModelsWithFetch,
  listToolsWithFetch,
  readHistoryWithFetch,
  readUsageWithFetch,
  resetHistoryWithFetch,
} from "../http/side-chat-resource-client.js";
import {
  cancelTurnWithFetch,
  createRunWithFetch,
  getTurnStatusWithFetch,
  resolveRunWithFetch,
  submitHostCommandResultWithFetch,
} from "../run/side-chat-run-client.js";
import { subscribeActivityWithFetch } from "../run/side-chat-activity-stream.js";
import { subscribeTurnWithFetch } from "../run/side-chat-turn-stream.js";
import type {
  FetchLike,
  SideChatApiClient,
  SideChatApiClientOptions,
} from "./side-chat-api-types.js";

export type {
  ActiveTurnSummary,
  CancelTurnResult,
  ConversationSummary,
  CreateRunOptions,
  CreateRunResult,
  FetchLike,
  ListConversationsOptions,
  ListConversationsResult,
  ListModelsOptions,
  ListModelsResult,
  ModelCatalogOption,
  ModelCatalogReasoning,
  ReadHistoryOptions,
  ReadHistoryResult,
  ReadUsageOptions,
  ResolveRunResult,
  RetryPolicy,
  ResetHistoryOptions,
  ResetHistoryResult,
  SideChatApiClient,
  SideChatApiClientOptions,
  SubmitHostCommandResultInput,
  SubmitHostCommandResultResult,
  SubscribeActivityOptions,
  SubscribeActivityResult,
  SubscribeTurnOptions,
  SubscribeTurnResult,
  TurnStatusResult,
} from "./side-chat-api-types.js";

/**
 * Build the widget-facing HTTP repository.
 *
 * Chat uses the resumable two-call flow: `createRun` posts the turn identity,
 * then `subscribeTurn` opens the replayable SSE stream. Resolve/status/cancel
 * round out reconnect and stop. Every method hides fetch mechanics behind
 * `SideChatApiError` and returns protocol/domain shapes only.
 */
export const createSideChatApiClient = (options: SideChatApiClientOptions): SideChatApiClient => {
  const transport = options.fetch ?? globalThis.fetch?.bind(globalThis);
  if (!transport) {
    throw new SideChatApiError("network_error", "Fetch is not available");
  }

  return {
    ...buildResourceMethods(options, transport),
    ...buildRunMethods(options, transport),
  };
};

// Request/response resources that only serve the widget shell.
const buildResourceMethods = (
  options: SideChatApiClientOptions,
  transport: FetchLike,
): Pick<
  SideChatApiClient,
  "listModels" | "listTools" | "listConversations" | "readHistory" | "readUsage" | "resetHistory"
> => ({
  listModels: (modelOptions = {}) => listModelsWithFetch(options, modelOptions, transport),
  listTools: (toolOptions = {}) => listToolsWithFetch(options, toolOptions, transport),
  listConversations: (listOptions = {}) =>
    listConversationsWithFetch(options, listOptions, transport),
  readHistory: (conversationId, readOptions = {}) =>
    readHistoryWithFetch(conversationId, options, readOptions, transport),
  readUsage: (usageOptions = {}) => readUsageWithFetch(options, usageOptions, transport),
  resetHistory: (conversationId, resetOptions = {}) =>
    resetHistoryWithFetch(conversationId, options, resetOptions, transport),
});

// The resumable two-call chat flow plus reconnect/stop helpers.
const buildRunMethods = (
  options: SideChatApiClientOptions,
  transport: FetchLike,
): Pick<
  SideChatApiClient,
  | "createRun"
  | "subscribeTurn"
  | "resolveRun"
  | "getTurnStatus"
  | "cancelTurn"
  | "submitHostCommandResult"
  | "subscribeActivity"
> => ({
  createRun: (request, runOptions = {}) =>
    createRunWithFetch(request, options, runOptions, transport),
  subscribeTurn: (assistantTurnId, subscribeOptions = {}) =>
    subscribeTurnWithFetch(assistantTurnId, options, subscribeOptions, transport),
  resolveRun: (requestId, runOptions = {}) =>
    resolveRunWithFetch(requestId, options, runOptions, transport),
  getTurnStatus: (assistantTurnId, runOptions = {}) =>
    getTurnStatusWithFetch(assistantTurnId, options, runOptions, transport),
  cancelTurn: (assistantTurnId, runOptions = {}) =>
    cancelTurnWithFetch(assistantTurnId, options, runOptions, transport),
  submitHostCommandResult: (input, runOptions = {}) =>
    submitHostCommandResultWithFetch(input, options, runOptions, transport),
  subscribeActivity: (activityOptions = {}) =>
    subscribeActivityWithFetch(options, activityOptions, transport),
});
