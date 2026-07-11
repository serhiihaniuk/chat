import {
  TURN_REJECTION_CODES,
  type TurnRejectionCode,
  type TurnRejectedError,
} from "#application/turn/turn-errors";

import { HTTP_HEADERS } from "./http-contract.js";

export const HTTP_STATUS = {
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  INTERNAL_SERVER_ERROR: 500,
  SERVICE_UNAVAILABLE: 503,
} as const;

export const HTTP_ERROR_CODES = {
  UNAUTHORIZED: "unauthorized",
  BAD_REQUEST: "bad_request",
  INTERNAL_ERROR: "internal_error",
} as const;

export type HttpErrorCode =
  | (typeof HTTP_ERROR_CODES)[keyof typeof HTTP_ERROR_CODES]
  | TurnRejectionCode;

export function errorResponse(
  requestId: string,
  code: HttpErrorCode,
  message: string,
  status: number,
  retryable = false,
): Response {
  return Response.json({ code, message, retryable, requestId }, { status });
}

type TurnRejectionHttpPolicy = Readonly<{
  status: number;
  retryable: boolean;
}>;

const TURN_REJECTION_HTTP_POLICY = {
  [TURN_REJECTION_CODES.NOT_FOUND]: {
    status: HTTP_STATUS.NOT_FOUND,
    retryable: false,
  },
  [TURN_REJECTION_CODES.FORBIDDEN]: {
    status: HTTP_STATUS.FORBIDDEN,
    retryable: false,
  },
  [TURN_REJECTION_CODES.BUSY]: {
    status: HTTP_STATUS.CONFLICT,
    retryable: false,
  },
  [TURN_REJECTION_CODES.CAPACITY]: {
    status: HTTP_STATUS.SERVICE_UNAVAILABLE,
    retryable: true,
  },
  [TURN_REJECTION_CODES.RUN_NOT_FOUND]: {
    status: HTTP_STATUS.NOT_FOUND,
    retryable: false,
  },
  [TURN_REJECTION_CODES.MODEL_NOT_ALLOWED]: {
    status: HTTP_STATUS.BAD_REQUEST,
    retryable: false,
  },
} as const satisfies Record<TurnRejectionCode, TurnRejectionHttpPolicy>;

export function turnRejectionResponse(requestId: string, error: TurnRejectedError): Response {
  const policy = TURN_REJECTION_HTTP_POLICY[error.code];
  const response = errorResponse(
    requestId,
    error.code,
    error.message,
    policy.status,
    policy.retryable,
  );
  if (error.retryAfterSeconds !== undefined) {
    response.headers.set(HTTP_HEADERS.RETRY_AFTER, String(error.retryAfterSeconds));
  }
  return response;
}
