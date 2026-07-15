import type { JsonObject } from "@side-chat/shared";

import type { AssistantTurnRecord } from "../entities.js";
import type {
  AssistantMessageId,
  AssistantTurnId,
  ConversationId,
  SubjectId,
  WorkspaceId,
} from "../ids/persistence-ids.js";
import type { RepositoryCommandEnvelope } from "../shared/command-envelope.js";

export type BindTurnRunCommand = RepositoryCommandEnvelope & {
  readonly assistantTurnId: AssistantTurnId;
  /** The durable Workflow run id; bound once, after the run starts. */
  readonly runId: string;
};

export type ClaimTurnRunCommand = BindTurnRunCommand & {
  readonly subjectId: SubjectId;
  readonly conversationId: ConversationId;
};

export type ClaimTurnRunResult = Readonly<{
  readonly record: AssistantTurnRecord;
  readonly claimed: boolean;
}>;

export type RequestTurnCancellationCommand = Readonly<{
  readonly workspaceId: WorkspaceId;
  readonly subjectId: SubjectId;
  readonly conversationId: ConversationId;
  readonly runId: string;
  readonly now: string;
}>;

export const TURN_CANCELLATION_DISPOSITIONS = {
  DELIVER: "deliver",
  ACKNOWLEDGED: "acknowledged",
} as const;

export type TurnCancellationDisposition =
  (typeof TURN_CANCELLATION_DISPOSITIONS)[keyof typeof TURN_CANCELLATION_DISPOSITIONS];

export type ResolveConversationTurnAvailabilityCommand = Readonly<{
  readonly workspaceId: WorkspaceId;
  readonly subjectId: SubjectId;
  readonly conversationId: ConversationId;
  readonly now: string;
  readonly recoveryGraceMs: number;
}>;

/** Aggregate token usage across a turn's steps, folded onto the terminal write. */
export type TurnUsageTotals = {
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly totalTokens: number;
  readonly reasoningTokens: number;
  readonly cachedInputTokens: number;
};

/** One guarded aggregate transition from product `open` to terminal. */
export type FinalizeAssistantTurnCommand = RepositoryCommandEnvelope & {
  readonly assistantTurnId: AssistantTurnId;
  readonly status: Exclude<AssistantTurnRecord["status"], "open">;
  readonly assistantMessage?:
    | Readonly<{
        messageId: AssistantMessageId;
        parts: readonly JsonObject[];
        metadataJson: JsonObject;
      }>
    | undefined;
  readonly finishReason?: string | undefined;
  readonly errorCode?: string | undefined;
  readonly usage: TurnUsageTotals;
};

/** `claimed` is false for an already-terminal replay or duplicate finalizer. */
export type FinalizeAssistantTurnResult = {
  readonly record: AssistantTurnRecord;
  readonly claimed: boolean;
};
