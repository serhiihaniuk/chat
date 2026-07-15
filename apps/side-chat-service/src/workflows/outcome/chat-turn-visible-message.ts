import { createModelCallToUIChunkTransform, type ModelCallStreamPart } from "@ai-sdk/workflow";
import { readUIMessageStream, type UIMessage, type UIMessageChunk } from "ai";

import type { ClientToolDefinition } from "#application/turn/tools/client-tool-catalog";
import { createScrubTransform } from "#application/turn/stream/scrub-filter";
import { withoutTerminalToolApprovalMetadata } from "#application/turn/tools/approvals/terminal-tool-approval-metadata";
import { preserveDynamicClientToolIdentity } from "../client-tools/dynamic-identity.js";
import { normalizeApprovalUIChunk } from "../tool-approvals/approval-output.js";

/**
 * Rebuild the complete browser-safe native message from the durable run journal.
 * The projection is complete after success and safely partial after interruption.
 */
export async function readVisibleAssistantMessage(
  turnId: string,
  stream: ReadableStream<ModelCallStreamPart>,
  clientTools: readonly ClientToolDefinition[] = [],
): Promise<UIMessage | undefined> {
  const uiStream = stream
    .pipeThrough(createModelCallToUIChunkTransform())
    .pipeThrough(stampMessageId(`${turnId}-assistant`))
    .pipeThrough(normalizeApprovalChunks())
    .pipeThrough(preserveDynamicClientToolIdentity(clientTools))
    .pipeThrough(createScrubTransform());

  let visible: UIMessage | undefined;
  for await (const message of readUIMessageStream({ stream: uiStream })) visible = message;
  if (!visible?.parts.length) return undefined;
  return {
    ...visible,
    parts: visible.parts.map(withoutTerminalToolApprovalMetadata),
  };
}

function stampMessageId(messageId: string): TransformStream<UIMessageChunk, UIMessageChunk> {
  return new TransformStream({
    transform(chunk, controller) {
      controller.enqueue(chunk.type === "start" ? { ...chunk, messageId } : chunk);
    },
  });
}

function normalizeApprovalChunks(): TransformStream<UIMessageChunk, UIMessageChunk> {
  return new TransformStream({
    transform(chunk, controller) {
      controller.enqueue(normalizeApprovalUIChunk(chunk));
    },
  });
}
