import { describe, expectTypeOf, it } from "vitest";

import type {
  CreateRunResult,
  SideChatApiClient,
  SubscribeTurnResult,
} from "./side-chat-api-client.js";

describe("side chat API client public types", () => {
  it("stay browser-safe and protocol-facing", () => {
    expectTypeOf<
      SideChatApiClient["createRun"]
    >().returns.resolves.toEqualTypeOf<CreateRunResult>();
    expectTypeOf<
      SideChatApiClient["subscribeTurn"]
    >().returns.resolves.toEqualTypeOf<SubscribeTurnResult>();
    expectTypeOf<keyof SubscribeTurnResult>().toEqualTypeOf<"events">();
  });
});
