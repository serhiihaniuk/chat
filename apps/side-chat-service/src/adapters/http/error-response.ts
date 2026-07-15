import {
  SIDE_CHAT_ERROR_CODES,
  SIDE_CHAT_ERROR_VOCABULARY,
  type SideChatErrorCode,
} from "@side-chat/stream-profile";

import {
  TURN_REJECTION_CODES,
  type TurnRejectionCode,
  type TurnRejectedError,
} from "#application/turn/turn-errors";

import { HTTP_HEADERS } from "./http-contract.js";

export type HttpError = Readonly<{ STATUS: number; CODE: SideChatErrorCode }>;

/**
 * HTTP status paired with the public error code the widget receives, in one
 * table. A route names an outcome (`HTTP_ERROR.FORBIDDEN`) instead of choosing a
 * status and a code separately, so the two can never drift. `CODE` is the shared
 * {@link SIDE_CHAT_ERROR_CODES} vocabulary — a pre-stream HTTP error speaks the
 * same codes as an in-stream error part, never an internal or domain code.
 */
export const HTTP_ERROR = {
  BAD_REQUEST: { STATUS: 400, CODE: SIDE_CHAT_ERROR_CODES.BAD_REQUEST },
  UNAUTHORIZED: { STATUS: 401, CODE: SIDE_CHAT_ERROR_CODES.UNAUTHORIZED },
  FORBIDDEN: { STATUS: 403, CODE: SIDE_CHAT_ERROR_CODES.FORBIDDEN },
  NOT_FOUND: { STATUS: 404, CODE: SIDE_CHAT_ERROR_CODES.NOT_FOUND },
  CONFLICT: { STATUS: 409, CODE: SIDE_CHAT_ERROR_CODES.CONFLICT },
  RANGE_NOT_SATISFIABLE: {
    STATUS: 416,
    CODE: SIDE_CHAT_ERROR_CODES.BAD_REQUEST,
  },
  INTERNAL_SERVER_ERROR: {
    STATUS: 500,
    CODE: SIDE_CHAT_ERROR_CODES.INTERNAL_ERROR,
  },
  SERVICE_UNAVAILABLE: {
    STATUS: 503,
    CODE: SIDE_CHAT_ERROR_CODES.RATE_LIMITED,
  },
} as const satisfies Record<string, HttpError>;

/**
 * Build the JSON error envelope for a failure that occurs before the stream opens.
 *
 * Retryability is not a parameter: it is read from the code's entry in
 * `SIDE_CHAT_ERROR_VOCABULARY`, so one code carries one retryability everywhere.
 *
 * @param requestId - Correlation id echoed to the client and server logs.
 * @param error - The outcome, naming both the HTTP status and the public code.
 * @param message - Safe, human-readable detail; never raw provider or internal text.
 */
export function errorResponse(requestId: string, error: HttpError, message: string): Response {
  const { retryable } = SIDE_CHAT_ERROR_VOCABULARY[error.CODE];
  return Response.json(
    { code: error.CODE, message, retryable, requestId },
    { status: error.STATUS },
  );
}

/** Which HTTP outcome each domain turn rejection maps to; retryability follows the code. */
const TURN_REJECTION_HTTP = {
  [TURN_REJECTION_CODES.NOT_FOUND]: HTTP_ERROR.NOT_FOUND,
  [TURN_REJECTION_CODES.FORBIDDEN]: HTTP_ERROR.FORBIDDEN,
  [TURN_REJECTION_CODES.BUSY]: HTTP_ERROR.CONFLICT,
  [TURN_REJECTION_CODES.REQUEST_CONFLICT]: HTTP_ERROR.CONFLICT,
  [TURN_REJECTION_CODES.CAPACITY]: HTTP_ERROR.SERVICE_UNAVAILABLE,
  [TURN_REJECTION_CODES.RUN_NOT_READY]: HTTP_ERROR.CONFLICT,
  [TURN_REJECTION_CODES.RUN_NOT_FOUND]: HTTP_ERROR.NOT_FOUND,
  [TURN_REJECTION_CODES.CLIENT_TOOL_NOT_READY]: HTTP_ERROR.CONFLICT,
  [TURN_REJECTION_CODES.CLIENT_TOOLS_UNAVAILABLE]: HTTP_ERROR.BAD_REQUEST,
  [TURN_REJECTION_CODES.TOOL_APPROVAL_NOT_READY]: HTTP_ERROR.CONFLICT,
  [TURN_REJECTION_CODES.TOOL_APPROVAL_CONFLICT]: HTTP_ERROR.CONFLICT,
  [TURN_REJECTION_CODES.INVALID_TOOL_APPROVAL]: HTTP_ERROR.BAD_REQUEST,
  [TURN_REJECTION_CODES.MODEL_NOT_ALLOWED]: HTTP_ERROR.BAD_REQUEST,
} as const satisfies Record<TurnRejectionCode, HttpError>;

/**
 * Map a domain turn rejection to its HTTP error envelope.
 *
 * The client receives the public vocabulary code (e.g. `conflict`), never the
 * internal domain code; the specific detail rides in `message`. A `Retry-After`
 * header is added when the rejection carries a retry delay (capacity exhaustion).
 */
export function turnRejectionResponse(requestId: string, error: TurnRejectedError): Response {
  const response = errorResponse(requestId, TURN_REJECTION_HTTP[error.code], error.message);
  if (error.retryAfterSeconds !== undefined) {
    response.headers.set(HTTP_HEADERS.RETRY_AFTER, String(error.retryAfterSeconds));
  }
  return response;
}
