import {
  protocolArtifacts,
  SidechatProtocolHeader,
  SidechatRequestIdHeader,
  type SidechatStreamErrorEvent,
} from "@side-chat/shared-protocol";

import { SideChatDomainError } from "#application/errors.js";

const protocol = protocolArtifacts;

/**
 * Converts application/domain failures into terminal stream events. Use this
 * only after the response has become an SSE stream.
 */
export const toProtocolError = (
  requestId: string,
  error: unknown,
): SidechatStreamErrorEvent => {
  if (error instanceof SideChatDomainError) {
    return {
      type: protocol.error,
      requestId,
      code: error.code,
      message: error.message,
      retryable: error.retryable,
    };
  }

  return {
    type: protocol.error,
    requestId,
    code: "InternalError",
    message:
      error instanceof Error ? error.message : "Unexpected stream failure",
    retryable: false,
  };
};

/**
 * Pre-stream errors are ordinary HTTP JSON because no SSE stream exists yet.
 * Typical examples: missing protocol header or invalid request body.
 */
export const preStreamErrorResponse = (
  requestId: string,
  status: 400,
  code: string,
  message: string,
) =>
  new Response(
    JSON.stringify({
      error: {
        code,
        message,
        requestId,
        retryable: false,
      },
    }),
    {
      status,
      headers: {
        "Content-Type": "application/json",
        [SidechatProtocolHeader]: protocol.protocol,
        [SidechatRequestIdHeader]: requestId,
      },
    },
  );
