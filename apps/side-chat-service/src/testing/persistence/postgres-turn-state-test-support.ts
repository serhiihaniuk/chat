import {
  REPOSITORY_ADAPTER_KINDS,
  type AssistantTurnRecord,
  type ConversationRecord,
  type MessageRecord,
  type SidechatRepositories,
} from "@side-chat/db";

import type { AuthContext } from "#domain/auth-context";
import { TURN_MESSAGE_ROLES, type TurnMessage } from "#domain/turn/turn";

type ClosableRepositories = SidechatRepositories & {
  close: () => Promise<void>;
};

export const NOW = "2026-05-23T13:00:00.000Z";

export const AUTH: AuthContext = {
  workspaceId: "workspace_1",
  subjectId: "subject_1",
  issuedAt: NOW,
};

export const USER_MESSAGE: TurnMessage = {
  id: "user_1",
  role: TURN_MESSAGE_ROLES.USER,
  text: "Hello",
};

export const BEGIN_INPUT = {
  auth: AUTH,
  conversationId: "conversation_1",
  requestId: "request_1",
  userMessage: USER_MESSAGE,
} as const;

export const conversationRecord = (): ConversationRecord => ({
  workspaceId: AUTH.workspaceId,
  conversationId: "conversation_1",
  subjectId: AUTH.subjectId,
  conversationKey: "conversation_1",
  status: "active",
  createdByActorId: AUTH.subjectId,
  legalHold: false,
  createdAt: NOW,
  updatedAt: NOW,
  lastMessageAt: NOW,
});

export const messageRecord = (): MessageRecord => ({
  workspaceId: AUTH.workspaceId,
  messageId: "message_1",
  conversationId: "conversation_1",
  role: "user",
  parts: [],
  metadataJson: {},
  sequenceIndex: 0,
  createdAt: NOW,
  updatedAt: NOW,
});

export const assistantTurnRecord = (assistantTurnId: string): AssistantTurnRecord => ({
  workspaceId: AUTH.workspaceId,
  assistantTurnId,
  requestId: "request_1",
  conversationId: "conversation_1",
  subjectId: AUTH.subjectId,
  actorId: AUTH.subjectId,
  userMessageId: "user_1",
  modelProvider: "pending",
  modelId: "pending",
  instructionsVersion: "v1",
  configVersion: "v1",
  contentFilterVersion: "v1",
  status: "open",
  inputTokens: 0,
  outputTokens: 0,
  totalTokens: 0,
  reasoningTokens: 0,
  cachedInputTokens: 0,
  startedAt: NOW,
  createdAt: NOW,
  updatedAt: NOW,
});

const rejects = (name: string) => (): Promise<never> =>
  Promise.reject(new Error(`${name} not implemented in fake`));

/** Repositories double whose methods reject until a test supplies its collaborators. */
export const fakeRepositories = (
  overrides: Partial<ClosableRepositories>,
): ClosableRepositories => ({
  adapterKind: REPOSITORY_ADAPTER_KINDS.POSTGRES_DRIZZLE,
  close: () => Promise.resolve(),
  createOrGetConversation: rejects("createOrGetConversation"),
  appendMessage: rejects("appendMessage"),
  readConversationHistory: rejects("readConversationHistory"),
  readConversationSnapshot: rejects("readConversationSnapshot"),
  listConversations: rejects("listConversations"),
  findConversation: rejects("findConversation"),
  prepareConversationTitle: rejects("prepareConversationTitle"),
  resetConversation: rejects("resetConversation"),
  recordConversationTitleRun: rejects("recordConversationTitleRun"),
  startAssistantTurn: rejects("startAssistantTurn"),
  bindTurnRun: rejects("bindTurnRun"),
  claimTurnRun: rejects("claimTurnRun"),
  resolveConversationTurnAvailability: rejects("resolveConversationTurnAvailability"),
  requestTurnCancellation: rejects("requestTurnCancellation"),
  recordTurnContextSnapshot: rejects("recordTurnContextSnapshot"),
  finalizeAssistantTurn: rejects("finalizeAssistantTurn"),
  findAssistantTurn: rejects("findAssistantTurn"),
  findAssistantTurnByRequest: rejects("findAssistantTurnByRequest"),
  findAssistantTurnByRun: rejects("findAssistantTurnByRun"),
  findActiveAssistantTurn: rejects("findActiveAssistantTurn"),
  listActiveAssistantTurns: rejects("listActiveAssistantTurns"),
  recordUsage: rejects("recordUsage"),
  readUsageSummary: rejects("readUsageSummary"),
  createClientToolDispatch: rejects("createClientToolDispatch"),
  findClientToolDispatch: rejects("findClientToolDispatch"),
  submitClientToolOutput: rejects("submitClientToolOutput"),
  claimClientToolTimeout: rejects("claimClientToolTimeout"),
  claimClientToolAbort: rejects("claimClientToolAbort"),
  createOrGetToolApproval: rejects("createOrGetToolApproval"),
  findToolApproval: rejects("findToolApproval"),
  decideToolApproval: rejects("decideToolApproval"),
  expireToolApproval: rejects("expireToolApproval"),
  recordToolInvocation: rejects("recordToolInvocation"),
  recordHostCommandResult: rejects("recordHostCommandResult"),
  findHostCommandResult: rejects("findHostCommandResult"),
  appendAuditEvent: rejects("appendAuditEvent"),
  ...overrides,
});

export const ok = <T>(record: T) => Promise.resolve({ record, inserted: true });

/** A Postgres unique_violation carrying the constraint reported by the driver. */
export const uniqueViolation = (constraint: string): Error =>
  Object.assign(new Error("duplicate key value violates unique constraint"), {
    code: "23505",
    constraint,
  });
