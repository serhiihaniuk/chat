import { describe, expect, it } from "vitest";
import {
  ASSISTANT_TURN_STATUSES,
  HOST_COMMAND_RESULT_STATUSES,
  SCHEMA_ENTITY_TYPES,
  TOOL_INVOCATION_STATUSES,
  type AppendMessageCommand,
  type ConversationRecord,
  type RepositoryCommandInput,
} from "./index.js";

describe("db schema contract", () => {
  it("names the required persisted entity surfaces", () => {
    expect(SCHEMA_ENTITY_TYPES).toEqual([
      "conversation",
      "message",
      "assistant_turn",
      "context_snapshot",
      "usage_record",
      "tool_invocation",
      "host_command_result",
      "audit_event",
    ]);
  });

  it("captures lifecycles before migrations exist", () => {
    expect(ASSISTANT_TURN_STATUSES).toEqual([
      "created",
      "streaming",
      "completed",
      "failed",
      "aborted",
    ]);
    expect(TOOL_INVOCATION_STATUSES).toContain("running");
    expect(HOST_COMMAND_RESULT_STATUSES).toContain("rejected");
  });

  it("requires tenant scoped records and repository idempotency", () => {
    const conversation: ConversationRecord = {
      tenantId: "tenant_001",
      workspaceId: "workspace_001",
      conversationId: "conversation_001",
      status: "open",
      createdByUserId: "user_001",
      createdAt: "2026-05-23T13:00:00.000Z",
      updatedAt: "2026-05-23T13:00:00.000Z",
    };

    const command: AppendMessageCommand = {
      tenantId: conversation.tenantId,
      workspaceId: conversation.workspaceId,
      commandId: "command_001",
      idempotencyKey: { requestId: "request_001", operation: "append" },
      actorUserId: "user_001",
      conversationId: conversation.conversationId,
      role: "user",
      content: "Explain this dashboard.",
    };

    const accepted: RepositoryCommandInput = command;
    expect(accepted.idempotencyKey.requestId).toBe("request_001");
  });
});
