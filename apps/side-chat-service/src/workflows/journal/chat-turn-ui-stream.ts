import type { UIMessageChunk } from "ai";

import type { ClientToolDefinition } from "#application/turn/tools/client-tool-catalog";
import { preserveDynamicClientToolIdentity } from "../client-tools/index.js";
import { normalizeApprovalUIChunk } from "../tool-approvals/approval-output.js";
import {
  createChatTurnJournalToUIChunkTransform,
  type ChatTurnJournalPart,
} from "./chat-turn-journal.js";

/** Convert the durable provider journal into one stable assistant UI stream. */
export function toChatTurnUIStream(
  stream: ReadableStream<ChatTurnJournalPart>,
  clientTools: readonly ClientToolDefinition[],
  assistantMessageId: string,
): ReadableStream<UIMessageChunk> {
  return stream
    .pipeThrough(createChatTurnJournalToUIChunkTransform())
    .pipeThrough(stampAssistantMessageId(assistantMessageId))
    .pipeThrough(
      new TransformStream<UIMessageChunk, UIMessageChunk>({
        transform: (chunk, controller) => controller.enqueue(normalizeApprovalUIChunk(chunk)),
      }),
    )
    .pipeThrough(preserveDynamicClientToolIdentity(clientTools));
}

/** Give every attachment epoch the same durable assistant identity. */
export function stampAssistantMessageId(
  assistantMessageId: string,
): TransformStream<UIMessageChunk, UIMessageChunk> {
  return new TransformStream({
    transform(chunk, controller) {
      controller.enqueue(
        chunk.type === "start" ? { ...chunk, messageId: assistantMessageId } : chunk,
      );
    },
  });
}
