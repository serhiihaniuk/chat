import {
  SIDECHAT_PROTOCOL_VERSION,
  type ChatModelPreference,
  type ChatStreamRequest,
  type HostContext,
  type RequestHostCommand,
  type UsageMetadata,
} from "@side-chat/chat-protocol";
import { omitUndefinedProperties } from "@side-chat/shared";

import { createEmptyActivityTimeline, type WidgetActivityTimeline } from "./activity.js";

export const WIDGET_STATUSES = {
  IDLE: "idle",
  SUBMITTED: "submitted",
  STREAMING: "streaming",
  ERROR: "error",
} as const;

export type WidgetStatus = (typeof WIDGET_STATUSES)[keyof typeof WIDGET_STATUSES];
export type WidgetUsage = UsageMetadata;

/**
 * Tokens occupying the context window after a completed turn, or `undefined` when
 * usage carries no token counts. Prefers the provider's `totalTokens`; otherwise
 * sums input + output (the prompt already includes prior history, so this is the
 * running context fill, not a single message's size). The context meter divides
 * this by the active model's context window to show the fill.
 */
export const contextTokensFromUsage = (usage: WidgetUsage | undefined): number | undefined => {
  if (!usage) return undefined;
  if (usage.totalTokens !== undefined) return usage.totalTokens;
  if (usage.inputTokens !== undefined && usage.outputTokens !== undefined) {
    return usage.inputTokens + usage.outputTokens;
  }
  return usage.inputTokens ?? usage.outputTokens;
};

/**
 * The terminal notice the conversation view renders, if any.
 *
 * `error` is the retryable failure surface; `blocked` is the calm safety-stop
 * notice with no Retry. A cancelled or still-running turn has no notice. Lives in
 * the entity layer so both the chat feature (which computes it) and the
 * conversation feature (which renders it) can share the type.
 */
export type WidgetRunNotice =
  | { readonly kind: "error"; readonly message: string }
  | { readonly kind: "blocked"; readonly message: string };

export type WidgetMessage = {
  readonly id: string;
  readonly role: "user" | "assistant";
  readonly content: string;
  readonly activity: WidgetActivityTimeline;
  readonly isStreaming?: boolean | undefined;
};

export type WidgetChatRequestInput = {
  readonly turnProfileId: string | undefined;
  readonly conversationId: string | undefined;
  readonly hostContext: HostContext | undefined;
  readonly hostCommands?: readonly RequestHostCommand[] | undefined;
  readonly enabledToolNames?: readonly string[] | undefined;
  readonly message: string;
  readonly messageId: string;
  readonly model?: ChatModelPreference | undefined;
  readonly requestId: string;
};

export const createDefaultRequest = ({
  turnProfileId,
  conversationId,
  content,
  hostContext,
  hostCommands,
  enabledToolNames,
  messageId,
  model,
  requestId,
}: {
  readonly turnProfileId?: string | undefined;
  readonly conversationId?: string | undefined;
  readonly content: string;
  readonly hostContext?: HostContext | undefined;
  readonly hostCommands?: readonly RequestHostCommand[] | undefined;
  readonly enabledToolNames?: readonly string[] | undefined;
  readonly messageId: string;
  readonly model?: ChatModelPreference | undefined;
  readonly requestId: string;
}): ChatStreamRequest =>
  omitUndefinedProperties({
    protocolVersion: SIDECHAT_PROTOCOL_VERSION,
    requestId,
    conversationId: conversationId === "" ? undefined : conversationId,
    turnProfileId: turnProfileId === "" ? undefined : turnProfileId,
    model,
    message: {
      id: messageId,
      content,
    },
    hostContext,
    hostCommands,
    enabledToolNames,
  });

export const createWidgetChatRequest = ({
  turnProfileId,
  conversationId,
  hostContext,
  hostCommands,
  enabledToolNames,
  message,
  messageId,
  model,
  requestId,
}: WidgetChatRequestInput): ChatStreamRequest =>
  createDefaultRequest({
    content: message,
    messageId,
    requestId,
    turnProfileId,
    conversationId,
    hostContext,
    hostCommands,
    enabledToolNames,
    model,
  });

export const createWidgetMessage = (
  id: string,
  role: WidgetMessage["role"],
  content: string,
  isStreaming = false,
): WidgetMessage => ({
  id,
  role,
  content,
  activity: createEmptyActivityTimeline(),
  isStreaming,
});

export const updateMessage = (
  messages: readonly WidgetMessage[],
  id: string,
  update: (message: WidgetMessage) => WidgetMessage,
): WidgetMessage[] => messages.map((message) => (message.id === id ? update(message) : message));

/**
 * Carry activity timelines from a finished run's transcript onto the freshly
 * loaded history projection (run→history handoff).
 *
 * History can persist the activity timeline, but it may be empty when retention
 * is disabled or the trace is unavailable. In that fallback case, swapping the
 * live run for history would drop the thinking info the user just watched. The
 * transcripts are tail-aligned — server ids never match the run's local ids —
 * and each history message keeps its identity while receiving the matching run
 * timeline. Durable history always wins when it already has activity. A run
 * counterpart only qualifies when role and content agree, so a diverged
 * transcript is never mislabeled with someone else's thinking.
 */
export const carryTranscriptActivity = (
  messages: readonly WidgetMessage[],
  source: readonly WidgetMessage[],
): readonly WidgetMessage[] => {
  if (messages.length === 0 || source.length === 0) return messages;
  const offset = messages.length - source.length;
  let carried = false;
  const next = messages.map((message, index) => {
    const counterpart = source[index - offset];
    if (message.activity.items.length > 0) return message;
    if (!counterpart || counterpart.activity.items.length === 0) return message;
    if (counterpart.role !== message.role || counterpart.content !== message.content)
      return message;
    carried = true;
    return { ...message, activity: counterpart.activity };
  });
  return carried ? next : messages;
};

export const findLastUserMessage = (
  messages: readonly WidgetMessage[],
): WidgetMessage | undefined => {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.role === "user") return message;
  }
  return undefined;
};

export const messagesBeforeMessage = (
  messages: readonly WidgetMessage[],
  target: WidgetMessage,
): WidgetMessage[] => messages.slice(0, messages.lastIndexOf(target));

export const toErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : "Chat request failed";

export const createId = (prefix: string): string => {
  const random =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2);
  return `${prefix}-${random}`;
};
