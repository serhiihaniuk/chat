import type { UsageMetadata } from "@side-chat/chat-protocol";
import { isRecord, omitUndefinedProperties } from "@side-chat/shared";

import { SideChatApiError } from "./side-chat-api-error.js";
import {
  assertNotAborted,
  buildPathUrl,
  createHttpError,
  withSignal,
} from "./side-chat-http-helpers.js";
import { normalizeModelCatalog } from "./side-chat-model-catalog-normalizer.js";
import type {
  FetchLike,
  ListConversationsOptions,
  ListConversationsResult,
  ListModelsOptions,
  ListModelsResult,
  ReadHistoryOptions,
  ReadHistoryResult,
  ReadUsageOptions,
  ResetHistoryOptions,
  ResetHistoryResult,
  SideChatApiClientOptions,
} from "../client/side-chat-api-types.js";

const DEFAULT_HISTORY_PATH = "/chat/history";
const DEFAULT_CONVERSATIONS_PATH = "/chat/conversations";
const DEFAULT_MODELS_PATH = "/models";
const DEFAULT_USAGE_PATH = "/usage";

export const listConversationsWithFetch = async (
  clientOptions: SideChatApiClientOptions,
  options: ListConversationsOptions,
  transport: FetchLike,
): Promise<ListConversationsResult> => {
  assertNotAborted(options.signal);
  const url = new URL(
    buildPathUrl(
      clientOptions.baseUrl,
      clientOptions.conversationsPath ?? DEFAULT_CONVERSATIONS_PATH,
    ),
  );
  if (options.limit !== undefined) {
    url.searchParams.set("limit", String(options.limit));
  }

  const response = await transport(url, withSignal(options.signal));
  if (!response.ok) throw createHttpError(response.status, 1);
  return normalizeConversationList(await readJson(response, "conversation list"));
};

export const listModelsWithFetch = async (
  clientOptions: SideChatApiClientOptions,
  options: ListModelsOptions,
  transport: FetchLike,
): Promise<ListModelsResult> => {
  assertNotAborted(options.signal);
  const response = await transport(
    buildPathUrl(clientOptions.baseUrl, clientOptions.modelsPath ?? DEFAULT_MODELS_PATH),
    withSignal(options.signal),
  );
  if (!response.ok) throw createHttpError(response.status, 1);
  return normalizeModelCatalog(await readJson(response, "models"));
};

export const readHistoryWithFetch = async (
  conversationId: string,
  clientOptions: SideChatApiClientOptions,
  options: ReadHistoryOptions,
  transport: FetchLike,
): Promise<ReadHistoryResult> => {
  assertNotAborted(options.signal);
  // Read the single-conversation route so history arrives with the server's
  // activeTurn pointer, letting a reconnecting client resume an in-flight turn
  // from the same read that loaded past messages.
  const url = new URL(
    encodeURIComponent(conversationId),
    `${buildPathUrl(
      clientOptions.baseUrl,
      clientOptions.conversationsPath ?? DEFAULT_CONVERSATIONS_PATH,
    )}/`,
  );
  if (options.limit !== undefined) {
    url.searchParams.set("limit", String(options.limit));
  }

  const response = await transport(url, withSignal(options.signal));
  if (!response.ok) throw createHttpError(response.status, 1);
  return normalizeHistory(await readJson(response, "history"));
};

export const resetHistoryWithFetch = async (
  conversationId: string,
  clientOptions: SideChatApiClientOptions,
  options: ResetHistoryOptions,
  transport: FetchLike,
): Promise<ResetHistoryResult> => {
  assertNotAborted(options.signal);
  const url = new URL(
    encodeURIComponent(conversationId),
    `${buildPathUrl(clientOptions.baseUrl, clientOptions.historyPath ?? DEFAULT_HISTORY_PATH)}/`,
  );
  const response = await transport(url, {
    method: "DELETE",
    ...withSignal(options.signal),
  });
  if (!response.ok) throw createHttpError(response.status, 1);
  return normalizeReset(await readJson(response, "history reset"));
};

export const readUsageWithFetch = async (
  clientOptions: SideChatApiClientOptions,
  options: ReadUsageOptions,
  transport: FetchLike,
): Promise<UsageMetadata> => {
  assertNotAborted(options.signal);
  const response = await transport(
    buildPathUrl(clientOptions.baseUrl, clientOptions.usagePath ?? DEFAULT_USAGE_PATH),
    withSignal(options.signal),
  );
  if (!response.ok) throw createHttpError(response.status, 1);
  return normalizeUsage(await readJson(response, "usage"));
};

