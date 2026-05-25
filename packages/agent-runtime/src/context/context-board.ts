import type { JsonObject } from "@side-chat/chat-protocol";

export type RuntimeContextBoard = {
  readonly sections: readonly RuntimeContextSection[];
  readonly manifest?: RuntimeContextManifest;
};

export type RuntimeContextSection = {
  readonly title: string;
  readonly content: string;
  readonly priority?: number;
  readonly metadata?: JsonObject;
};

export type RuntimeContextManifest = {
  readonly snapshotId?: string;
  readonly snapshotHash?: string;
  readonly includedMessageIds?: readonly string[];
  readonly budget?: JsonObject;
};
