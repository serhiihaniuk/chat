import { describe, expectTypeOf, it } from "vitest";

import type { DeltaEvent, SidechatStreamEvent } from "./event-union.js";

describe("sidechat.v1 event public types", () => {
  it("preserve discriminated protocol unions", () => {
    expectTypeOf<
      Extract<SidechatStreamEvent, { type: "sidechat.delta" }>
    >().toEqualTypeOf<DeltaEvent>();
    expectTypeOf<Extract<SidechatStreamEvent, { type: "text-delta" }>>().toEqualTypeOf<never>();
  });
});
