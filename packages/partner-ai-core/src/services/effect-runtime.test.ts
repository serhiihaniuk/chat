import { Effect } from "effect";
import { describe, expect, it } from "vitest";

import {
  createPartnerAiCoreLayer,
  partnerAiCoreServicesEffect,
} from "./effect-runtime.js";

describe("partner AI core Effect runtime layer", () => {
  it("provides typed core services through Effect v4 layers", async () => {
    const layer = createPartnerAiCoreLayer({
      conversations: {
        ensureConversation: () => Promise.reject(new Error("unused")),
        appendUserMessage: () => Promise.resolve(),
      },
      runtime: { stream: async function* () {} },
      clock: { now: () => "2026-05-23T00:00:00.000Z" },
      ids: {
        nextConversationId: () => "conversation-1",
        nextAssistantTurnId: () => "turn-1",
        nextEventId: () => "event-1",
      },
      policies: { evaluate: () => Promise.resolve({ allowed: true }) },
      observability: { record: () => undefined },
    });

    const services = await Effect.runPromise(
      Effect.provide(partnerAiCoreServicesEffect, layer),
    );

    expect(services.clock.now()).toBe("2026-05-23T00:00:00.000Z");
    expect(services.ids.nextEventId()).toBe("event-1");
  });
});
