import type { UIMessage, UIMessageChunk } from "ai";

import type { ClientToolDefinition } from "#application/turn/tools/client-tool-catalog";
import type { AuthContext } from "#domain/auth-context";
import type {
  TurnExecutionErrorCode,
  TurnMessage,
  TurnRef,
  TurnTerminalStatus,
  TurnUsage,
} from "#domain/turn/turn";

export type TurnExecutionInput = TurnRef &
  Readonly<{
    auth: AuthContext;
    requestId: string;
    modelId: string;
    messages: readonly TurnMessage[];
    clientTools: readonly ClientToolDefinition[];
    enabledToolNames?: readonly string[] | undefined;
  }>;

/**
 * The single journaled outcome of a run — exactly one per turn, and the
 * recoverable source of truth the application persists.
 *
 * - `stepUsage` is per model step; the application sums it into one total.
 * - `assistantMessage` is present for every completed turn as a stable native
 *   `UIMessage`, including empty and reasoning-only responses.
 * - `safeErrorCode` is set only on a failed terminal and is already client-safe.
 * - `finishReason` is the native provider reason when known (e.g. `content-filter`
 *   for a blocked turn, `length` for a truncated one); absent on cancel/failure.
 */
export type TurnExecutionTerminal = Readonly<{
  status: TurnTerminalStatus;
  stepUsage: readonly TurnUsage[];
  assistantMessage?: UIMessage;
  safeErrorCode?: TurnExecutionErrorCode;
  finishReason?: string;
}>;

/**
 * A started run: its durable id, the live wire `stream`, and the pending `terminal`.
 *
 * `stream` emits native `UIMessageChunk`s — the engine stream is itself the wire
 * contract, so the outbound scrub transform is the single edge from engine parts
 * to the client, with no intermediate event vocabulary in between. `terminal`
 * resolves once, whether or not `stream` is fully consumed, and is the recoverable
 * outcome the application persists.
 */
export type StartedTurnExecution = Readonly<{
  runId: string;
  stream: ReadableStream<UIMessageChunk>;
  terminal: Promise<TurnExecutionTerminal>;
}>;

/**
 * Runs one durable assistant turn. The implementation owns durability and provider
 * execution; the caller owns auth, admission, and persistence around this port.
 */
export interface TurnExecution {
  /**
   * Start a prepared turn. Resolves once the run exists and its stream is open —
   * before generation finishes. A failure here rejects rather than half-opening a
   * stream, so the caller can still return an HTTP error.
   */
  start(input: TurnExecutionInput): Promise<StartedTurnExecution>;
  /**
   * Deliver a cancellation to the in-flight provider call for `runId`. Signal-based:
   * the running step aborts and the run resolves a cancelled terminal. A no-op if
   * the run already finished or is unknown.
   */
  cancel(runId: string): Promise<void>;
}
