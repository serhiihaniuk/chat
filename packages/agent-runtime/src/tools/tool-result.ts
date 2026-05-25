import type { ActivitySource, JsonObject } from "@side-chat/chat-protocol";

export type RuntimeToolOutput = {
  readonly data: JsonObject;
  readonly sources?: readonly ActivitySource[];
};
