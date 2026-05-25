import { describe, expectTypeOf, it } from "vitest";

import type { ChatClient, StreamChatResult } from "./client.js";

describe("chat client public API types", () => {
  it("stay browser-safe and protocol-facing", () => {
    expectTypeOf<ChatClient["streamChat"]>().returns.resolves.toEqualTypeOf<StreamChatResult>();
    expectTypeOf<keyof StreamChatResult>().toEqualTypeOf<"events" | "attempt">();
  });
});
