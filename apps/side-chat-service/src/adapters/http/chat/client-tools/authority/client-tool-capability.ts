import { createHash } from "node:crypto";

import { SIDE_CHAT_CLIENT_TOOL_CAPABILITY } from "@side-chat/stream-profile";

const CLIENT_TOOL_CAPABILITY_PATTERN = new RegExp(
  `^[0-9a-f]{${String(SIDE_CHAT_CLIENT_TOOL_CAPABILITY.HEX_LENGTH)}}$`,
  "u",
);

/** Reduce the browser-held secret to the only representation allowed past HTTP. */
export function digestClientToolCapability(value: string | undefined): string | undefined {
  if (value === undefined || !CLIENT_TOOL_CAPABILITY_PATTERN.test(value)) return undefined;
  return createHash("sha256").update(value, "utf8").digest("hex");
}
