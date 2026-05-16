import type { Hono } from "hono";
import {
  protocolArtifacts,
  SidechatProtocol,
  SidechatProtocolHeader,
  SidechatRequestIdHeader,
  validateRequest,
} from "@side-chat/shared-protocol";

import type { StreamChatDeps } from "#application/stream-chat.js";
import { preStreamErrorResponse } from "../response/protocol-errors.js";
import { streamEvents } from "../response/sse.js";

const protocol = protocolArtifacts;

export const registerChatStreamRoute = (
  app: Hono,
  deps: StreamChatDeps,
) => {
  app.post(SidechatProtocol.streamRoute, async (c) => {
    const requestId =
      c.req.header(SidechatRequestIdHeader) ?? crypto.randomUUID();
    const protocolHeader = c.req.header(SidechatProtocolHeader);

    if (protocolHeader !== protocol.protocol) {
      return preStreamErrorResponse(
        requestId,
        400,
        "InvalidProtocol",
        "X-Sidechat-Protocol: sidechat.v1 is required",
      );
    }

    let body: unknown;

    try {
      body = await c.req.json();
    } catch {
      body = undefined;
    }

    const parsed = validateRequest(body);
    if (!parsed.ok) {
      return preStreamErrorResponse(
        requestId,
        400,
        "InvalidRequest",
        "workspaceId, message.content and model.id are required",
      );
    }

    return c.body(
      streamEvents(deps, parsed.data, requestId, c.req.raw.signal),
      200,
      {
        "Content-Type": SidechatProtocol.streamContentType,
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        [SidechatProtocolHeader]: protocol.protocol,
        [SidechatRequestIdHeader]: requestId,
      },
    );
  });
};
