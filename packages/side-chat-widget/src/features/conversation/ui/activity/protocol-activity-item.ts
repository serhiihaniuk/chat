import { ACTIVITY_KINDS } from "@side-chat/chat-protocol";

import { SIDE_CHAT_ACTIVITY_KINDS, type SideChatActivityItem } from "#entities/activity";
import type { WidgetActivityItem } from "#entities/chat";

/** Remove protocol-only state before an activity reaches host rendering code. */
export function toProtocolSideChatActivityItem(item: WidgetActivityItem): SideChatActivityItem {
  if (item.kind === ACTIVITY_KINDS.TOOL) return toToolActivityItem(item);
  if (item.kind === ACTIVITY_KINDS.HOST_COMMAND) return toHostCommandActivityItem(item);
  if (item.kind === ACTIVITY_KINDS.PROGRESS) {
    return { ...baseFields(item), kind: SIDE_CHAT_ACTIVITY_KINDS.PROGRESS };
  }
  return { ...baseFields(item), kind: SIDE_CHAT_ACTIVITY_KINDS.REASONING };
}

function toToolActivityItem(
  item: WidgetActivityItem,
): Extract<SideChatActivityItem, { kind: "tool" }> {
  const tool = item.details?.tool;
  return {
    ...baseFields(item),
    kind: SIDE_CHAT_ACTIVITY_KINDS.TOOL,
    tool: {
      toolCallId: tool?.toolCallId,
      toolName: tool?.toolName ?? item.title,
      input: tool?.input,
      result: tool?.result,
      errorCode: tool?.errorCode,
    },
  };
}

function toHostCommandActivityItem(
  item: WidgetActivityItem,
): Extract<SideChatActivityItem, { kind: "host_command" }> {
  const hostCommand = item.details?.hostCommand;
  return {
    ...baseFields(item),
    kind: SIDE_CHAT_ACTIVITY_KINDS.HOST_COMMAND,
    hostCommand: {
      commandId: hostCommand?.commandId,
      commandName: hostCommand?.commandName ?? item.title,
      payload: hostCommand?.payload,
      result: hostCommand?.result,
    },
  };
}

function baseFields(item: WidgetActivityItem) {
  return {
    id: item.id,
    status: item.status,
    title: item.title,
    body: item.body,
  };
}
