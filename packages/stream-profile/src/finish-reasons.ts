/**
 * The finish reasons that can appear on a `finish` part.
 *
 * These mirror AI SDK's native `FinishReason` values exactly — the profile owns
 * them as a named vocabulary so both the service and the widget branch on
 * `SIDE_CHAT_FINISH_REASONS.CONTENT_FILTER` instead of a bare string. Two carry
 * product meaning beyond a clean stop:
 * - `CONTENT_FILTER` is a provider moderation stop — a **blocked** turn.
 * - `LENGTH` is a truncated turn — the model hit its output limit.
 *
 * The service verifies this set stays aligned with the native `FinishReason`
 * type where it maps the two (a drifted value fails to compile there).
 */
export const SIDE_CHAT_FINISH_REASONS = {
  STOP: "stop",
  LENGTH: "length",
  CONTENT_FILTER: "content-filter",
  TOOL_CALLS: "tool-calls",
  ERROR: "error",
  OTHER: "other",
} as const;

export type SideChatFinishReason =
  (typeof SIDE_CHAT_FINISH_REASONS)[keyof typeof SIDE_CHAT_FINISH_REASONS];
