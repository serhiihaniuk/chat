import { asRecord } from "@side-chat/shared";

import type { WorkflowUIMessage } from "#entities/workflow-chat";
import type { WorkflowClientToolCall } from "./workflow-client-tool-dispatch.js";

/** Extract ready, browser-executed tool calls from one native message projection. */
export function readWorkflowClientToolCalls(
  message: WorkflowUIMessage,
): readonly WorkflowClientToolCall[] {
  const calls: WorkflowClientToolCall[] = [];
  for (const part of message.parts) {
    const record = asRecord(part);
    const toolCallId = stringField(record, "toolCallId");
    const state = stringField(record, "state");
    if (!toolCallId || state !== "input-available" || record?.["providerExecuted"] === true) {
      continue;
    }
    const toolName = readToolName(record);
    if (!toolName) continue;
    calls.push({ input: record?.["input"], toolCallId, toolName });
  }
  return calls;
}

function readToolName(record: Readonly<Record<string, unknown>> | undefined): string | undefined {
  const dynamicName = stringField(record, "toolName");
  if (dynamicName) return dynamicName;
  const type = stringField(record, "type");
  return type?.startsWith("tool-") === true ? type.slice("tool-".length) : undefined;
}

function stringField(
  record: Readonly<Record<string, unknown>> | undefined,
  key: string,
): string | undefined {
  const value = record?.[key];
  return typeof value === "string" ? value : undefined;
}
