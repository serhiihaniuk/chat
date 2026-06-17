import { describe, expectTypeOf, it } from "vitest";

import type { SideChatApiClient, StreamChatResult } from "./side-chat-api-client.js";

describe("side chat API client public types", () => {
  it("stay browser-safe and protocol-facing", () => {
    expectTypeOf<
      SideChatApiClient["streamChat"]
    >().returns.resolves.toEqualTypeOf<StreamChatResult>();
    expectTypeOf<keyof StreamChatResult>().toEqualTypeOf<"events" | "attempt">();
  });
});
