import { SIDECHAT_EVENT_TYPES, type SidechatStreamEvent } from "@side-chat/chat-protocol";
import type { AuthContext } from "@side-chat/partner-ai-core";
import { Effect, Queue } from "effect";
import { describe, expect, it } from "vitest";

import { createInMemoryTurnEventLog } from "./in-memory-turn-event-log.js";

const AUTH_CONTEXT: AuthContext = {
  tenantId: "tenant_registry",
  workspaceId: "workspace_registry",
  subject: { subjectId: "subject_registry", userId: "user_registry" },
  actor: { subjectId: "subject_registry", userId: "user_registry" },
  roles: ["member"],
  scopes: ["conversation:read"],
  source: "test_authority",
  issuedAt: "2026-07-02T00:00:00.000Z",
};

const baseEvent = {
  protocolVersion: "sidechat.v1",
  createdAt: "2026-07-02T00:00:00.000Z",
} as const;

const startedEvent = (assistantTurnId: string): SidechatStreamEvent => ({
  ...baseEvent,
  assistantTurnId,
  type: SIDECHAT_EVENT_TYPES.STARTED,
  eventId: `evt_${assistantTurnId}_0`,
  sequence: 0,
});

const completedEvent = (assistantTurnId: string): SidechatStreamEvent => ({
  ...baseEvent,
  assistantTurnId,
  type: SIDECHAT_EVENT_TYPES.COMPLETED,
  eventId: `evt_${assistantTurnId}_1`,
  sequence: 1,
  finishReason: "stop",
});

const appendEvent = (
  log: ReturnType<typeof createInMemoryTurnEventLog>,
  event: SidechatStreamEvent,
): Promise<void> =>
  Effect.runPromise(
    log.appendEvent({
      authContext: AUTH_CONTEXT,
      assistantTurnId: event.assistantTurnId,
      event,
    }),
  );

describe("createInMemoryTurnEventLog", () => {
  it("resolves a typed miss for an unknown turn and leaves the registry unchanged", async () => {
    const log = createInMemoryTurnEventLog();

    const subscription = await log.subscribe({
      assistantTurnId: "assistant_turn_foreign",
      authContext: AUTH_CONTEXT,
    });

    expect(subscription).toBeUndefined();
    expect(log.hasTurn("assistant_turn_foreign")).toBe(false);
    expect(log.hasSubscribers("assistant_turn_foreign")).toBe(false);
  });

  it("fans out appends to a subscriber on an owner-registered turn", async () => {
    const log = createInMemoryTurnEventLog();
    log.registerTurn("assistant_turn_owned");

    const subscription = await log.subscribe({
      assistantTurnId: "assistant_turn_owned",
      authContext: AUTH_CONTEXT,
    });
    expect(subscription).toBeDefined();
    expect(log.hasSubscribers("assistant_turn_owned")).toBe(true);

    await appendEvent(log, startedEvent("assistant_turn_owned"));
    const fannedOut = await Effect.runPromise(Queue.take(subscription!.events));
    expect(fannedOut).toMatchObject({ type: SIDECHAT_EVENT_TYPES.STARTED, sequence: 0 });

    await subscription!.release();
    expect(log.hasSubscribers("assistant_turn_owned")).toBe(false);
  });

  it("sweeps a finished unwatched turn when the next turn registers", async () => {
    const log = createInMemoryTurnEventLog();
    await appendEvent(log, startedEvent("assistant_turn_done"));
    await appendEvent(log, completedEvent("assistant_turn_done"));
    expect(log.hasTurn("assistant_turn_done")).toBe(true);

    log.registerTurn("assistant_turn_next");

    expect(log.hasTurn("assistant_turn_done")).toBe(false);
    expect(log.hasTurn("assistant_turn_next")).toBe(true);
  });
});
