import { PROTOCOL_ERROR_CODES, SIDECHAT_EVENT_TYPES } from "@side-chat/chat-protocol";
import { Deferred, Effect, Exit, Fiber } from "effect";
import { describe, expect, it } from "vitest";
import { authContext, input } from "#testing/fixtures.test-support";
import {
  createFakePorts,
  isTerminalEvent,
  TEST_TURN_LEASE,
} from "#testing/fake-ports.test-support";
import { runTurnGeneration } from "../run-turn-generation.js";
import { prepareStreamChatTurn } from "../../turn/prepare-stream-chat-turn.js";

describe("turn-generation event commit", () => {
  it("does not let interruption split a terminal append from finalization facts", async () => {
    const ports = createFakePorts({ authContext });
    await Effect.runPromise(
      Effect.gen(function* () {
        const terminalAppendStarted = yield* Deferred.make<void>();
        const releaseTerminalAppend = yield* Deferred.make<void>();
        const baseEventLog = ports.turnEventLog;
        const turnEventLog: typeof baseEventLog = {
          ...baseEventLog,
          appendEvent: (append) => {
            if (append.event.type !== SIDECHAT_EVENT_TYPES.COMPLETED) {
              return baseEventLog.appendEvent(append);
            }
            return Deferred.succeed(terminalAppendStarted, undefined).pipe(
              Effect.andThen(Deferred.await(releaseTerminalAppend)),
              Effect.andThen(Effect.suspend(() => baseEventLog.appendEvent(append))),
            );
          },
        };

        const testPorts = { ...ports, turnEventLog };
        const turn = yield* prepareStreamChatTurn(testPorts, input);
        const generation = yield* runTurnGeneration(testPorts, input, turn, TEST_TURN_LEASE).pipe(
          Effect.forkChild({ startImmediately: true }),
        );
        yield* Deferred.await(terminalAppendStarted);

        // startImmediately installs the interrupt before this parent continues;
        // the interrupter then waits for the target and its finalizers to finish.
        const interruption = yield* Fiber.interrupt(generation).pipe(
          Effect.forkChild({ startImmediately: true }),
        );

        // The interrupt must wait for the in-flight append and accumulator update
        // to finish as one commit. Before release, neither may have completed.
        expect(ports.appendedEvents.at(-1)).not.toMatchObject({
          type: SIDECHAT_EVENT_TYPES.COMPLETED,
        });
        expect(ports.completedTurns).toHaveLength(0);

        yield* Deferred.succeed(releaseTerminalAppend, undefined);
        yield* Fiber.join(interruption);
      }),
    );

    expect(ports.appendedEvents.at(-1)).toMatchObject({
      type: SIDECHAT_EVENT_TYPES.COMPLETED,
    });
    expect(ports.completedTurns).toHaveLength(1);
    expect(ports.failedTurns).toHaveLength(0);
  });

  it("does not finalize completed when the completed-event append fails", async () => {
    const ports = createFakePorts({ authContext });
    const baseEventLog = ports.turnEventLog;
    let rejectedCompletedAppend = false;
    const turnEventLog: typeof baseEventLog = {
      ...baseEventLog,
      appendEvent: (append) => {
        if (append.event.type === SIDECHAT_EVENT_TYPES.COMPLETED && !rejectedCompletedAppend) {
          rejectedCompletedAppend = true;
          return Effect.fail(new Error("completed append failed"));
        }
        return baseEventLog.appendEvent(append);
      },
    };

    const testPorts = { ...ports, turnEventLog };
    const turn = await Effect.runPromise(prepareStreamChatTurn(testPorts, input));
    const exit = await Effect.runPromiseExit(
      runTurnGeneration(testPorts, input, turn, TEST_TURN_LEASE),
    );

    expect(Exit.isFailure(exit)).toBe(true);
    expect(
      ports.appendedEvents.filter((event) => event.type === SIDECHAT_EVENT_TYPES.COMPLETED),
    ).toHaveLength(0);
    expect(ports.appendedEvents.filter(isTerminalEvent)).toEqual([
      expect.objectContaining({
        type: SIDECHAT_EVENT_TYPES.ERROR,
        code: PROTOCOL_ERROR_CODES.PROVIDER_FAILED,
      }),
    ]);
    expect(ports.completedTurns).toHaveLength(0);
    expect(ports.failedTurns).toEqual([expect.objectContaining({ status: "provider_failed" })]);
  });
});
