import { describe, expectTypeOf, it } from "vitest";
import type { Effect } from "effect";
import type { LanguageModel } from "ai";

import type { RuntimeEvent } from "#runtime/contract/runtime-event";
import type { AgentRuntime } from "#runtime/agent-runtime";
import type { AgentRuntimeError } from "#runtime/contract/runtime-error";
import type { ModelProvider } from "#providers/model-provider";

describe("agent runtime public provider types", () => {
  it("keeps providers as model resolvers instead of runtime event streamers", () => {
    expectTypeOf<ReturnType<ModelProvider["resolveModel"]>>().toEqualTypeOf<
      Effect.Effect<LanguageModel, AgentRuntimeError>
    >();
    expectTypeOf<ModelProvider>().not.toHaveProperty("stream");
    expectTypeOf<ReturnType<AgentRuntime["stream"]>>().toEqualTypeOf<AsyncIterable<RuntimeEvent>>();
    expectTypeOf<
      Extract<RuntimeEvent, { type: "response.output_text.delta" }>
    >().toEqualTypeOf<never>();
  });
});
