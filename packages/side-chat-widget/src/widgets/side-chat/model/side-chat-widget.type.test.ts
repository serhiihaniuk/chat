import { describe, expectTypeOf, it } from "vitest";

import type { HostBridge } from "@side-chat/host-bridge";
import type { SideChatApiClient } from "#entities/conversation";
import type { SideChatWidgetProps } from "./side-chat-widget.types.js";

describe("side chat widget public props", () => {
  it("expose client and host bridge seams without service internals", () => {
    expectTypeOf<SideChatWidgetProps["client"]>().toEqualTypeOf<SideChatApiClient>();
    expectTypeOf<NonNullable<SideChatWidgetProps["hostBridge"]>>().toEqualTypeOf<
      Pick<HostBridge, "getContext" | "dispatchCommand">
    >();
  });
});
