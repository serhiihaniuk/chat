import { digestClientToolCapability } from "../client-tools/authority/client-tool-capability.js";
import { TURN_REJECTION_CODES, TurnRejectedError } from "#application/turn/turn-errors";

import { errorResponse, HTTP_ERROR, turnRejectionResponse } from "../../error-response.js";
import { HTTP_HEADERS } from "../../http-contract.js";

export function requireClientToolCapabilityDigest(value: string | undefined): string {
  const digest = digestClientToolCapability(value);
  if (digest !== undefined) return digest;
  throw new TurnRejectedError(TURN_REJECTION_CODES.RUN_NOT_FOUND, "Client tool call not found");
}

/** Missing means replay from the beginning; otherwise require one safe integer. */
export function parseStartIndex(value: string | undefined): number | undefined {
  if (value === undefined) return 0;
  if (!/^-?(?:0|[1-9]\d*)$/.test(value)) return undefined;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : undefined;
}

export function mapTurnError(requestId: string, error: unknown): Response {
  if (error instanceof TurnRejectedError) {
    return turnRejectionResponse(requestId, error);
  }
  return errorResponse(
    requestId,
    HTTP_ERROR.INTERNAL_SERVER_ERROR,
    "The turn request could not be completed.",
  );
}

export function readRequestId(context: {
  req: { header: (name: string) => string | undefined };
}): string {
  return context.req.header(HTTP_HEADERS.REQUEST_ID) || crypto.randomUUID();
}
