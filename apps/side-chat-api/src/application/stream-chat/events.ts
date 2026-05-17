import type { SidechatStreamEvent } from "@side-chat/shared-protocol";
import type { ModelChunk } from "#ports/index.js";

export type StreamIndexes = {
  delta: number;
  reasoning: number;
  tool: number;
  hostCommand: number;
};

export const createStreamIndexes = (): StreamIndexes => ({
  delta: 0,
  reasoning: 0,
  tool: 0,
  hostCommand: 0,
});

export const createDeltaEvent = (
  requestId: string,
  assistantMessageId: string,
  chunk: Extract<ModelChunk, { kind: "delta" }>,
  indexes: StreamIndexes,
): SidechatStreamEvent => ({
  type: "sidechat.delta",
  requestId,
  messageId: assistantMessageId,
  content: chunk.text,
  index: indexes.delta++,
});

export const createReasoningEvent = (
  requestId: string,
  assistantMessageId: string,
  chunk: Extract<ModelChunk, { kind: "reasoning" }>,
  indexes: StreamIndexes,
): SidechatStreamEvent => ({
  type: "sidechat.reasoning",
  requestId,
  messageId: assistantMessageId,
  content: chunk.text,
  index: indexes.reasoning++,
});

export const createToolEvent = (
  requestId: string,
  assistantMessageId: string,
  chunk: Extract<ModelChunk, { kind: "tool" }>,
  indexes: StreamIndexes,
): SidechatStreamEvent => ({
  type: "sidechat.tool",
  requestId,
  messageId: assistantMessageId,
  toolCallId: chunk.toolCallId,
  toolName: chunk.toolName,
  status: chunk.status,
  input: chunk.input,
  output: chunk.output,
  error: chunk.error,
  index: indexes.tool++,
});

export const createHostCommandEvent = (
  requestId: string,
  assistantMessageId: string,
  chunk: Extract<ModelChunk, { kind: "host-command" }>,
  indexes: StreamIndexes,
): SidechatStreamEvent => ({
  type: "sidechat.host_command",
  requestId,
  messageId: assistantMessageId,
  commandId: chunk.commandId,
  command: chunk.command,
  index: indexes.hostCommand++,
});
