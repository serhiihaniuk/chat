import type { SidechatRepositories } from "#repositories/contract";

export const now = "2026-05-23T13:00:00.000Z";

export const createConversation = async (repositories: SidechatRepositories, scope: string) => {
  const conversation = await repositories.createOrGetConversation({
    workspaceId: workspaceId(scope),
    subjectId: subjectId(scope),
    actorId: actorId(scope),
    conversationKey: "default",
    now,
  });
  return conversation.record;
};

export const appendUserMessage = (
  repositories: SidechatRepositories,
  scope: string,
  conversationId: string,
) =>
  repositories.appendMessage({
    workspaceId: workspaceId(scope),
    subjectId: subjectId(scope),
    conversationId,
    role: "user",
    contentText: "hello",
    metadataJson: {},
    idempotencyKey: { value: "request_1:user" },
    now,
  });

export const readConversationHistory = (
  repositories: SidechatRepositories,
  scope: string,
  conversationId: string,
) =>
  repositories.readConversationHistory({
    workspaceId: workspaceId(scope),
    subjectId: subjectId(scope),
    conversationId,
    limit: 10,
  });

/**
 * Create a conversation, user message, and a running assistant turn.
 *
 * Turn-event tests need a real turn to anchor the log to, since the event rows
 * are scoped through the turn's workspace.
 */
export const startTurn = async (repositories: SidechatRepositories, scope: string) => {
  const conversation = await createConversation(repositories, scope);
  const userMessage = await appendUserMessage(repositories, scope, conversation.conversationId);
  const turn = await repositories.startAssistantTurn({
    workspaceId: workspaceId(scope),
    subjectId: subjectId(scope),
    actorId: actorId(scope),
    requestId: "request_1",
    conversationId: conversation.conversationId,
    userMessageId: userMessage.record.messageId,
    runtimeProfile: "fake",
    systemPromptVersion: "system_v1",
    contextStrategyVersion: "context_v1",
    toolRegistryVersion: "tools_v1",
    modelProvider: "fake",
    modelId: "fake-model",
    now,
  });
  return turn.record;
};

export const workspaceId = (scope: string) => `workspace_${scope}`;
export const subjectId = (scope: string) => `subject_${scope}`;
export const actorId = (scope: string) => `actor_${scope}`;

export const closeIfNeeded = async (repositories: SidechatRepositories): Promise<void> => {
  if (hasClose(repositories)) await repositories.close();
};

const hasClose = (
  repositories: SidechatRepositories,
): repositories is SidechatRepositories & { readonly close: () => Promise<void> } =>
  "close" in repositories && typeof repositories["close"] === "function";
