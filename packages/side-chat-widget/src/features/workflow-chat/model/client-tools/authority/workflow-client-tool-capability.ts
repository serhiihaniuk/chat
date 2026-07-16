import { SIDE_CHAT_CLIENT_TOOL_CAPABILITY } from "@side-chat/stream-profile";

/** Create one browser-held, run-scoped authority value for client-tool execution. */
export function createWorkflowClientToolCapability(): string {
  const bytes = crypto.getRandomValues(
    new Uint8Array(SIDE_CHAT_CLIENT_TOOL_CAPABILITY.BYTE_LENGTH),
  );
  return [...bytes].map((value) => value.toString(16).padStart(2, "0")).join("");
}
