import type { UIMessageChunk } from "ai";
import { getRun, type Run } from "workflow/api";

import type { ChatTurnTerminalOutcome } from "../chat-turn.js";
import {
  CHAT_TURN_JOURNAL_PART_TYPES,
  toChatTurnUIChunk,
  type ChatTurnJournalPart,
} from "../../journal/chat-turn-journal.js";
import { normalizeApprovalUIChunk } from "../../tool-approvals/approval-output.js";

export type ReplayedChatTurn =
  | Readonly<{
      status: "found";
      stream: ReadableStream<UIMessageChunk>;
      terminal: Promise<ChatTurnTerminalOutcome>;
      tailIndex: number;
    }>
  | Readonly<{ status: "not_found" }>
  | Readonly<{ status: "start_index_out_of_range"; tailIndex: number }>;

/** Open one independent durable reader after the HTTP edge proves ownership. */
export async function replayChatTurn(
  runId: string,
  startIndex: number,
  assistantMessageId: string,
): Promise<ReplayedChatTurn> {
  const run = getRun<ChatTurnTerminalOutcome>(runId);
  if (!(await run.exists)) return { status: "not_found" };
  const replay = await openUiReplay(run, startIndex, assistantMessageId);
  if (replay.status === "start_index_out_of_range") return replay;
  return {
    status: "found",
    stream: replay.stream,
    terminal: run.returnValue,
    tailIndex: replay.tailIndex,
  };
}

/**
 * Translate the public UI cursor against a stable raw-journal snapshot.
 *
 * WorkflowAgent can only write its raw model-call stream to Workflow's special
 * writable. The SDK's UI transform is not one-to-one, so replay scans the
 * bounded prefix once, resolves the UI cursor, then continues on the same raw
 * reader for live tail. This is O(history) but keeps the public cursor exact.
 */
async function openUiReplay(
  run: Run<ChatTurnTerminalOutcome>,
  startIndex: number,
  assistantMessageId: string,
): Promise<
  | Readonly<{
      status: "found";
      stream: ReadableStream<UIMessageChunk>;
      tailIndex: number;
    }>
  | Readonly<{ status: "start_index_out_of_range"; tailIndex: number }>
> {
  const raw = run.getReadable<ChatTurnJournalPart>();
  const rawTailIndex = await raw.getTailIndex();
  const terminal = isTerminalRunStatus(await run.status);
  const reader = raw.getReader();
  const prefix: UIMessageChunk[] = [
    { type: "start", messageId: assistantMessageId },
    { type: "start-step" },
  ];

  await readRawPrefix(reader, rawTailIndex + 1, prefix);
  if (terminal) {
    await readRawToEnd(reader, prefix);
    await reader.cancel();
    prefix.push({ type: "finish-step" }, { type: "finish" });
  }

  const tailIndex = prefix.length - 1;
  const absoluteStart = startIndex < 0 ? Math.max(prefix.length + startIndex, 0) : startIndex;
  if (absoluteStart > tailIndex + 1) {
    await reader.cancel();
    return { status: "start_index_out_of_range", tailIndex };
  }
  return {
    status: "found",
    stream: uiReplayStream(reader, prefix.slice(absoluteStart), terminal),
    tailIndex,
  };
}

async function readRawPrefix(
  reader: ReadableStreamDefaultReader<ChatTurnJournalPart>,
  count: number,
  output: UIMessageChunk[],
): Promise<void> {
  for (let index = 0; index < count; index += 1) {
    const next = await reader.read();
    if (next.done) return;
    appendUiChunk(output, next.value);
  }
}

async function readRawToEnd(
  reader: ReadableStreamDefaultReader<ChatTurnJournalPart>,
  output: UIMessageChunk[],
): Promise<void> {
  while (true) {
    const next = await reader.read();
    if (next.done) return;
    appendUiChunk(output, next.value);
  }
}

function appendUiChunk(output: UIMessageChunk[], raw: ChatTurnJournalPart): void {
  const chunk = toChatTurnUIChunk(raw);
  if (chunk !== undefined) output.push(normalizeApprovalUIChunk(chunk));
}

/** Release the pinned world's subscriber on client cancel and normal EOF. */
function uiReplayStream(
  reader: ReadableStreamDefaultReader<ChatTurnJournalPart>,
  buffered: readonly UIMessageChunk[],
  terminal: boolean,
): ReadableStream<UIMessageChunk> {
  let bufferIndex = 0;
  return new ReadableStream({
    async pull(controller) {
      const bufferedChunk = buffered[bufferIndex];
      if (bufferedChunk !== undefined) {
        controller.enqueue(bufferedChunk);
        bufferIndex += 1;
        return;
      }
      if (terminal) {
        controller.close();
        return;
      }
      await enqueueNextLiveChunk(reader, controller);
    },
    cancel(reason) {
      return reader.cancel(reason);
    },
  });
}

async function enqueueNextLiveChunk(
  reader: ReadableStreamDefaultReader<ChatTurnJournalPart>,
  controller: ReadableStreamDefaultController<UIMessageChunk>,
): Promise<void> {
  while (true) {
    const next = await reader.read();
    if (next.done) {
      controller.enqueue({ type: CHAT_TURN_JOURNAL_PART_TYPES.FINISH_STEP });
      controller.enqueue({ type: "finish" });
      await reader.cancel();
      controller.close();
      return;
    }
    const chunk = toChatTurnUIChunk(next.value);
    if (chunk !== undefined) {
      controller.enqueue(normalizeApprovalUIChunk(chunk));
      return;
    }
  }
}

// Mirrors the DevKit's pinned `TERMINAL_WORKFLOW_RUN_STATUSES` (`@workflow/world`,
// which the service's dependency policy does not allow importing directly). A
// terminal run will produce no further output, so replay reads to the buffered end.
const TERMINAL_WORKFLOW_RUN_STATUSES = new Set<string>(["completed", "failed", "cancelled"]);

function isTerminalRunStatus(status: string): boolean {
  return TERMINAL_WORKFLOW_RUN_STATUSES.has(status);
}
