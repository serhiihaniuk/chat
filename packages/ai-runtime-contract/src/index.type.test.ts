import { describe, expectTypeOf, it } from "vitest";
import type { Stream } from "effect";

import type {
  AiRuntimeError,
  AiRuntimeEventStream,
  AiRuntimePort,
  AiRuntimeRequest,
  RuntimeEvent,
} from "./index.js";

describe("ai runtime contract exports", () => {
  it("exposes the Effect-first runtime port through neutral contract types", () => {
    expectTypeOf<AiRuntimePort["streamEffect"]>().parameters.toEqualTypeOf<
      [request: AiRuntimeRequest]
    >();
    expectTypeOf<ReturnType<AiRuntimePort["streamEffect"]>>().toEqualTypeOf<AiRuntimeEventStream>();
    expectTypeOf<AiRuntimeEventStream>().toEqualTypeOf<
      Stream.Stream<RuntimeEvent, AiRuntimeError>
    >();
    expectTypeOf<AiRuntimeRequest>().not.toHaveProperty("profileId");
    expectTypeOf<AiRuntimeRequest>().not.toHaveProperty("systemInstructions");
    expectTypeOf<AiRuntimeRequest>().not.toHaveProperty("contextBoard");
  });
});
