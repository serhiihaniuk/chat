import { Effect, Stream } from "effect";
import { describe, expect, it } from "vitest";

import { createPartnerAiCoreLayer, partnerAiCoreServicesEffect } from "./effect-runtime.js";

describe("partner AI core Effect runtime layer", () => {
  it("provides typed core services through Effect v4 layers", async () => {
    const layer = createPartnerAiCoreLayer({
      conversations: {
        ensureConversation: () => Effect.fail(new Error("unused")),
        appendUserMessage: () => Effect.succeed(undefined),
      },
      runtime: {
        streamEffect: () => Stream.empty,
      },
      clock: { now: () => "2026-05-23T00:00:00.000Z" },
      ids: {
        nextConversationId: () => "conversation-1",
        nextAssistantTurnId: () => "turn-1",
        nextEventId: () => "event-1",
      },
      policies: { evaluate: () => Effect.succeed({ allowed: true }) },
      observability: { record: () => Effect.succeed(undefined) },
    });

    const services = await Effect.runPromise(Effect.provide(partnerAiCoreServicesEffect, layer));

    expect(services.clock.now()).toBe("2026-05-23T00:00:00.000Z");
    expect(services.ids.nextEventId()).toBe("event-1");
  });
});
