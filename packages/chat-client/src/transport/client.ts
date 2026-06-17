import {
  parseChatStreamRequest,
  type ChatStreamRequest,
  type HistoryMessage,
  type SidechatStreamEvent,
  type UsageMetadata,
} from "@side-chat/chat-protocol";
import { omitUndefinedProperties } from "@side-chat/shared";

import { ChatClientError } from "#http/errors";
import { assertNotAborted, buildPathUrl, createHttpError } from "#http/http-helpers";
import {
  listConversationsWithFetch,
  readHistoryWithFetch,
  readUsageWithFetch,
  resetHistoryWithFetch,
} from "#resources/resource-client";
import { decodeChunkedSseStream, type StreamChunk } from "./sse-reader.js";

export type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export type RetryPolicy = {
  readonly attempts: number;
  readonly statuses?: readonly number[] | undefined;
};

export type ChatClientOptions = {
  readonly baseUrl: string;
  readonly conversationsPath?: string | undefined;
  readonly historyPath?: string | undefined;
  readonly streamPath?: string | undefined;
  readonly fetch?: FetchLike | undefined;
  readonly retry?: RetryPolicy | undefined;
  readonly usagePath?: string | undefined;
};

export type StreamChatOptions = {
  readonly signal?: AbortSignal | undefined;
  readonly retry?: RetryPolicy | undefined;
};

export type StreamChatResult = {
  readonly events: AsyncIterable<SidechatStreamEvent>;
  readonly attempt: number;
};

export type ReadHistoryOptions = {
  readonly limit?: number | undefined;
  readonly signal?: AbortSignal | undefined;
};

export type ListConversationsOptions = {
  readonly limit?: number | undefined;
  readonly signal?: AbortSignal | undefined;
};

export type ConversationSummary = {
  readonly conversationId: string;
  readonly title: string;
  readonly status: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly lastMessageAt: string;
};

export type ListConversationsResult = {
  readonly conversations: readonly ConversationSummary[];
};

export type ReadHistoryResult = {
  readonly conversationId: string;
  readonly messages: readonly HistoryMessage[];
};

export type ResetHistoryOptions = {
  readonly signal?: AbortSignal | undefined;
};

export type ResetHistoryResult = {
  readonly conversationId: string;
  readonly status: string;
};

export type ReadUsageOptions = {
  readonly signal?: AbortSignal | undefined;
};

export type ChatClient = {
  readonly listConversations?:
    | ((options?: ListConversationsOptions) => Promise<ListConversationsResult>)
    | undefined;
  readonly readHistory?:
    | ((conversationId: string, options?: ReadHistoryOptions) => Promise<ReadHistoryResult>)
    | undefined;
  readonly readUsage?: ((options?: ReadUsageOptions) => Promise<UsageMetadata>) | undefined;
  readonly resetHistory?:
    | ((conversationId: string, options?: ResetHistoryOptions) => Promise<ResetHistoryResult>)
    | undefined;
  readonly streamChat: (
    request: ChatStreamRequest,
    options?: StreamChatOptions,
  ) => Promise<StreamChatResult>;
};

const DEFAULT_STREAM_PATH = "/chat/stream";
// 409 is intentionally excluded: a Conflict is not safely retryable for a
// turn-creating POST. The streamed turn carries an idempotency-key so the server
// can dedupe when a retryable status (timeout / overload) is replayed.
const DEFAULT_RETRY_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);
const RETRY_BASE_DELAY_MS = 300;
const RETRY_MAX_DELAY_MS = 5_000;

export const createChatClient = (options: ChatClientOptions): ChatClient => {
  const transport = options.fetch ?? globalThis.fetch?.bind(globalThis);
  if (!transport) {
    throw new ChatClientError("network_error", "Fetch is not available");
  }

  return {
    listConversations: (listOptions = {}) =>
      listConversationsWithFetch(options, listOptions, transport),
    readHistory: (conversationId, readOptions = {}) =>
      readHistoryWithFetch(conversationId, options, readOptions, transport),
    readUsage: (usageOptions = {}) => readUsageWithFetch(options, usageOptions, transport),
    resetHistory: (conversationId, resetOptions = {}) =>
      resetHistoryWithFetch(conversationId, options, resetOptions, transport),
    streamChat: (request, streamOptions = {}) =>
      streamChatWithFetch(request, options, streamOptions, transport),
  };
};

