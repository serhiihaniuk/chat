import {
  PROTOCOL_ERROR_CODES,
  SIDECHAT_EVENT_TYPES,
  type SidechatStreamEvent,
} from "@side-chat/chat-protocol";
import { Effect, Exit, Ref } from "effect";
import { describe, expect, it } from "vitest";

import { PARTNER_AI_CORE_ERROR_CODES, PartnerAiCoreError } from "#errors";
import { prepareStreamChatTurn } from "#application/stream-chat/turn/prepare-stream-chat-turn";
import { createProtocolEventAccumulator } from "#application/stream-chat/protocol/finalization/protocol-event-accumulator";
import { finalizeTurnGeneration } from "#application/stream-chat/protocol/finalization/finalize-turn-generation";
import { input } from "#testing/stream-chat/fixtures.test-support";
import { createFakePorts } from "#testing/stream-chat/fake-ports.test-support";

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

type FinalizeResult = {
  readonly terminals: readonly SidechatStreamEvent[];
};

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
