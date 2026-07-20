import type { DurableActorRef, ServerToolInvocation } from "@side-chat/side-chat-server";

type InvocationRequest = Readonly<{
  conversationId: string;
  turnId: string;
  runId: string;
}>;

type ApprovalIdentityRequest = InvocationRequest &
  Readonly<{
    actor: DurableActorRef;
    toolCallId: string;
    toolName: string;
  }>;

export function approvalIdentity(request: ApprovalIdentityRequest, approvalId: string) {
  return {
    workspaceId: request.actor.workspaceId,
    subjectId: request.actor.subjectId,
    conversationId: request.conversationId,
    turnId: request.turnId,
    runId: request.runId,
    approvalId,
    toolCallId: request.toolCallId,
    toolName: request.toolName,
  };
}

export function serverToolInvocation(
  request: InvocationRequest,
  toolCallId: string,
): ServerToolInvocation {
  return {
    conversationId: request.conversationId,
    turnId: request.turnId,
    runId: request.runId,
    toolCallId,
  };
}

export function serverToolExecutionKey(turnId: string, toolCallId: string, digest: string): string {
  return `${turnId}:${toolCallId}:${digest}`;
}
