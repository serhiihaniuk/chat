import { describe, expectTypeOf, it } from "vitest";

import type { RuntimeEvent } from "./events.js";
import type { AssistantProvider } from "./provider.js";

describe("agent runtime public provider types", () => {
  it("preserve normalized runtime events at the provider boundary", () => {
    expectTypeOf<ReturnType<AssistantProvider["stream"]>>().toEqualTypeOf<
      AsyncIterable<RuntimeEvent>
    >();
    expectTypeOf<
      Extract<RuntimeEvent, { type: "response.output_text.delta" }>
    >().toEqualTypeOf<never>();
  });
});
