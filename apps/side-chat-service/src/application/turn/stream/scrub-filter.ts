import type { UIMessageChunk } from "ai";

import { sideChatMessageMetadataSchema, SIDE_CHAT_ERROR_CODES } from "@side-chat/stream-profile";

import {
  TERMINAL_UI_MESSAGE_CHUNK_TYPES,
  UI_MESSAGE_CHUNK_TYPES,
} from "./ui-message-chunk-types.js";

/**
 * Outbound privacy and safety policy for the UI message stream.
 *
 * This is the ONE transform that enforces the Side Chat profile on every chunk
 * the engine produces. It is intentionally small: it does not translate a
 * vocabulary, it narrows a native one.
 *
 * Contract:
 * - error parts carry a safe {@link SIDE_CHAT_ERROR_CODES} code, never raw
 *   provider/tool/prompt text. Any in-stream error collapses to the generic
 *   retryable `provider_failed`; precise classification lives in the persisted
 *   terminal, not on the wire.
 * - provider metadata is removed from every chunk. It is useful for server-side
 *   diagnostics, but it is not part of the browser contract and may contain
 *   provider-specific details.
 * - native message metadata is accepted only on `start`, `finish`, and
 *   `message-metadata` chunks, and only when it matches the browser-safe usage
 *   schema. Invalid metadata is stripped without exposing the rejected value.
 * - dynamic client-tool outputs retain only settled state, and their failures
 *   collapse to a safe code. Browser values and internal execution errors do
 *   not return through replay, logs, or a second tab.
 * - a native finish reason (`content-filter`, `length`, ...) is forwarded
 *   untouched — it already IS the blocked/length representation (ADR 0007).
 * - exactly one terminal-class chunk reaches the client; a second is dropped
 *   (defense in depth — the SDK should already guarantee this).
 * - unknown chunk types are forwarded, never dropped, and counted.
 */

const TERMINAL_CHUNK_TYPES = new Set<string>(TERMINAL_UI_MESSAGE_CHUNK_TYPES);
const KNOWN_CHUNK_TYPES = new Set<string>(Object.values(UI_MESSAGE_CHUNK_TYPES));
const MESSAGE_METADATA_CHUNK_TYPES = new Set<string>([
  UI_MESSAGE_CHUNK_TYPES.START,
  UI_MESSAGE_CHUNK_TYPES.FINISH,
  UI_MESSAGE_CHUNK_TYPES.MESSAGE_METADATA,
]);

/**
 * Optional counters for the two chunks the filter handles defensively. The filter
 * stays sink-free; Step 18 wires these to telemetry.
 */
export type ScrubObserver = Readonly<{
  /** Receives the `type` of a forwarded unknown chunk (a future or `data-*` type); the chunk still passes through. */
  onUnknownChunk?: (type: string) => void;
  /** Receives the `type` of a second terminal-class chunk, dropped to keep exactly one terminal per turn. */
  onDroppedTerminalChunk?: (type: string) => void;
}>;

/**
 * Create the outbound scrub transform — the single edge that enforces the wire
 * profile (see the file contract above). Returns a fresh, single-use
 * `TransformStream`, so call it once per response.
 *
 * @param observer - Hooks invoked when a chunk is forwarded as unknown or a
 *   duplicate terminal is dropped, so telemetry can count them without the filter
 *   depending on a sink. Defaults to no-op.
 */
export function createScrubTransform(
  observer: ScrubObserver = {},
): TransformStream<UIMessageChunk, UIMessageChunk> {
  let terminated = false;
  return new TransformStream({
    transform(chunk, controller) {
      if (TERMINAL_CHUNK_TYPES.has(chunk.type)) {
        if (terminated) {
          observer.onDroppedTerminalChunk?.(chunk.type);
          return;
        }
        terminated = true;
      }
      if (!KNOWN_CHUNK_TYPES.has(chunk.type)) observer.onUnknownChunk?.(chunk.type);
      controller.enqueue(scrubChunk(chunk));
    },
  });
}

function scrubChunk(chunk: UIMessageChunk): UIMessageChunk {
  if (chunk.type === UI_MESSAGE_CHUNK_TYPES.ERROR) {
    return {
      type: UI_MESSAGE_CHUNK_TYPES.ERROR,
      errorText: SIDE_CHAT_ERROR_CODES.PROVIDER_FAILED,
    };
  }
  if (chunk.type === UI_MESSAGE_CHUNK_TYPES.TOOL_OUTPUT_AVAILABLE && chunk.dynamic === true) {
    return scrubMessageMetadata(
      withoutProviderMetadata({ ...chunk, output: { status: "settled" } }),
    );
  }
  if (chunk.type === UI_MESSAGE_CHUNK_TYPES.TOOL_OUTPUT_ERROR && chunk.dynamic === true) {
    return scrubMessageMetadata(
      withoutProviderMetadata({
        ...chunk,
        errorText: SIDE_CHAT_ERROR_CODES.PROVIDER_FAILED,
      }),
    );
  }
  return scrubMessageMetadata(withoutProviderMetadata(chunk));
}

function withoutProviderMetadata(chunk: UIMessageChunk): UIMessageChunk {
  if (!("providerMetadata" in chunk)) return chunk;

  const safeChunk = structuredClone(chunk);
  delete safeChunk.providerMetadata;
  return safeChunk;
}

function scrubMessageMetadata(chunk: UIMessageChunk): UIMessageChunk {
  if (!("messageMetadata" in chunk)) return chunk;
  if (!MESSAGE_METADATA_CHUNK_TYPES.has(chunk.type)) return withoutMessageMetadata(chunk);
  let result:
    | ReturnType<(typeof sideChatMessageMetadataSchema)["~standard"]["validate"]>
    | undefined;
  try {
    result = sideChatMessageMetadataSchema["~standard"].validate(chunk.messageMetadata);
  } catch {
    return withoutMessageMetadata(chunk);
  }
  if ("issues" in result || result.value === undefined) {
    return withoutMessageMetadata(chunk);
  }
  return { ...chunk, messageMetadata: result.value };
}

function withoutMessageMetadata(chunk: UIMessageChunk): UIMessageChunk {
  const safeChunk = { ...chunk };
  if ("messageMetadata" in safeChunk) delete safeChunk.messageMetadata;
  return safeChunk;
}
