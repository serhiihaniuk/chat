import type { ProtocolErrorCode } from "@side-chat/chat-protocol";
import type { Effect } from "effect";
import type { AuthContext, WorkspaceRef } from "#domain/authority";

export type TurnGuardInput = {
  readonly authContext: AuthContext;
  readonly workspace: WorkspaceRef;
  readonly requestId: string;
  readonly userMessage: string;
  readonly hostAppId: string;
  readonly profileId: string;
  readonly safetyPolicyId: string;
  readonly abortSignal?: AbortSignal | undefined;
};

export type TurnGuardDecision =
  | { readonly kind: "allow" }
  | {
      readonly kind: "allow_with_warning";
      readonly warning: string;
    }
  | {
      readonly kind: "block";
      readonly publicReason: string;
      readonly internalReason: string;
      readonly errorCode: ProtocolErrorCode;
    };

/**
 * Pre-context safety check for one assistant turn.
 *
 * Source input is intentionally smaller than StreamChatInput: guards see the
 * user text, authority, selected profile, and safety policy, but not prepared
 * context, RAG, memory, or runtime tools.
 */
export type TurnGuard = {
  readonly guardId: string;
  readonly description: string;
  readonly check: (input: TurnGuardInput) => Effect.Effect<TurnGuardDecision, unknown>;
};

export type TurnGuardRegistryPort = {
  readonly guards: readonly TurnGuard[];
};
