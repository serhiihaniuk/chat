import {
  PROTOCOL_ERROR_CODES,
  SIDECHAT_EVENT_TYPES,
  type SidechatStreamEvent,
} from "@side-chat/chat-protocol";
import { Effect, Exit, Ref } from "effect";
import { describe, expect, it } from "vitest";

import { PARTNER_AI_CORE_ERROR_CODES, PartnerAiCoreError } from "#errors";
import { prepareStreamChatTurn } from "#application/stream-chat/turn/prepare-stream-chat-turn";
import {
  createProtocolEventAccumulator,
  recordProtocolEvent,
  type ProtocolEventAccumulator,
} from "#application/stream-chat/protocol/finalization/protocol-event-accumulator";
import { finalizeTurnGeneration } from "#application/stream-chat/protocol/finalization/finalize-turn-generation";
import { input } from "#testing/fixtures.test-support";
import { createFakePorts } from "#testing/fake-ports.test-support";

// The abnormal finalizer owns exactly one synthetic terminal and one durable
// status, classified honestly from the exit cause plus durable cancel intent.
// These tests drive it directly with crafted exits so each branch is unambiguous.
describe("abnormal turn finalization", () => {
  it("classifies an interrupt with durable cancel intent as user_aborted", async () => {
    const ports = createFakePorts({
      turnControlState: { status: "running", cancelRequested: true },
    });
    const finalized = await runAbnormalFinalize(ports, Exit.interrupt(1));

    // One aborted terminal at maxSequence+1 (no prior events -> sequence 0).
    expect(finalized.terminals).toHaveLength(1);
    expect(finalized.terminals[0]).toMatchObject({
      type: SIDECHAT_EVENT_TYPES.ERROR,
      code: PROTOCOL_ERROR_CODES.ABORTED,
      sequence: 0,
    });
    expect(ports.failedTurns).toHaveLength(1);
    expect(ports.failedTurns[0]).toMatchObject({
      status: "user_aborted",
      errorCode: PROTOCOL_ERROR_CODES.ABORTED,
    });
  });

  it("classifies an interrupt without cancel intent as a non-user provider failure", async () => {
    // No cancel was requested, so this is a shutdown/fence stop, not a user abort.
    const ports = createFakePorts({
      turnControlState: { status: "running", cancelRequested: false },
    });
    const finalized = await runAbnormalFinalize(ports, Exit.interrupt(1));

    expect(finalized.terminals[0]).toMatchObject({
      type: SIDECHAT_EVENT_TYPES.ERROR,
      code: PROTOCOL_ERROR_CODES.TIMEOUT,
    });
    expect(ports.failedTurns[0]).toMatchObject({
      status: "provider_failed",
      errorCode: PROTOCOL_ERROR_CODES.TIMEOUT,
    });
  });

  it("classifies a non-interrupt defect as provider_failed", async () => {
    const ports = createFakePorts();
    const finalized = await runAbnormalFinalize(
      ports,
      Exit.die(new Error("event-log append blew up")),
    );

    expect(finalized.terminals[0]).toMatchObject({
      type: SIDECHAT_EVENT_TYPES.ERROR,
      code: PROTOCOL_ERROR_CODES.PROVIDER_FAILED,
    });
    expect(ports.failedTurns[0]).toMatchObject({
      status: "provider_failed",
      errorCode: PROTOCOL_ERROR_CODES.PROVIDER_FAILED,
    });
  });

  it("classifies a typed failure cause as provider_failed", async () => {
    const ports = createFakePorts();
    const failure = Exit.fail(
      new PartnerAiCoreError(
        PARTNER_AI_CORE_ERROR_CODES.PERSISTENCE_FAILED,
        "append failed",
        PROTOCOL_ERROR_CODES.INTERNAL_ERROR,
      ),
    );
    await runAbnormalFinalize(ports, failure);

    expect(ports.failedTurns[0]).toMatchObject({ status: "provider_failed" });
  });

  it("skips the durable status write once a real terminal already won the running-guard", async () => {
    // A completed turn means the normal terminal already transitioned the status,
    // so the abnormal path must not attempt a second status write.
    const ports = createFakePorts({
      turnControlState: { status: "completed", cancelRequested: false },
    });
    const finalized = await runAbnormalFinalize(ports, Exit.interrupt(1));

    // The synthetic terminal append still runs (idempotent on the unique index),
    // but no durable failure is written over the won terminal.
    expect(finalized.terminals).toHaveLength(1);
    expect(ports.failedTurns).toHaveLength(0);
  });
});

