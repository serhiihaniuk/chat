import {
  protocolArtifacts,
  SidechatProtocolHeader,
  SidechatRequestIdHeader,
  type SidechatStreamErrorEvent,
} from "@side-chat/shared-protocol";

import { SideChatDomainError } from "#application/errors.js";

const protocol = protocolArtifacts;

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
