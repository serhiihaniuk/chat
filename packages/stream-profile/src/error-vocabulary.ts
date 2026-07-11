/**
 * The Side Chat error vocabulary: the only error codes allowed on the public UI
 * message stream, each with its retryability and a safe, content-free message.
 *
 * This table is the shared contract between the service scrub filter (which
 * stamps a code onto every outbound `error` part) and the widget (which renders
 * the safe message and retry affordance from the code). Raw provider, database,
 * prompt, and tool text never appears here; a code is all that crosses the wire.
 *
 * Source of truth: ADR 0015 (public error profile). Adding a code without a
 * vocabulary entry fails `SIDE_CHAT_ERROR_VOCABULARY`'s exhaustive `Record`.
 */
export const SIDE_CHAT_ERROR_CODES = {
  BAD_REQUEST: "bad_request",
  UNAUTHORIZED: "unauthorized",
  FORBIDDEN: "forbidden",
  NOT_FOUND: "not_found",
  CONFLICT: "conflict",
  RATE_LIMITED: "rate_limited",
  ABORTED: "aborted",
  TIMEOUT: "timeout",
  PROVIDER_FAILED: "provider_failed",
  TOOL_FAILED: "tool_failed",
  PERSISTENCE_FAILED: "persistence_failed",
  INTERNAL_ERROR: "internal_error",
  UNSUPPORTED_PROTOCOL: "unsupported_protocol",
} as const;

export type SideChatErrorCode = (typeof SIDE_CHAT_ERROR_CODES)[keyof typeof SIDE_CHAT_ERROR_CODES];

export type SideChatErrorProfile = Readonly<{
  /** Whether a client may safely retry the same request. */
  retryable: boolean;
  /** Content-free message safe to show any user. */
  safeMessage: string;
}>;

/**
 * The exhaustive code → {retryable, safeMessage} table. The `Record` key type
 * makes this a compile-time totality check: a new {@link SideChatErrorCode}
 * without an entry fails typechecking.
 */
export const SIDE_CHAT_ERROR_VOCABULARY: Readonly<Record<SideChatErrorCode, SideChatErrorProfile>> =
  {
    [SIDE_CHAT_ERROR_CODES.BAD_REQUEST]: {
      retryable: false,
      safeMessage: "The request is invalid.",
    },
    [SIDE_CHAT_ERROR_CODES.UNAUTHORIZED]: {
      retryable: false,
      safeMessage: "Authentication is required.",
    },
    [SIDE_CHAT_ERROR_CODES.FORBIDDEN]: {
      retryable: false,
      safeMessage: "The caller may not perform this action.",
    },
    [SIDE_CHAT_ERROR_CODES.NOT_FOUND]: {
      retryable: false,
      safeMessage: "The requested resource is unavailable.",
    },
    [SIDE_CHAT_ERROR_CODES.CONFLICT]: {
      retryable: true,
      safeMessage: "Current conversation state prevents the operation.",
    },
    [SIDE_CHAT_ERROR_CODES.RATE_LIMITED]: {
      retryable: true,
      safeMessage: "Capacity or provider limits rejected the attempt.",
    },
    [SIDE_CHAT_ERROR_CODES.ABORTED]: {
      retryable: false,
      safeMessage: "The user or system cancelled the turn.",
    },
    [SIDE_CHAT_ERROR_CODES.TIMEOUT]: {
      retryable: true,
      safeMessage: "A bounded operation exceeded its deadline.",
    },
    [SIDE_CHAT_ERROR_CODES.PROVIDER_FAILED]: {
      retryable: true,
      safeMessage: "The model provider failed safely.",
    },
    [SIDE_CHAT_ERROR_CODES.TOOL_FAILED]: {
      retryable: false,
      safeMessage: "A tool failed and cannot be retried automatically.",
    },
    [SIDE_CHAT_ERROR_CODES.PERSISTENCE_FAILED]: {
      retryable: true,
      safeMessage: "Durable state could not be written.",
    },
    [SIDE_CHAT_ERROR_CODES.INTERNAL_ERROR]: {
      retryable: true,
      safeMessage: "An unexpected safe server failure occurred.",
    },
    [SIDE_CHAT_ERROR_CODES.UNSUPPORTED_PROTOCOL]: {
      retryable: false,
      safeMessage: "Client and service stream versions do not match.",
    },
  } as const;

/** Whether a string is a recognized Side Chat error code. */
export function isSideChatErrorCode(value: string): value is SideChatErrorCode {
  return Object.prototype.hasOwnProperty.call(SIDE_CHAT_ERROR_VOCABULARY, value);
}
