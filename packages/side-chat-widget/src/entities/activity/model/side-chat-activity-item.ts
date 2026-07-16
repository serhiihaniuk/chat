import type { ReactNode } from "react";

import type { JsonValue } from "@side-chat/shared";

/** Closed widget vocabulary shared by every transport activity adapter. */
export const SIDE_CHAT_ACTIVITY_KINDS = {
  PROGRESS: "progress",
  REASONING: "reasoning",
  TOOL: "tool",
} as const;

export const SIDE_CHAT_ACTIVITY_STATUSES = {
  RUNNING: "running",
  COMPLETED: "completed",
  FAILED: "failed",
} as const;

export type SideChatActivityKind =
  (typeof SIDE_CHAT_ACTIVITY_KINDS)[keyof typeof SIDE_CHAT_ACTIVITY_KINDS];
export type SideChatActivityStatus =
  (typeof SIDE_CHAT_ACTIVITY_STATUSES)[keyof typeof SIDE_CHAT_ACTIVITY_STATUSES];

type SideChatActivityBase<Kind extends SideChatActivityKind> = {
  readonly id: string;
  readonly kind: Kind;
  readonly status: SideChatActivityStatus;
  readonly title: string;
  readonly body?: string | undefined;
};

type SideChatToolActivityItem = SideChatActivityBase<typeof SIDE_CHAT_ACTIVITY_KINDS.TOOL> & {
  readonly tool: {
    readonly toolCallId?: string | undefined;
    readonly toolName: string;
    readonly input?: JsonValue | undefined;
    readonly result?: JsonValue | undefined;
    readonly errorCode?: string | undefined;
  };
};

/**
 * Public activity-rendering input owned by the widget, not either transport.
 *
 * Adapters intentionally exclude protocol details, AI SDK parts, provider
 * values, approval payloads, sources, and images from this customization seam.
 */
export type SideChatActivityItem =
  | SideChatActivityBase<typeof SIDE_CHAT_ACTIVITY_KINDS.PROGRESS>
  | SideChatActivityBase<typeof SIDE_CHAT_ACTIVITY_KINDS.REASONING>
  | SideChatToolActivityItem;

/** Return a node to replace one eligible activity item, or undefined for its default. */
export type RenderActivityItem = (item: SideChatActivityItem) => ReactNode | undefined;