// The event log must always END with a terminal, on every exit shape — a stream
// that just stops, or an interrupt racing the stream's own terminal.
describe("terminal guarantees across exit shapes", () => {
  it("appends a synthetic terminal when a successful drain carried no terminal", async () => {
    // The provider stream ended cleanly without completed/error/blocked. Tailing
    // subscribers must still see a terminal, and the status must be failed.
    const ports = createFakePorts();
    const state = accumulatorWith([startedEvent(0), deltaEvent(1, "partial ")]);

    const exit = await runFinalize(ports, Exit.succeed(undefined), state);

    expect(Exit.isSuccess(exit)).toBe(false);
    const terminals = ports.appendedEvents.filter(
      (event) => event.type === SIDECHAT_EVENT_TYPES.ERROR,
    );
    expect(terminals).toHaveLength(1);
    expect(terminals[0]).toMatchObject({ code: PROTOCOL_ERROR_CODES.PROVIDER_FAILED });
    expect(ports.failedTurns).toHaveLength(1);
    expect(ports.completedTurns).toHaveLength(0);
  });

  it("lets a completed stream beat a late interrupt: no second terminal, message persisted", async () => {
    // The user watched the answer complete; the interrupt landed a beat later.
    // The stream's terminal wins: the turn persists as completed with its
    // assistant message, and no synthetic aborted terminal is appended.
    const ports = createFakePorts({
      turnControlState: { status: "running", cancelRequested: true },
    });
    const state = accumulatorWith([
      startedEvent(0),
      deltaEvent(1, "The answer."),
      completedEvent(2),
    ]);

    const exit = await runFinalize(ports, Exit.interrupt(1), state);

    expect(Exit.isSuccess(exit)).toBe(true);
    expect(
      ports.appendedEvents.filter((event) => event.type === SIDECHAT_EVENT_TYPES.ERROR),
    ).toHaveLength(0);
    expect(ports.failedTurns).toHaveLength(0);
    expect(ports.completedTurns).toHaveLength(1);
    expect(ports.completedTurns[0]).toMatchObject({ assistantContent: "The answer." });
  });
});

const startedEvent = (sequence: number): SidechatStreamEvent => ({
  protocolVersion: "sidechat.v1",
  type: SIDECHAT_EVENT_TYPES.STARTED,
  eventId: `evt-${sequence}`,
  assistantTurnId: "assistant_turn_001",
  sequence,
  createdAt: "2026-07-02T00:00:00.000Z",
  conversationId: "conversation_001",
});

const deltaEvent = (sequence: number, content: string): SidechatStreamEvent => ({
  protocolVersion: "sidechat.v1",
  type: SIDECHAT_EVENT_TYPES.DELTA,
  eventId: `evt-${sequence}`,
  assistantTurnId: "assistant_turn_001",
  sequence,
  createdAt: "2026-07-02T00:00:01.000Z",
  content,
});

const completedEvent = (sequence: number): SidechatStreamEvent => ({
  protocolVersion: "sidechat.v1",
  type: SIDECHAT_EVENT_TYPES.COMPLETED,
  eventId: `evt-${sequence}`,
  assistantTurnId: "assistant_turn_001",
  sequence,
  createdAt: "2026-07-02T00:00:02.000Z",
  finishReason: "stop",
});

const accumulatorWith = (events: readonly SidechatStreamEvent[]): ProtocolEventAccumulator =>
  events.reduce(recordProtocolEvent, createProtocolEventAccumulator());

type FinalizeResult = {
  readonly terminals: readonly SidechatStreamEvent[];
};

const runFinalize = (
  ports: ReturnType<typeof createFakePorts>,
  exit: Exit.Exit<unknown, PartnerAiCoreError>,
  state: ProtocolEventAccumulator = createProtocolEventAccumulator(),
): Promise<Exit.Exit<void, PartnerAiCoreError>> =>
  Effect.runPromise(
    Effect.gen(function* () {
      const turn = yield* prepareStreamChatTurn(ports, input);
      const accumulator = yield* Ref.make(state);
      return yield* Effect.exit(finalizeTurnGeneration(ports, input, turn, accumulator, exit));
    }),
  );

const runAbnormalFinalize = (
  ports: ReturnType<typeof createFakePorts>,
  exit: Exit.Exit<unknown, PartnerAiCoreError>,
): Promise<FinalizeResult> =>
  Effect.runPromise(
    Effect.gen(function* () {
      const turn = yield* prepareStreamChatTurn(ports, input);
      const accumulator = yield* Ref.make(createProtocolEventAccumulator());
      yield* finalizeTurnGeneration(ports, input, turn, accumulator, exit);
      return {
        terminals: ports.appendedEvents.filter(
          (event) => event.type === SIDECHAT_EVENT_TYPES.ERROR,
        ),
      };
    }),
  );