const streamChatWithFetch = async (
  request: ChatStreamRequest,
  clientOptions: ChatClientOptions,
  streamOptions: StreamChatOptions,
  transport: FetchLike,
): Promise<StreamChatResult> => {
  const parsedRequest = parseChatStreamRequest(request);
  const retry = streamOptions.retry ?? clientOptions.retry;
  const maxAttempts = Math.max(1, retry?.attempts ?? 1);
  let attempt = 1;

  while (attempt <= maxAttempts) {
    const result = await requestStreamAttempt(
      parsedRequest,
      clientOptions,
      streamOptions,
      transport,
      attempt,
    );
    if (result.ok) return result.value;
    if (!shouldRetry(result.error, retry, attempt, maxAttempts)) throw result.error;
    await delayBeforeRetry(attempt, streamOptions.signal);
    attempt += 1;
  }

  throw new ChatClientError("network_error", "Retry loop exhausted", {
    attempt: maxAttempts,
  });
};

type StreamAttemptResult =
  | { readonly ok: true; readonly value: StreamChatResult }
  | { readonly ok: false; readonly error: ChatClientError };

const requestStreamAttempt = async (
  request: ChatStreamRequest,
  clientOptions: ChatClientOptions,
  streamOptions: StreamChatOptions,
  transport: FetchLike,
  attempt: number,
): Promise<StreamAttemptResult> => {
  assertNotAborted(streamOptions.signal);

  try {
    const response = await transport(
      buildUrl(clientOptions),
      buildRequestInit(request, streamOptions.signal),
    );
    return { ok: true, value: streamResultFromResponse(response, streamOptions, attempt) };
  } catch (cause) {
    assertNotAborted(streamOptions.signal);
    return { ok: false, error: toClientError(cause, attempt) };
  }
};

const streamResultFromResponse = (
  response: Response,
  streamOptions: StreamChatOptions,
  attempt: number,
): StreamChatResult => {
  if (!response.ok) throw createHttpError(response.status, attempt);
  if (!response.body) {
    throw new ChatClientError("network_error", "Streaming response body is missing", {
      attempt,
    });
  }

  return {
    events: decodeChunkedSseStream(
      readResponseBody(response.body),
      streamOptions.signal ? { signal: streamOptions.signal } : undefined,
    ),
    attempt,
  };
};

const buildUrl = (options: ChatClientOptions): string => {
  return buildPathUrl(options.baseUrl, options.streamPath ?? DEFAULT_STREAM_PATH);
};

const buildRequestInit = (
  request: ChatStreamRequest,
  signal: AbortSignal | undefined,
): RequestInit =>
  omitUndefinedProperties({
    method: "POST",
    headers: {
      accept: "text/event-stream",
      "content-type": "application/json",
      // Lets the server dedupe a replayed turn so retries never create duplicates.
      "idempotency-key": request.requestId,
    },
    body: JSON.stringify(request),
    signal,
  });

// Exponential backoff with full jitter so a fleet of clients retrying the same
// overloaded server does not resynchronize into a thundering herd.
const delayBeforeRetry = (attempt: number, signal: AbortSignal | undefined): Promise<void> => {
  const ceiling = Math.min(RETRY_MAX_DELAY_MS, RETRY_BASE_DELAY_MS * 2 ** (attempt - 1));
  const waitMs = Math.random() * ceiling;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, waitMs);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(new ChatClientError("aborted", "Chat stream was aborted", { cause: signal.reason }));
      },
      { once: true },
    );
  });
};

const readResponseBody = async function* (
  body: ReadableStream<Uint8Array>,
): AsyncIterable<StreamChunk> {
  const reader = body.getReader();
  try {
    while (true) {
      const read = await reader.read();
      if (read.done) return;
      yield read.value;
    }
  } finally {
    reader.releaseLock();
  }
};

const toClientError = (cause: unknown, attempt: number): ChatClientError => {
  if (cause instanceof ChatClientError) return cause;
  if (isAbortLikeError(cause)) {
    return new ChatClientError("aborted", "Chat stream was aborted", {
      cause,
      attempt,
    });
  }
  return new ChatClientError("network_error", "Chat stream request failed", {
    cause,
    attempt,
  });
};

const isAbortLikeError = (cause: unknown): boolean =>
  cause instanceof DOMException && cause.name === "AbortError";

const shouldRetry = (
  error: ChatClientError,
  retry: RetryPolicy | undefined,
  attempt: number,
  maxAttempts: number,
): boolean => {
  if (attempt >= maxAttempts) return false;
  if (!retry) return false;
  if (error.code !== "http_error" || error.status === undefined) return false;

  const statuses = retry.statuses ? new Set(retry.statuses) : DEFAULT_RETRY_STATUS;
  return statuses.has(error.status);
};
