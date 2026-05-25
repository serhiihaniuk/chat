import type { JsonObject } from "@side-chat/chat-protocol";

export type RuntimeObserver = {
  record(event: RuntimeObserverEvent): void;
};

export type RuntimeObserverEvent = {
  readonly name: string;
  readonly attributes?: JsonObject;
};

export const noopRuntimeObserver: RuntimeObserver = {
  record: () => undefined,
};
