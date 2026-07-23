/**
 * The native UI message stream `v1` chunk-type discriminants the service reasons
 * about by name. The SDK ships these only as a type union, so the scrub filter
 * names them here to fail closed on forward-compatible unknowns and to guard the
 * single-terminal rule. `custom` and `data-*` are intentionally omitted because
 * Side Chat-owned data parts must be registered by the stream profile before
 * they are allowed through the outbound privacy boundary.
 */
export const UI_MESSAGE_CHUNK_TYPES = {
  START: "start",
  TEXT_START: "text-start",
  TEXT_DELTA: "text-delta",
  TEXT_END: "text-end",
  REASONING_START: "reasoning-start",
  REASONING_DELTA: "reasoning-delta",
  REASONING_END: "reasoning-end",
  REASONING_FILE: "reasoning-file",
  ERROR: "error",
  TOOL_INPUT_START: "tool-input-start",
  TOOL_INPUT_DELTA: "tool-input-delta",
  TOOL_INPUT_AVAILABLE: "tool-input-available",
  TOOL_INPUT_ERROR: "tool-input-error",
  TOOL_OUTPUT_AVAILABLE: "tool-output-available",
  TOOL_OUTPUT_ERROR: "tool-output-error",
  TOOL_OUTPUT_DENIED: "tool-output-denied",
  TOOL_APPROVAL_REQUEST: "tool-approval-request",
  TOOL_APPROVAL_RESPONSE: "tool-approval-response",
  SOURCE_URL: "source-url",
  SOURCE_DOCUMENT: "source-document",
  FILE: "file",
  START_STEP: "start-step",
  FINISH_STEP: "finish-step",
  FINISH: "finish",
  ABORT: "abort",
  MESSAGE_METADATA: "message-metadata",
} as const;

export type UiMessageChunkType =
  (typeof UI_MESSAGE_CHUNK_TYPES)[keyof typeof UI_MESSAGE_CHUNK_TYPES];

/** The terminal-class chunks; exactly one may reach the client per turn. */
export const TERMINAL_UI_MESSAGE_CHUNK_TYPES = [
  UI_MESSAGE_CHUNK_TYPES.FINISH,
  UI_MESSAGE_CHUNK_TYPES.ERROR,
  UI_MESSAGE_CHUNK_TYPES.ABORT,
] as const;
