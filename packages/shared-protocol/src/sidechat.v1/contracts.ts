import { z } from "zod";

export const SidechatProtocolHeader = "X-Sidechat-Protocol";
export const SidechatRequestIdHeader = "X-Request-Id";

export const SidechatRequestHeadersSchema = z.object({
  [SidechatProtocolHeader]: z.literal("sidechat.v1"),
  "Content-Type": z.literal("application/json").optional(),
  Accept: z.literal("text/event-stream").optional(),
  [SidechatRequestIdHeader]: z.string().min(1).optional(),
});

export const SidechatStreamResponseHeadersSchema = z.object({
  "Content-Type": z.literal("text/event-stream; charset=utf-8"),
  "Cache-Control": z.literal("no-cache, no-transform"),
  Connection: z.literal("keep-alive").optional(),
  [SidechatProtocolHeader]: z.literal("sidechat.v1"),
  [SidechatRequestIdHeader]: z.string().min(1),
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