const readJson = async (response: Response, route: string): Promise<unknown> => {
  try {
    return (await response.json()) as unknown;
  } catch (cause) {
    throw new SideChatApiError("network_error", `Malformed ${route} response JSON`, { cause });
  }
};

const normalizeHistory = (payload: unknown): ReadHistoryResult => {
  if (!isRecord(payload) || typeof payload["conversationId"] !== "string") {
    throw new SideChatApiError("network_error", "Malformed history response");
  }
  if (!Array.isArray(payload["messages"])) {
    throw new SideChatApiError("network_error", "Malformed history response");
  }
  return omitUndefinedProperties({
    conversationId: payload["conversationId"],
    messages: payload["messages"].map(normalizeHistoryMessage),
    activeTurn: normalizeActiveTurn(payload["activeTurn"]),
  });
};

// `activeTurn` is null/absent when no turn is in flight. A present pointer must
// carry the turn id + status so a reconnecting client can resume it.
const normalizeActiveTurn = (payload: unknown): ReadHistoryResult["activeTurn"] => {
  if (payload === null || payload === undefined) return undefined;
  if (
    !isRecord(payload) ||
    typeof payload["assistantTurnId"] !== "string" ||
    typeof payload["status"] !== "string"
  ) {
    throw new SideChatApiError("network_error", "Malformed history response");
  }
  return { assistantTurnId: payload["assistantTurnId"], status: payload["status"] };
};

const normalizeConversationList = (payload: unknown): ListConversationsResult => {
  if (!isRecord(payload) || !Array.isArray(payload["conversations"])) {
    throw new SideChatApiError("network_error", "Malformed conversation list response");
  }
  return {
    conversations: payload["conversations"].map(normalizeConversationSummary),
  };
};

const normalizeConversationSummary = (
  payload: unknown,
): ListConversationsResult["conversations"][number] => {
  if (
    !isRecord(payload) ||
    typeof payload["conversationId"] !== "string" ||
    typeof payload["title"] !== "string" ||
    typeof payload["status"] !== "string" ||
    typeof payload["createdAt"] !== "string" ||
    typeof payload["updatedAt"] !== "string" ||
    typeof payload["lastMessageAt"] !== "string"
  ) {
    throw new SideChatApiError("network_error", "Malformed conversation list response");
  }
  return {
    conversationId: payload["conversationId"],
    title: payload["title"],
    status: payload["status"],
    createdAt: payload["createdAt"],
    updatedAt: payload["updatedAt"],
    lastMessageAt: payload["lastMessageAt"],
  };
};

const normalizeHistoryMessage = (payload: unknown): ReadHistoryResult["messages"][number] => {
  if (
    !isRecord(payload) ||
    typeof payload["id"] !== "string" ||
    !isHistoryRole(payload["role"]) ||
    typeof payload["content"] !== "string" ||
    typeof payload["sequence"] !== "number"
  ) {
    throw new SideChatApiError("network_error", "Malformed history response");
  }
  return {
    id: payload["id"],
    role: payload["role"],
    content: payload["content"],
    sequence: payload["sequence"],
  };
};

const normalizeReset = (payload: unknown): ResetHistoryResult => {
  if (!isRecord(payload) || typeof payload["conversationId"] !== "string") {
    throw new SideChatApiError("network_error", "Malformed history reset response");
  }
  if (typeof payload["status"] !== "string") {
    throw new SideChatApiError("network_error", "Malformed history reset response");
  }
  return {
    conversationId: payload["conversationId"],
    status: payload["status"],
  };
};

const normalizeUsage = (payload: unknown): UsageMetadata => {
  if (!isRecord(payload)) {
    throw new SideChatApiError("network_error", "Malformed usage response");
  }
  const inputTokens = payload["inputTokens"];
  const outputTokens = payload["outputTokens"];
  const totalTokens = payload["totalTokens"];
  if (
    !isOptionalNumber(inputTokens) ||
    !isOptionalNumber(outputTokens) ||
    !isOptionalNumber(totalTokens)
  ) {
    throw new SideChatApiError("network_error", "Malformed usage response");
  }

  return omitUndefinedProperties({
    inputTokens,
    outputTokens,
    totalTokens,
  });
};

const isOptionalNumber = (value: unknown): value is number | undefined =>
  value === undefined || typeof value === "number";

const isHistoryRole = (value: unknown): value is ReadHistoryResult["messages"][number]["role"] =>
  value === "user" || value === "assistant" || value === "system";
