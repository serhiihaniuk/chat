import { describe, expectTypeOf, it } from "vitest";

import type { WidgetHostBridge } from "@side-chat/host-bridge";
import type {
  RenderActivityItem as PublicRenderActivityItem,
  SideChatActivityItem as PublicSideChatActivityItem,
} from "@side-chat/side-chat-widget";
import type { RenderActivityItem, SideChatActivityItem } from "#entities/activity";
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
    expectTypeOf<
      NonNullable<WorkflowSideChatWidgetProps["hostBridge"]>
    >().toEqualTypeOf<WidgetHostBridge>();
    expectTypeOf<WorkflowSideChatWidgetProps>().not.toHaveProperty("onConversationIdChange");
  });

  it("exports one transport-neutral activity rendering contract for both branches", () => {
    expectTypeOf<PublicSideChatActivityItem>().toEqualTypeOf<SideChatActivityItem>();
    expectTypeOf<PublicRenderActivityItem>().toEqualTypeOf<RenderActivityItem>();
    expectTypeOf<
      NonNullable<ProtocolSideChatWidgetProps["renderActivityItem"]>
    >().toEqualTypeOf<RenderActivityItem>();
    expectTypeOf<
      NonNullable<WorkflowSideChatWidgetProps["renderActivityItem"]>
    >().toEqualTypeOf<RenderActivityItem>();
    expectTypeOf<SideChatActivityItem>().not.toHaveProperty("details");
  });
});
