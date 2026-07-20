import type { JsonObject, JsonValue } from "@side-chat/shared";

import type { AuthContext } from "@side-chat/side-chat-server";

export const CLIENT_TOOL_OUTPUT_STATES = {
  SETTLED: "settled",
  FAILED: "failed",
} as const;

export type ClientToolOutputState =
  (typeof CLIENT_TOOL_OUTPUT_STATES)[keyof typeof CLIENT_TOOL_OUTPUT_STATES];

export type ClientToolDispatchRef = Readonly<{
  workspaceId: string;
  turnId: string;
  runId: string;
  toolCallId: string;
}>;

export const CLIENT_TOOL_DISPATCH_LOOKUP = {
  NOT_FOUND: "not_found",
  NOT_READY: "not_ready",
} as const;

export type ClientToolDispatchLookup =
  | ClientToolDispatchRef
  | (typeof CLIENT_TOOL_DISPATCH_LOOKUP)[keyof typeof CLIENT_TOOL_DISPATCH_LOOKUP];

export type ClientToolOutputEnvelope = JsonObject & Readonly<{ value: JsonValue }>;

export type ClientToolOutputDisposition = "accepted" | "duplicate" | "late";

export type ClientToolOutputResult = Readonly<{
  disposition: ClientToolOutputDisposition;
  state: "settled" | "failed" | "timed_out" | "late" | "aborted";
  output: ClientToolOutputEnvelope;
}>;

/** Persistence authority for one authenticated browser-executed tool result. */
export interface ClientToolDispatchStore {
  findOwned(
    auth: AuthContext,
    runId: string,
    toolCallId: string,
    clientToolCapabilityDigest: string,
  ): Promise<ClientToolDispatchLookup>;
  submit(
    dispatch: ClientToolDispatchRef,
    state: ClientToolOutputState,
    output: ClientToolOutputEnvelope,
  ): Promise<ClientToolOutputResult>;
}

export type ClientToolDispatchIdentity = Readonly<{
  workspaceId: string;
  turnId: string;
  toolCallId: string;
}>;

export type ClientToolDispatchSnapshot = Readonly<{
  state: "dispatched" | "settled" | "failed" | "timed_out" | "late" | "aborted";
  output?: ClientToolOutputEnvelope | undefined;
}>;

/** Durable operations used from Workflow step activities after a resume. */
export interface ClientToolWorkflowStore {
  create(
    dispatch: ClientToolDispatchIdentity &
      Readonly<{ toolName: string; clientToolCapabilityDigest: string }>,
  ): Promise<ClientToolDispatchSnapshot>;
  read(dispatch: ClientToolDispatchIdentity): Promise<ClientToolDispatchSnapshot | undefined>;
  claimTimeout(
    dispatch: ClientToolDispatchIdentity,
    output: ClientToolOutputEnvelope,
  ): Promise<ClientToolDispatchSnapshot | undefined>;
  claimAbort(
    dispatch: ClientToolDispatchIdentity,
    output: ClientToolOutputEnvelope,
  ): Promise<ClientToolDispatchSnapshot | undefined>;
}
