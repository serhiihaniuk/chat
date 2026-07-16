import { isRecord, type JsonValue } from "@side-chat/shared";

import { CLIENT_TOOL_OUTPUT_STATES } from "#application/ports/turn/tools/client-tool-dispatch-store";

import { readCappedBytes } from "../body/read-capped-bytes.js";

export const CLIENT_TOOL_OUTPUT_MAX_BYTES = 64 * 1024;
const CLIENT_TOOL_OUTPUT_MAX_DEPTH = 16;
const INVALID_CLIENT_TOOL_OUTPUT = {
  value: {
    status: CLIENT_TOOL_OUTPUT_STATES.FAILED,
    errorCode: "invalid_client_tool_output",
  },
} as const;

export async function readClientToolOutput(request: Request) {
  const declaredLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > CLIENT_TOOL_OUTPUT_MAX_BYTES) {
    return { valid: false as const, output: INVALID_CLIENT_TOOL_OUTPUT };
  }
  try {
    const bytes = await readCappedBytes(request.body, CLIENT_TOOL_OUTPUT_MAX_BYTES);
    if (bytes === undefined) {
      return { valid: false as const, output: INVALID_CLIENT_TOOL_OUTPUT };
    }
    const body: unknown = JSON.parse(new TextDecoder().decode(bytes));
    if (!isRecord(body) || !("output" in body) || !isBoundedJson(body["output"])) {
      return { valid: false as const, output: INVALID_CLIENT_TOOL_OUTPUT };
    }
    return { valid: true as const, output: { value: body["output"] } };
  } catch {
    return { valid: false as const, output: INVALID_CLIENT_TOOL_OUTPUT };
  }
}

function isBoundedJson(value: unknown, depth = 0): value is JsonValue {
  if (depth > CLIENT_TOOL_OUTPUT_MAX_DEPTH || value === undefined) return false;
  if (value === null || typeof value === "string" || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) return value.every((entry) => isBoundedJson(entry, depth + 1));
  if (!isRecord(value)) return false;
  return Object.values(value).every((entry) => isBoundedJson(entry, depth + 1));
}
