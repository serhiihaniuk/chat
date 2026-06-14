import {
  PROTOCOL_ERROR_CODES,
  SIDECHAT_PROTOCOL_VERSION,
  type ProtocolErrorCode,
} from "@side-chat/chat-protocol";

export const jsonError = (
  code: ProtocolErrorCode,
  message: string,
  status: number,
  retryable = false,
): Response =>
  Response.json(
    { protocolVersion: SIDECHAT_PROTOCOL_VERSION, code, message, retryable },
    { status },
  );

export const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : "Unexpected service error.";

const PROTOCOL_ERROR_HTTP_STATUS = {
  [PROTOCOL_ERROR_CODES.BAD_REQUEST]: 400,
  [PROTOCOL_ERROR_CODES.UNAUTHORIZED]: 401,
  [PROTOCOL_ERROR_CODES.FORBIDDEN]: 403,
  [PROTOCOL_ERROR_CODES.NOT_FOUND]: 404,
  [PROTOCOL_ERROR_CODES.CONFLICT]: 409,
  [PROTOCOL_ERROR_CODES.RATE_LIMITED]: 429,
  [PROTOCOL_ERROR_CODES.ABORTED]: 499,
  [PROTOCOL_ERROR_CODES.TIMEOUT]: 504,
  [PROTOCOL_ERROR_CODES.PROVIDER_FAILED]: 502,
  [PROTOCOL_ERROR_CODES.TOOL_FAILED]: 502,
  [PROTOCOL_ERROR_CODES.PERSISTENCE_FAILED]: 500,
  [PROTOCOL_ERROR_CODES.INTERNAL_ERROR]: 500,
  [PROTOCOL_ERROR_CODES.MALFORMED_STREAM]: 400,
  [PROTOCOL_ERROR_CODES.UNSUPPORTED_PROTOCOL]: 400,
} as const satisfies Record<ProtocolErrorCode, number>;

/**
 * Return the HTTP status for a Side Chat error code.
 *
 * Keep the mapping here so individual routes do not invent their own status
 * choices for the same error code.
 */
export const httpStatusForProtocolError = (code: ProtocolErrorCode): number =>
  PROTOCOL_ERROR_HTTP_STATUS[code];
