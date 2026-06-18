import type {
  ChatReasoningEffort,
  ChatStreamRequest,
  HistoryMessage,
  SidechatStreamEvent,
  UsageMetadata,
} from "@side-chat/chat-protocol";

export type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

/**
 * Retry policy for widget-owned HTTP calls that can be safely replayed.
 *
 * Stream retries rely on the request idempotency key sent with `streamChat`;
 * callers may narrow the retryable HTTP statuses, but 409 is excluded from the
 * default policy because a conflicting turn-creating POST is not replay-safe.
 */
export type RetryPolicy = {
  readonly attempts: number;
  readonly statuses?: readonly number[] | undefined;
};

/**
 * Browser API wiring for the embedded widget.
 *
 * The widget owns these HTTP paths because they only serve the widget shell:
 * conversation lists, history, usage, reset, and live chat streaming. The
 * client returns Side Chat protocol/domain shapes and hides fetch mechanics,
 * raw response payloads, and transport-specific errors behind `SideChatApiError`.
 */
export type SideChatApiClientOptions = {
  readonly baseUrl: string;
  readonly conversationsPath?: string | undefined;
  readonly historyPath?: string | undefined;
  readonly modelsPath?: string | undefined;
  readonly streamPath?: string | undefined;
  readonly fetch?: FetchLike | undefined;
  readonly retry?: RetryPolicy | undefined;
  readonly usagePath?: string | undefined;
};

/** Per-request controls for one live assistant stream. */
export type StreamChatOptions = {
  readonly signal?: AbortSignal | undefined;
  readonly retry?: RetryPolicy | undefined;
};

/**
 * Open stream returned after the HTTP response is accepted.
 *
 * The async iterable yields validated `sidechat.v1` events in sequence. It may
 * still fail while being consumed if the server sends malformed frames, omits a
 * terminal event, or the caller aborts the request.
 */
export type StreamChatResult = {
  readonly events: AsyncIterable<SidechatStreamEvent>;
  readonly attempt: number;
};

/** Query controls for reading one stored conversation. */
export type ReadHistoryOptions = {
  readonly limit?: number | undefined;
  readonly signal?: AbortSignal | undefined;
};

/** Query controls for the widget conversation switcher list. */
export type ListConversationsOptions = {
  readonly limit?: number | undefined;
  readonly signal?: AbortSignal | undefined;
};

/**
 * Conversation list item after the widget has validated the HTTP payload.
 *
 * Status and timestamps still come from the service contract; the widget only
 * normalizes titles for display and local storage. Callers should not treat the
 * `status` string as a closed client enum.
 */
export type ConversationSummary = {
  readonly conversationId: string;
  readonly title: string;
  readonly status: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly lastMessageAt: string;
};

/** Conversation switcher response for the widget shell. */
export type ListConversationsResult = {
  readonly conversations: readonly ConversationSummary[];
};

export type ModelCatalogReasoning = {
  readonly defaultEffort: ChatReasoningEffort;
  readonly efforts: readonly ChatReasoningEffort[];
};

export type ModelCatalogOption = {
  readonly providerId: string;
  readonly modelId: string;
  readonly displayName: string;
  readonly contextWindowTokens?: number | undefined;
  readonly maxOutputTokens?: number | undefined;
  readonly default: boolean;
  readonly available: boolean;
  readonly reasoning?: ModelCatalogReasoning | undefined;
};

export type ListModelsResult = {
  readonly defaultModel?: { readonly providerId: string; readonly modelId: string } | undefined;
  readonly models: readonly ModelCatalogOption[];
};

/** Cancellation control for reading backend-configured model options. */
export type ListModelsOptions = {
  readonly signal?: AbortSignal | undefined;
};

/** Stored transcript returned for a selected conversation. */
export type ReadHistoryResult = {
  readonly conversationId: string;
  readonly messages: readonly HistoryMessage[];
};

/** Cancellation control for deleting a stored conversation history. */
export type ResetHistoryOptions = {
  readonly signal?: AbortSignal | undefined;
};

/** Service acknowledgement after a conversation reset. */
export type ResetHistoryResult = {
  readonly conversationId: string;
  readonly status: string;
};

/** Cancellation control for reading current usage metadata. */
export type ReadUsageOptions = {
  readonly signal?: AbortSignal | undefined;
};

/**
 * Widget-facing repository over the Side Chat service HTTP API.
 *
 * Regular resources use request/response methods; only `streamChat` exposes an
 * async iterable because assistant turns arrive as ordered protocol events.
 * Optional methods let tests or constrained hosts provide only the capabilities
 * they support without leaking transport internals into React state code.
 */
export type SideChatApiClient = {
  readonly listModels?: ((options?: ListModelsOptions) => Promise<ListModelsResult>) | undefined;
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
