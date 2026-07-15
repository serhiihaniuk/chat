import { readUIMessageStream, type UIMessage, type UIMessageChunk } from "ai";

import type { ClientToolDefinition } from "#application/turn/tools/client-tool-catalog";
import { createScrubTransform } from "#application/turn/stream/scrub-filter";
import { withoutTerminalToolApprovalMetadata } from "#application/turn/tools/approvals/terminal-tool-approval-metadata";
import { preserveDynamicClientToolIdentity } from "../client-tools/dynamic-identity.js";
import {
  CHAT_TURN_JOURNAL_PART_TYPES,
  createChatTurnJournalToUIChunkTransform,
  type ChatTurnJournalPart,
} from "../journal/chat-turn-journal.js";
import { normalizeApprovalUIChunk } from "../tool-approvals/approval-output.js";

export interface ChatTurnJournalProjection {
  readonly assistantMessage: UIMessage | undefined;
  readonly providerFailed: boolean;
}

/**
 * Read the two terminal facts owned by the closed journal in one pass.
 *
 * WorkflowAgent can normalize an error-only provider stream to finish reason
 * `other`. The raw `error` journal part is durable across replay, so it—not an
 * ephemeral callback—is the reliable failure signal.
 */
export async function readChatTurnJournalProjection(
  turnId: string,
  stream: ReadableStream<ChatTurnJournalPart>,
  clientTools: readonly ClientToolDefinition[] = [],
): Promise<ChatTurnJournalProjection> {
  let providerFailed = false;
  const inspectedStream = stream.pipeThrough(
    new TransformStream<ChatTurnJournalPart, ChatTurnJournalPart>({
      transform(part, controller) {
        if (part.type === CHAT_TURN_JOURNAL_PART_TYPES.PROVIDER_ERROR) {
          providerFailed = true;
        }
        controller.enqueue(part);
      },
    }),
  );
  const assistantMessage = await readVisibleAssistantMessage(turnId, inspectedStream, clientTools);
  return { assistantMessage, providerFailed };
}

/**
 * Rebuild the complete browser-safe native message from the durable run journal.
 * The projection is complete after success and safely partial after interruption.
 */
export async function readVisibleAssistantMessage(
  turnId: string,
  stream: ReadableStream<ChatTurnJournalPart>,
  clientTools: readonly ClientToolDefinition[] = [],
): Promise<UIMessage | undefined> {
  const uiStream = stream
    .pipeThrough(createChatTurnJournalToUIChunkTransform())
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
