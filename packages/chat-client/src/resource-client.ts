import type { UsageMetadata } from "@side-chat/chat-protocol";

import { assertNotAborted, buildPathUrl, createHttpError, withSignal } from "./http-helpers.js";
import type {
  ChatClientOptions,
  FetchLike,
  ReadHistoryOptions,
  ReadHistoryResult,
  ReadUsageOptions,
  ResetHistoryOptions,
  ResetHistoryResult,
} from "./client.js";

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
  const payload = (await response.json()) as ReadHistoryResult;
  return {
    conversationId: payload.conversationId,
    messages: payload.messages,
  };
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
  return (await response.json()) as ResetHistoryResult;
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
  return normalizeUsage((await response.json()) as UsageMetadata);
};

const normalizeUsage = (payload: UsageMetadata): UsageMetadata => ({
  ...(payload.inputTokens === undefined ? {} : { inputTokens: payload.inputTokens }),
  ...(payload.outputTokens === undefined ? {} : { outputTokens: payload.outputTokens }),
  ...(payload.totalTokens === undefined ? {} : { totalTokens: payload.totalTokens }),
});
