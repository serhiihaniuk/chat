import { SIDECHAT_EVENT_TYPES, type SidechatStreamEvent } from "@side-chat/chat-protocol";
import type { AuthContext } from "@side-chat/partner-ai-core";
import { Effect, Exit, Queue } from "effect";
import { describe, expect, it } from "vitest";

import { createInMemoryTurnEventLog } from "./in-memory-turn-event-log.js";

const AUTH_CONTEXT: AuthContext = {
  tenantId: "tenant_registry",
  workspaceId: "workspace_registry",
  subject: { subjectId: "subject_registry", userId: "user_registry" },
  actor: { subjectId: "subject_registry", userId: "user_registry" },
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

  it("settles a subscriber blocked on Queue.take when the registry shuts down", async () => {
    const log = createInMemoryTurnEventLog();
    log.registerTurn("assistant_turn_shutdown");
    const subscription = await log.subscribe({
      assistantTurnId: "assistant_turn_shutdown",
      authContext: AUTH_CONTEXT,
    });
    expect(subscription).toBeDefined();

    const takeExit = Effect.runPromiseExit(Queue.take(subscription!.events));
    await log.shutdown();

    expect(Exit.isFailure(await takeExit)).toBe(true);
    expect(log.hasTurn("assistant_turn_shutdown")).toBe(false);
  });

  it("treats an identical sequence reappend as an idempotent no-op", async () => {
    const log = createInMemoryTurnEventLog();
    const firstStarted = startedEvent("assistant_turn_retry");

    await appendEvent(log, firstStarted);
    await appendEvent(log, { ...firstStarted });

    const events = await Effect.runPromise(
      log.readEventsAfter({
        authContext: AUTH_CONTEXT,
        assistantTurnId: "assistant_turn_retry",
        after: -1,
      }),
    );
    expect(events).toEqual([firstStarted]);
  });

  it("fails when the same sequence is reappended with a conflicting payload", async () => {
    const log = createInMemoryTurnEventLog();
    const firstStarted = startedEvent("assistant_turn_conflict");
    await appendEvent(log, firstStarted);

    await expect(
      appendEvent(log, { ...firstStarted, eventId: "evt_conflicting_started" }),
    ).rejects.toThrow("already contains a different event");
  });

  it("fails when an append skips the next dense sequence", async () => {
    const log = createInMemoryTurnEventLog();
    await appendEvent(log, startedEvent("assistant_turn_gap"));

    await expect(
      appendEvent(log, {
        ...completedEvent("assistant_turn_gap"),
        eventId: "evt_assistant_turn_gap_2",
        sequence: 2,
      }),
    ).rejects.toThrow("must be the next dense sequence 1");

    const events = await Effect.runPromise(
      log.readEventsAfter({
        authContext: AUTH_CONTEXT,
        assistantTurnId: "assistant_turn_gap",
        after: -1,
      }),
    );
    expect(events.map((event) => event.sequence)).toEqual([0]);
  });

  it("refuses appends after a terminal — exactly one terminal per turn", async () => {
    // The old durable log's partial-unique index enforced this; the registry must
    // too, so an interrupt racing a completed terminal can never append a second.
    const log = createInMemoryTurnEventLog();
    await appendEvent(log, startedEvent("assistant_turn_done"));
    await appendEvent(log, completedEvent("assistant_turn_done"));

    const lateTerminal: SidechatStreamEvent = {
      ...completedEvent("assistant_turn_done"),
      type: SIDECHAT_EVENT_TYPES.ERROR,
      eventId: "evt_late",
      sequence: 2,
      code: "aborted",
      message: "late synthetic terminal",
      retryable: false,
    };
    await appendEvent(log, lateTerminal);

    const events = await Effect.runPromise(
      log.readEventsAfter({
        authContext: AUTH_CONTEXT,
        assistantTurnId: "assistant_turn_done",
        after: -1,
      }),
    );
    expect(events.map((event) => event.type)).toEqual([
      SIDECHAT_EVENT_TYPES.STARTED,
      SIDECHAT_EVENT_TYPES.COMPLETED,
    ]);
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
