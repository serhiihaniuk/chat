import type { UsageMetadata } from "@side-chat/chat-protocol";
import { isRecord, optionalField } from "@side-chat/shared";

import { ChatClientError } from "#http/errors";
import { assertNotAborted, buildPathUrl, createHttpError, withSignal } from "#http/http-helpers";
import type {
  ChatClientOptions,
  FetchLike,
  ReadHistoryOptions,
  ReadHistoryResult,
  ReadUsageOptions,
  ResetHistoryOptions,
  ResetHistoryResult,
} from "#transport/client";

const DEFAULT_HISTORY_PATH = "/chat/history";
const DEFAULT_USAGE_PATH = "/usage";

export const readHistoryWithFetch = async (
  conversationId: string,
  clientOptions: ChatClientOptions,
  options: ReadHistoryOptions,
  transport: FetchLike,
): Promise<ReadHistoryResult> => {
  assertNotAborted(options.signal);
  const url = new URL(
    encodeURIComponent(conversationId),
    `${buildPathUrl(clientOptions.baseUrl, clientOptions.historyPath ?? DEFAULT_HISTORY_PATH)}/`,
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
  clientOptions: ChatClientOptions,
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
  clientOptions: ChatClientOptions,
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
    throw new ChatClientError("network_error", `Malformed ${route} response JSON`, { cause });
  }
};

const normalizeHistory = (payload: unknown): ReadHistoryResult => {
  if (!isRecord(payload) || typeof payload["conversationId"] !== "string") {
    throw new ChatClientError("network_error", "Malformed history response");
  }
  if (!Array.isArray(payload["messages"])) {
    throw new ChatClientError("network_error", "Malformed history response");
  }
  return {
    conversationId: payload["conversationId"],
    messages: payload["messages"].map(normalizeHistoryMessage),
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
    throw new ChatClientError("network_error", "Malformed history response");
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
    throw new ChatClientError("network_error", "Malformed history reset response");
  }
  if (typeof payload["status"] !== "string") {
    throw new ChatClientError("network_error", "Malformed history reset response");
  }
  return {
    conversationId: payload["conversationId"],
    status: payload["status"],
  };
};

const normalizeUsage = (payload: unknown): UsageMetadata => {
  if (!isRecord(payload)) {
    throw new ChatClientError("network_error", "Malformed usage response");
  }
  const inputTokens = payload["inputTokens"];
  const outputTokens = payload["outputTokens"];
  const totalTokens = payload["totalTokens"];
  if (
    !isOptionalNumber(inputTokens) ||
    !isOptionalNumber(outputTokens) ||
    !isOptionalNumber(totalTokens)
  ) {
    throw new ChatClientError("network_error", "Malformed usage response");
  }

  return {
    ...optionalField("inputTokens", inputTokens),
    ...optionalField("outputTokens", outputTokens),
    ...optionalField("totalTokens", totalTokens),
  };
};

const isOptionalNumber = (value: unknown): value is number | undefined =>
  value === undefined || typeof value === "number";

const isHistoryRole = (value: unknown): value is ReadHistoryResult["messages"][number]["role"] =>
  value === "user" || value === "assistant" || value === "system";
