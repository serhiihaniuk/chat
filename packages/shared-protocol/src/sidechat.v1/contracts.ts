import { Schema } from "effect";

import { NonEmptyStringSchema } from "./schemas.js";

export const SidechatProtocolHeader = "X-Sidechat-Protocol";
export const SidechatRequestIdHeader = "X-Request-Id";

export const SidechatRequestHeadersSchema = Schema.Struct({
  [SidechatProtocolHeader]: Schema.Literal("sidechat.v1"),
  "Content-Type": Schema.optionalKey(Schema.Literal("application/json")),
  Accept: Schema.optionalKey(Schema.Literal("text/event-stream")),
  [SidechatRequestIdHeader]: Schema.optionalKey(NonEmptyStringSchema),
});

export const SidechatStreamResponseHeadersSchema = Schema.Struct({
  "Content-Type": Schema.Literal("text/event-stream; charset=utf-8"),
  "Cache-Control": Schema.Literal("no-cache, no-transform"),
  Connection: Schema.optionalKey(Schema.Literal("keep-alive")),
  [SidechatProtocolHeader]: Schema.Literal("sidechat.v1"),
  [SidechatRequestIdHeader]: NonEmptyStringSchema,
});

export const SidechatProtocol = {
  requestHeader: SidechatProtocolHeader,
  requestIdHeader: SidechatRequestIdHeader,
  protocol: "sidechat.v1" as const,
  acceptedRequestContentType: "application/json",
  acceptedResponseType: "text/event-stream",
  streamContentType: "text/event-stream; charset=utf-8",
  modelsRoute: "/models",
  streamRoute: "/chat/stream",
  healthRoute: "/health",
};
