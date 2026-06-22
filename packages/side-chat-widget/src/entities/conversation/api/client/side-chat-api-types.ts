import type {
  ChatReasoningEffort,
  ChatStreamRequest,
  HistoryMessage,
  SidechatStreamEvent,
  TurnActivityEvent,
  UsageMetadata,
} from "@side-chat/chat-protocol";

export type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

/**
 * Retry policy for widget-owned HTTP calls that can be safely replayed.
 *
 * The turn-creating POST relies on the request idempotency key sent with
 * `createRun`; callers may narrow the retryable HTTP statuses, but 409 is
 * excluded from the default policy because a conflicting create is not
 * replay-safe.
 */
export type RetryPolicy = {
  readonly attempts: number;
  readonly statuses?: readonly number[] | undefined;
};

/**
 * Browser API wiring for the embedded widget.
 *
 * The widget owns these HTTP paths because they only serve the widget shell:
 * conversation lists, history, usage, reset, and the resumable two-call chat
 * flow (create a run, then subscribe to its turn). The client returns Side Chat
 * protocol/domain shapes and hides fetch mechanics, raw response payloads, and
 * transport-specific errors behind `SideChatApiError`.
 */
export type SideChatApiClientOptions = {
  readonly baseUrl: string;
  readonly conversationsPath?: string | undefined;
  readonly historyPath?: string | undefined;
  readonly modelsPath?: string | undefined;
  readonly runsPath?: string | undefined;
  readonly turnsPath?: string | undefined;
  readonly activityPath?: string | undefined;
  readonly fetch?: FetchLike | undefined;
  readonly retry?: RetryPolicy | undefined;
  readonly usagePath?: string | undefined;
};

/** Cancellation/retry controls for creating one assistant run. */
export type CreateRunOptions = {
  readonly signal?: AbortSignal | undefined;
  readonly retry?: RetryPolicy | undefined;
};

/**
 * Identity returned the moment a run is accepted by `POST /chat/runs`.
 *
 * `assistantTurnId` is the canonical key for streaming, status, and cancel;
 * `requestId` stays the idempotency/resolver key. The status is the server's
 * turn status string and should not be treated as a closed client enum.
 */
export type CreateRunResult = {
  readonly requestId: string;
  readonly assistantTurnId: string;
  readonly conversationId: string;
  readonly status: string;
};

/** Per-request controls for subscribing to one assistant turn stream. */
export type SubscribeTurnOptions = {
  /** Replay offset: events with `sequence > after` are returned. Defaults to -1. */
  readonly after?: number | undefined;
  readonly signal?: AbortSignal | undefined;
};

/**
 * Open stream returned after the SSE response is accepted.
 *
 * The async iterable yields validated `sidechat.v1` events in sequence. It may
 * still fail while being consumed if the server sends malformed frames, omits a
 * terminal event, or the caller aborts the request. A stream that cannot replay
 * (the durable log was pruned, or the turn is gone) is reported as a
 * `replay_expired` `SideChatApiError` before any event is yielded.
 */
export type SubscribeTurnResult = {
  readonly events: AsyncIterable<SidechatStreamEvent>;
};

/** Per-request controls for the subject-scoped activity stream. */
export type SubscribeActivityOptions = {
  readonly signal?: AbortSignal | undefined;
};

/**
 * Open stream of subject turn lifecycle: a snapshot of currently-running turns,
 * then live transitions. Has no terminal event — it yields until the caller
 * aborts. Used to drive a live "generating" dot per conversation in the sidebar.
 */
export type SubscribeActivityResult = {
  readonly events: AsyncIterable<TurnActivityEvent>;
};

/** Resolver result mapping a lost `requestId` back to its turn. */
export type ResolveRunResult = {
  readonly assistantTurnId: string;
  readonly status: string;
};

/** Turn status snapshot read by id. */
export type TurnStatusResult = {
  readonly assistantTurnId: string;
  readonly conversationId: string;
  readonly requestId: string;
  readonly status: string;
};

/** Acknowledgement returned after requesting a turn cancellation. */
export type CancelTurnResult = {
  readonly assistantTurnId: string;
  readonly cancelRequested: boolean;
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

/**
 * Active turn pointer the server returns alongside a conversation history read.
 *
 * Present when a turn is still running for the conversation, so a reconnecting
 * client can resume an in-flight turn from the same read that loaded history.
 */
export type ActiveTurnSummary = {
  readonly assistantTurnId: string;
  readonly status: string;
};

/** Stored transcript returned for a selected conversation, plus any active turn. */
export type ReadHistoryResult = {
  readonly conversationId: string;
  readonly messages: readonly HistoryMessage[];
  readonly activeTurn?: ActiveTurnSummary | undefined;
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
 * Chat uses the resumable two-call flow: `createRun` posts the turn identity,
 * then `subscribeTurn` streams (and replays) ordered protocol events. The other
 * methods are request/response. Optional methods let tests or constrained hosts
 * provide only the capabilities they support without leaking transport internals
 * into React state code.
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
  readonly createRun: (
    request: ChatStreamRequest,
    options?: CreateRunOptions,
  ) => Promise<CreateRunResult>;
  readonly subscribeTurn: (
    assistantTurnId: string,
    options?: SubscribeTurnOptions,
  ) => Promise<SubscribeTurnResult>;
  readonly resolveRun: (requestId: string, options?: CreateRunOptions) => Promise<ResolveRunResult>;
  readonly getTurnStatus: (
    assistantTurnId: string,
    options?: CreateRunOptions,
  ) => Promise<TurnStatusResult>;
  readonly cancelTurn: (
    assistantTurnId: string,
    options?: CreateRunOptions,
  ) => Promise<CancelTurnResult>;
  /** Subject-scoped live turn lifecycle for sidebar "generating" dots. Optional. */
  readonly subscribeActivity?:
    | ((options?: SubscribeActivityOptions) => Promise<SubscribeActivityResult>)
    | undefined;
};
