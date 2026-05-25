import type { JsonObject } from "@side-chat/chat-protocol";

export type WidgetMessagePart =
  | WidgetReasoningPart
  | WidgetToolPart
  | WidgetHostCommandPart;

export type WidgetReasoningPart = {
  readonly content: string;
  readonly id: string;
  readonly type: "reasoning";
};

export type WidgetToolPart = {
  readonly error?: string;
  readonly id: string;
  readonly output?: JsonObject;
  readonly status: "completed" | "failed" | "started";
  readonly toolCallId: string;
  readonly toolName: string;
  readonly type: "tool";
};

export type WidgetHostCommandPart = {
  readonly commandId: string;
  readonly commandName: string;
  readonly id: string;
  readonly payload: JsonObject;
  readonly resultCode?: string;
  readonly status:
    | "applied"
    | "failed"
    | "pending"
    | "rejected"
    | "unsupported";
  readonly type: "host-command";
};

export type WidgetMessage = {
  readonly content: string;
  readonly id: string;
  readonly metadata?: JsonObject;
  readonly parts?: readonly WidgetMessagePart[];
  readonly role: "assistant" | "system" | "user";
  readonly sequence: number;
};
