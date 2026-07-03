import { Effect } from "effect";
import {
  AiRuntimeError,
  RUNTIME_ERROR_CODES,
  type RuntimeActivitySource,
} from "@side-chat/ai-runtime-contract";
import { omitUndefinedProperties, type JsonObject } from "@side-chat/shared";

import type { RuntimeTool, RuntimeToolContext } from "./runtime-tool.js";

/**
 * A tool written as a plain async function instead of an Effect program.
 *
 * `run` returns the JSON result or throws. The wrapper owns the Effect plumbing,
 * so an author who does not use Effect writes ordinary `async`/`await`.
 */
export type PromiseRuntimeTool = {
  readonly name: string;
  readonly description: string;
  /** The tool's JSON Schema, as a plain JSON object (`{ type: "object", … }`). */
  readonly inputSchema: JsonObject;
  readonly timeoutMs?: number | undefined;
  readonly readSources?: ((result: JsonObject) => readonly RuntimeActivitySource[]) | undefined;
  /**
   * Run the tool. `context.abortSignal` is linked to the turn: honor it for
   * cancellable work (e.g. pass it to `fetch`). Return the JSON result, or throw
   * to fail the tool call.
   */
  readonly run: (input: JsonObject, context: RuntimeToolContext) => Promise<JsonObject>;
};

/**
 * Build a `RuntimeTool` from a Promise-returning function — the beginner path.
 *
 * A thrown error becomes a `tool_failed` runtime error with a STABLE, scrubbed
 * message (the raw text never crosses the runtime boundary); a caller abort
 * becomes `aborted`; an `AiRuntimeError` an author throws deliberately keeps its
 * code. Advanced authors can still write `RuntimeTool.execute` as an Effect.
 */
export const createRuntimeToolFromPromise = (tool: PromiseRuntimeTool): RuntimeTool => ({
  name: tool.name,
  description: tool.description,
  inputSchema: tool.inputSchema,
  ...omitUndefinedProperties({ timeoutMs: tool.timeoutMs, readSources: tool.readSources }),
  execute: (input, context) =>
    Effect.tryPromise({
      // The Effect's own abort signal fires when the turn is interrupted, so a
      // tool that honors it (fetch, etc.) is cancelled with the turn.
      try: (signal) => tool.run(input, { ...context, abortSignal: signal }),
      catch: (error) => toToolFailure(tool.name, error),
    }),
});

const toToolFailure = (toolName: string, error: unknown): AiRuntimeError => {
  if (error instanceof AiRuntimeError) return error;
  if (error instanceof Error && error.name === "AbortError") {
    return new AiRuntimeError(RUNTIME_ERROR_CODES.ABORTED, `${toolName} was aborted.`);
  }
  // Scrubbed on purpose: the raw message may hold provider/request internals.
  return new AiRuntimeError(RUNTIME_ERROR_CODES.TOOL_FAILED, `${toolName} failed.`);
};
