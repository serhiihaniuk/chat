import type { ProtocolErrorCode } from "@side-chat/chat-protocol";

export const jsonError = (
  code: ProtocolErrorCode,
  message: string,
  status: number,
  retryable = false,
): Response =>
  Response.json({ protocolVersion: "sidechat.v1", code, message, retryable }, { status });

export const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : "Unexpected service error.";
