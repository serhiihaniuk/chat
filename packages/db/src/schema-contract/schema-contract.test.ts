import { describe, expect, expectTypeOf, it } from "vitest";
import {
  ASSISTANT_TURN_STATUSES,
  CONVERSATION_STATUSES,
  HOST_COMMAND_RESULT_STATUSES,
  SCHEMA_ENTITY_TYPES,
  TOOL_INVOCATION_STATUSES,
  TURN_EVENT_TERMINAL_TYPES,
  TURN_EVENT_TYPES,
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
      "host_command_result",
      "audit_event",
    ]);
  });

  it("captures lifecycles before migrations exist", () => {
    expect(CONVERSATION_STATUSES).toEqual(["active", "archived", "reset"]);
    expect(ASSISTANT_TURN_STATUSES).toEqual([
      "running",
      "completed",
      "user_aborted",
      "timed_out",
      "provider_failed",
      "tool_failed",
      "persistence_failed",
    ]);
    expect(TOOL_INVOCATION_STATUSES).toEqual([
      "running",
      "completed",
      "failed",
      "cancelled",
      "skipped",
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

  it("classifies durable turn-event rows and their terminal subset", () => {
    expect(TURN_EVENT_TYPES).toEqual([
      "started",
      "delta",
      "activity",
      "completed",
      "error",
      "blocked",
      "history",
    ]);
    expect(TURN_EVENT_TERMINAL_TYPES).toEqual(["completed", "error", "blocked"]);
    expect(TURN_EVENT_TYPES).toEqual(expect.arrayContaining([...TURN_EVENT_TERMINAL_TYPES]));
  });

  it("requires workspace scoped records and repository idempotency", () => {
    const conversation: ConversationRecord = {
      workspaceId: "workspace_001",
      conversationId: "conversation_001",
      subjectId: "subject_001",
      conversationKey: "default",
      status: "active",
      createdByActorId: "actor_001",
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
