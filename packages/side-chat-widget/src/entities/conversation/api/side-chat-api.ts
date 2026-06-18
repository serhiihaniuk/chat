export { createSideChatApiClient } from "./client/side-chat-api-client.js";
export type {
  ConversationSummary,
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
  RetryPolicy,
  ResetHistoryOptions,
  ResetHistoryResult,
  SideChatApiClient,
  SideChatApiClientOptions,
  StreamChatOptions,
  StreamChatResult,
} from "./client/side-chat-api-types.js";
export {
  SIDE_CHAT_API_ERROR_CODES,
  SideChatApiError,
  type SideChatApiErrorCode,
} from "./http/side-chat-api-error.js";
export {
  decodeChunkedSseStream,
  type ChunkedSseOptions,
  type StreamChunk,
} from "./sse/side-chat-sse-reader.js";
