import { describe, expect, expectTypeOf, it } from "vitest";
import {
  ASSISTANT_TURN_STATUSES,
  CLIENT_TOOL_DISPATCH_STATES,
  CONVERSATION_STATUSES,
  HOST_COMMAND_RESULT_STATUSES,
  SCHEMA_ENTITY_TYPES,
  TOOL_INVOCATION_STATUSES,
  type ActorId,
  type CreateOrGetConversationCommand,
  type ConversationRecord,
  type RepositoryCommandInput,
  type SubjectId,
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
      "client_tool_dispatch",
      "host_command_result",
      "audit_event",
    ]);
  });

  it("captures lifecycles before migrations exist", () => {
    expect(CONVERSATION_STATUSES).toEqual(["active", "archived", "reset"]);
    expect(ASSISTANT_TURN_STATUSES).toEqual([
      "running",
      "completed",
      "failed",
      "cancelled",
      "blocked",
    ]);
    expect(TOOL_INVOCATION_STATUSES).toEqual([
      "running",
      "completed",
      "failed",
      "cancelled",
      "skipped",
    ]);
    expect(CLIENT_TOOL_DISPATCH_STATES).toEqual([
      "dispatched",
      "settled",
      "failed",
      "timed_out",
      "late",
      "aborted",
    ]);
    expect(HOST_COMMAND_RESULT_STATUSES).toEqual([
      "emitted",
      "applied",
      "rejected",
      "unsupported",
      "failed",
      "timed_out",
    ]);
  });

  it("requires workspace scoped records and repository idempotency", () => {
    const conversation: ConversationRecord = {
      workspaceId: "workspace_001",
      conversationId: "conversation_001",
      subjectId: "subject_001",
      conversationKey: "default",
      status: "active",
      createdByActorId: "actor_001",
      legalHold: false,
      createdAt: "2026-05-23T13:00:00.000Z",
      updatedAt: "2026-05-23T13:00:00.000Z",
      lastMessageAt: "2026-05-23T13:00:00.000Z",
    };

    const command: CreateOrGetConversationCommand = {
      workspaceId: conversation.workspaceId,
      subjectId: conversation.subjectId,
      actorId: "actor_001",
      conversationKey: conversation.conversationKey,
      now: "2026-05-23T13:00:00.000Z",
    };

    const accepted: RepositoryCommandInput = command;
    expect(accepted.workspaceId).toBe("workspace_001");
  });

  it("keeps persistence actor and subject identities distinct", () => {
    expectTypeOf<ActorId>().not.toEqualTypeOf<SubjectId>();
  });
});
