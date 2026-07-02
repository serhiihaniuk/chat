import {
  SIDECHAT_PROTOCOL_VERSION,
  type CompletedEvent,
  type DeltaEvent,
  type SidechatStreamEvent,
  type StartedEvent,
} from "@side-chat/chat-protocol";
import type { AuthContext } from "@side-chat/partner-ai-core";
import { Effect, Queue, Stream } from "effect";
import { describe, expect, it } from "vitest";

import type { TurnEventDispatcher } from "./turn-event-dispatcher.js";
import { createTurnSubscriptionStream, type TurnStreamPorts } from "./turn-subscription-stream.js";

const TURN_ID = "assistant_turn_gap";

const AUTH_CONTEXT: AuthContext = {
  tenantId: "tenant_gap",
  workspaceId: "workspace_gap",
  subject: { subjectId: "subject_gap", userId: "user_gap" },
  actor: { subjectId: "subject_gap", userId: "user_gap" },
  roles: ["member"],
  scopes: ["conversation:read"],
  source: "test_authority",
  issuedAt: "2026-07-02T00:00:00.000Z",
};

const base = (sequence: number) => ({
  protocolVersion: SIDECHAT_PROTOCOL_VERSION,
  eventId: `evt-${sequence}`,
  assistantTurnId: TURN_ID,
  sequence,
  createdAt: "2026-07-02T00:00:00.000Z",
});

const started = (): StartedEvent => ({
  ...base(0),
  type: "sidechat.started",
  conversationId: "conversation_gap",
});

const delta = (sequence: number, content: string): DeltaEvent => ({
  ...base(sequence),
  type: "sidechat.delta",
  content,
});

const completed = (sequence: number): CompletedEvent => ({
  ...base(sequence),
  type: "sidechat.completed",
  finishReason: "stop",
});

/** A live turn's buffer (mutable: the test appends as generation progresses). */
type Harness = {
  readonly log: SidechatStreamEvent[];
  readonly queue: Queue.Queue<SidechatStreamEvent>;
  readonly ports: TurnStreamPorts;
  readonly dispatcher: TurnEventDispatcher;
};

const createHarness = (initial: readonly SidechatStreamEvent[]): Harness => {
  const log = [...initial];
  const queue = Effect.runSync(Queue.unbounded<SidechatStreamEvent>());
  const ports: TurnStreamPorts = {
    turnEventLog: {
      appendEvent: () => Effect.void,
      readEventsAfter: ({ after }) => Effect.succeed(log.filter((event) => event.sequence > after)),
      maxSequence: () => Effect.succeed(log.at(-1)?.sequence),
    },
    clock: { now: () => "2026-07-02T00:00:00.000Z" },
    observability: undefined,
  };
  const dispatcher: TurnEventDispatcher = {
    subscribe: () => Promise.resolve({ events: queue, release: () => Promise.resolve() }),
    registerTurn: () => undefined,
    hasTurn: () => true,
    shutdown: () => Promise.resolve(),
  };
  return { log, queue, ports, dispatcher };
};

const collectStream = (
  harness: Harness,
  safetyPollIntervalMs: number,
): Promise<readonly SidechatStreamEvent[]> =>
  Effect.runPromise(
    Stream.runCollect(
      createTurnSubscriptionStream(
        { dispatcher: harness.dispatcher, ports: harness.ports, safetyPollIntervalMs },
        { assistantTurnId: TURN_ID, authContext: AUTH_CONTEXT, after: -1 },
      ),
    ),
  );

const tick = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 20));

describe("createTurnSubscriptionStream dense gate", () => {
  it("heals a dropped fan-out offer by re-reading the log — no permanent hole", async () => {
    // Replay serves 0..1; the fan-out then DROPS sequence 2 (a slow consumer's
    // full queue) and delivers 3. A max-based gate would skip 2 forever; the
    // dense gate must re-read the buffer and emit every sequence in order.
    const harness = createHarness([started(), delta(1, "Hel")]);
    const pending = collectStream(harness, 60_000);
    await tick();

    harness.log.push(delta(2, "lo "), delta(3, "world"), completed(4));
    Queue.offerUnsafe(harness.queue, delta(3, "world"));

    const events = await pending;
    expect(events.map((event) => event.sequence)).toEqual([0, 1, 2, 3, 4]);
  });

  it("heals via the safety poll when the fan-out delivers nothing at all", async () => {
    const harness = createHarness([started(), delta(1, "Hel")]);
    const pending = collectStream(harness, 10);
    await tick();

    // Generation continues but every fan-out offer is lost.
    harness.log.push(delta(2, "lo"), completed(3));

    const events = await pending;
    expect(events.map((event) => event.sequence)).toEqual([0, 1, 2, 3]);
  });

  it("never advances past a gap it could not heal (poll retries the same gap)", async () => {
    // The fan-out delivers 5 while the log only holds 0..1 (an inconsistent
    // spurious signal): the re-read returns the same prefix, the mark must stay
    // at 1, and the eventual real events still arrive densely via the poll.
    const harness = createHarness([started(), delta(1, "Hel")]);
    const pending = collectStream(harness, 10);
    await tick();

    Queue.offerUnsafe(harness.queue, delta(5, "phantom"));
    await tick();
    harness.log.push(delta(2, "lo"), completed(3));

    const events = await pending;
    expect(events.map((event) => event.sequence)).toEqual([0, 1, 2, 3]);
  });
});
