import { Effect, Exit, Ref } from "effect";
import { describe, expect, it } from "vitest";

import { createFakePorts } from "#testing/fake-ports.test-support";
import { authContext, input } from "#testing/fixtures.test-support";
import type { StreamChatPorts } from "../../stream-chat-types.js";
import { prepareStreamChatTurn } from "../../turn/prepare-stream-chat-turn.js";
import { drainUnderOwnerLease, type TurnLeaseSettings } from "./turn-lease-heartbeat.js";

const LEASE: TurnLeaseSettings = {
  instanceId: "instance_test",
  leaseTtlMs: 1_000,
  heartbeatIntervalMs: 5,
};

type RenewOutcome = { readonly renewed: boolean } | "fail";

/** The full fake port set with a scripted renew: one outcome per heartbeat call. */
const portsWithRenews = (renewOutcomes: readonly RenewOutcome[]): StreamChatPorts => {
  const fake = createFakePorts({ authContext });
  let renewCall = 0;
  return {
    ...fake,
    assistantTurns: {
      ...fake.assistantTurns,
      renewTurnLease: () => {
        const outcome = renewOutcomes[Math.min(renewCall++, renewOutcomes.length - 1)] ?? "fail";
        return outcome === "fail"
          ? Effect.fail(new Error("transient db blip"))
          : Effect.succeed(outcome);
      },
    },
  };
};

describe("drainUnderOwnerLease", () => {
  it("survives a transient renew failure without interrupting a healthy drain", async () => {
    const drained = await Effect.runPromise(Ref.make(false));
    // The first heartbeat renew fails; the retry policy must absorb it so the
    // raced drain still runs to completion instead of being interrupted.
    const ports = portsWithRenews(["fail", { renewed: true }]);
    const turn = await Effect.runPromise(prepareStreamChatTurn(ports, input));
    const drain = Effect.sleep(40).pipe(Effect.andThen(Ref.set(drained, true)));

    const exit = await Effect.runPromiseExit(drainUnderOwnerLease(ports, LEASE, turn, drain));

    expect(Exit.isSuccess(exit)).toBe(true);
    expect(await Effect.runPromise(Ref.get(drained))).toBe(true);
  });

  it("still fences immediately when a successful renew reports the lease lost", async () => {
    const drained = await Effect.runPromise(Ref.make(false));
    const ports = portsWithRenews([{ renewed: false }]);
    const turn = await Effect.runPromise(prepareStreamChatTurn(ports, input));
    const drain = Effect.sleep(2_000).pipe(Effect.andThen(Ref.set(drained, true)));

    const exit = await Effect.runPromiseExit(drainUnderOwnerLease(ports, LEASE, turn, drain));

    // The fence interrupts the drain long before its 2s sleep completes.
    expect(Exit.isSuccess(exit)).toBe(false);
    expect(await Effect.runPromise(Ref.get(drained))).toBe(false);
  });
});
