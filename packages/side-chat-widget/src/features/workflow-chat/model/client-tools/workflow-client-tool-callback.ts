import type { ChatOnToolCallCallback } from "ai";
import type { WidgetHostBridge } from "@side-chat/host-bridge";
import { asRecord } from "@side-chat/shared";

import type { WorkflowChatClient, WorkflowUIMessage } from "#entities/workflow-chat";
import { dispatchWorkflowClientTool } from "./workflow-client-tool-dispatch.js";

export function createWorkflowClientToolCallHandler({
  activeRunIdRef,
  clientRef,
  dispatchedToolCallIdsRef,
  hostBridgeRef,
  latestMessagesRef,
}: {
  readonly activeRunIdRef: { current: string | undefined };
  readonly clientRef: { current: WorkflowChatClient };
  readonly dispatchedToolCallIdsRef: { current: Set<string> };
  readonly hostBridgeRef: { current: WidgetHostBridge | undefined };
  readonly latestMessagesRef: { current: readonly WorkflowUIMessage[] };
}): ChatOnToolCallCallback<WorkflowUIMessage> {
  return async ({ toolCall }) => {
    if (!toolCall.dynamic) return;
    if (
      dispatchedToolCallIdsRef.current.has(toolCall.toolCallId) ||
      hasSettledToolCall(latestMessagesRef.current, toolCall.toolCallId)
    ) {
      return;
    }
    dispatchedToolCallIdsRef.current.add(toolCall.toolCallId);
    await dispatchWorkflowClientTool({
      client: clientRef.current,
      hostBridge: hostBridgeRef.current,
      runId: activeRunIdRef.current,
      toolCall,
    });
  };
}

function hasSettledToolCall(messages: readonly WorkflowUIMessage[], toolCallId: string): boolean {
  return messages.some((message) =>
    message.parts.some((part) => {
      const record = asRecord(part);
      if (record?.["toolCallId"] !== toolCallId) return false;
      return (
        record["state"] === "output-available" ||
        record["state"] === "output-error" ||
        record["state"] === "output-denied"
      );
    }),
  );
}
