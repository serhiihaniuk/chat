import type { AssistantTurnRecord, MessageRecord } from "../entities.js";
import type { ConversationId, SubjectId, WorkspaceId } from "../ids/persistence-ids.js";

export type ReadConversationHistoryCommand = {
  readonly workspaceId: WorkspaceId;
  readonly subjectId: SubjectId;
  readonly conversationId: ConversationId;
  readonly limit: number;
  readonly afterSequenceIndex?: number | undefined;
  readonly beforeSequenceIndex?: number | undefined;
};

export type ReadConversationSnapshotCommand = Omit<
  ReadConversationHistoryCommand,
  "afterSequenceIndex" | "beforeSequenceIndex"
>;

export type ConversationSnapshotRecord = Readonly<{
  messages: readonly MessageRecord[];
  activeTurn?: AssistantTurnRecord | undefined;
}>;

export type ListConversationsCommand = {
  readonly workspaceId: WorkspaceId;
  readonly subjectId: SubjectId;
  readonly limit: number;
};

export type FindConversationCommand = {
  readonly workspaceId: WorkspaceId;
  readonly subjectId: SubjectId;
  readonly conversationId: ConversationId;
};
