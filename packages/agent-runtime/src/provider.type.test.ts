import { describe, expectTypeOf, it } from "vitest";
import type { Effect } from "effect";
import type { LanguageModel } from "ai";
import type {
  AiRuntimeError,
  AiRuntimeEventStream,
  RuntimeEvent,
} from "@side-chat/ai-runtime-contract";

import type { AgentExecutionRequest, AgentExecutor, AgentRuntime } from "#runtime/agent-runtime";
import type { ModelProvider } from "#providers/model-provider";

describe("agent runtime public provider types", () => {
  it("keeps providers as model resolvers instead of runtime event streamers", () => {
    expectTypeOf<ReturnType<ModelProvider["resolveModel"]>>().toEqualTypeOf<
      Effect.Effect<LanguageModel, AiRuntimeError>
    >();
    expectTypeOf<ModelProvider>().not.toHaveProperty("stream");
    expectTypeOf<ReturnType<AgentExecutor["stream"]>>().toEqualTypeOf<AiRuntimeEventStream>();
    expectTypeOf<AgentExecutionRequest["model"]>().toEqualTypeOf<unknown>();
    expectTypeOf<ReturnType<AgentRuntime["streamEffect"]>>().toEqualTypeOf<AiRuntimeEventStream>();
    expectTypeOf<
      Extract<RuntimeEvent, { type: "response.output_text.delta" }>
    >().toEqualTypeOf<never>();
  });
});
