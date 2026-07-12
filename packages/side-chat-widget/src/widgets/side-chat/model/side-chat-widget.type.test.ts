import { describe, expectTypeOf, it } from "vitest";

import type { WidgetHostBridge } from "@side-chat/host-bridge";
import type { SideChatApiClient } from "#entities/conversation";
import type { WorkflowChatClient } from "#entities/workflow-chat";
import type {
  ProtocolSideChatWidgetProps,
  WorkflowSideChatWidgetProps,
} from "./side-chat-widget.types.js";

describe("side chat widget public props", () => {
  it("expose client and host bridge seams without service internals", () => {
    expectTypeOf<ProtocolSideChatWidgetProps["client"]>().toEqualTypeOf<SideChatApiClient>();
    expectTypeOf<WorkflowSideChatWidgetProps["workflowChat"]>().toEqualTypeOf<WorkflowChatClient>();
    expectTypeOf<
      NonNullable<ProtocolSideChatWidgetProps["hostBridge"]>
    >().toEqualTypeOf<WidgetHostBridge>();
    expectTypeOf<WorkflowSideChatWidgetProps>().not.toHaveProperty("hostBridge");
    expectTypeOf<WorkflowSideChatWidgetProps>().not.toHaveProperty("quickActions");
  });
});
