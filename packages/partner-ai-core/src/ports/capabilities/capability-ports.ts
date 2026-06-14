import type { ChatStreamRequest } from "@side-chat/chat-protocol";
import type { Effect } from "effect";
import type { AuthContext, WorkspaceRef } from "#domain/authority";
import type { HostCapabilityManifest, TurnPolicyDecision } from "#domain/capabilities";

export type HostCapabilityManifestPort = {
  readonly loadManifest: (input: {
    readonly authContext: AuthContext;
    readonly workspace: WorkspaceRef;
    readonly hostAppId: string;
  }) => Effect.Effect<HostCapabilityManifest, unknown>;
};

export type TurnPolicyResolverPort = {
  readonly resolveTurnPolicy: (input: {
    readonly authContext: AuthContext;
    readonly workspace: WorkspaceRef;
    readonly request: ChatStreamRequest;
    readonly manifest: HostCapabilityManifest;
    readonly manifestHash: string;
  }) => Effect.Effect<TurnPolicyDecision, unknown>;
};
