import type {
  ActivityDetails,
  ActivityKind,
  ActivityStatus,
  ChatRequestMessage,
  UsageMetadata,
} from "@side-chat/chat-protocol";
import type { AuthContext, WorkspaceRef } from "#domain/authority";

export type ClockPort = {
  readonly now: () => string;
};

export type IdGeneratorPort = {
  readonly nextConversationId: () => string;
  readonly nextAssistantTurnId: () => string;
  readonly nextEventId: () => string;
};

export type ConversationRef = WorkspaceRef & {
  readonly conversationId: string;
};

export type ConversationRepositoryPort = {
  readonly ensureConversation: (input: {
    readonly authContext: AuthContext;
    readonly requestedConversationId?: string;
    readonly fallbackConversationId: string;
  }) => Promise<ConversationRef>;
  readonly appendUserMessage: (input: {
    readonly authContext: AuthContext;
    readonly conversationId: string;
    readonly message: ChatRequestMessage;
  }) => Promise<void>;
};

export type RuntimeMessage = {
  readonly role: "user" | "assistant" | "system";
  readonly content: string;
};

export type RuntimeRequest = {
  readonly requestId: string;
  readonly assistantTurnId: string;
  readonly providerId: string;
  readonly modelId: string;
  readonly messages: readonly RuntimeMessage[];
};

export type RuntimeEventBase = {
  readonly requestId: string;
  readonly assistantTurnId: string;
  readonly sequence: number;
};

export type RuntimeStartedEvent = RuntimeEventBase & {
  readonly type: "runtime.started";
  readonly providerId: string;
  readonly modelId: string;
};

export type RuntimeOutputDeltaEvent = RuntimeEventBase & {
  readonly type: "runtime.output_delta";
  readonly content: string;
};

export type RuntimeActivityEvent = RuntimeEventBase & {
  readonly type: "runtime.activity";
  readonly activityId: string;
  readonly activityKind: ActivityKind;
  readonly status: ActivityStatus;
  readonly title: string;
  readonly body?: string;
  readonly details?: ActivityDetails;
};

export type RuntimeCompletedEvent = RuntimeEventBase & {
  readonly type: "runtime.completed";
  readonly finishReason: "stop" | "length" | "aborted";
  readonly usage?: UsageMetadata;
};

export type RuntimeErrorEvent = RuntimeEventBase & {
  readonly type: "runtime.error";
  readonly code: string;
  readonly message: string;
  readonly retryable: boolean;
};

export type RuntimeEvent =
  | RuntimeStartedEvent
  | RuntimeOutputDeltaEvent
  | RuntimeActivityEvent
  | RuntimeCompletedEvent
  | RuntimeErrorEvent;

export type AgentRuntimePort = {
  readonly stream: (request: RuntimeRequest) => AsyncIterable<RuntimeEvent>;
};
