import { isRecord } from "@side-chat/shared";

import { readCappedBytes } from "../body/read-capped-bytes.js";

export const TOOL_APPROVAL_DECISION_MAX_BYTES = 4 * 1024;

export async function readToolApprovalDecision(request: Request) {
  const declaredLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > TOOL_APPROVAL_DECISION_MAX_BYTES) {
    return { valid: false as const };
  }
  try {
    const bytes = await readCappedBytes(request.body, TOOL_APPROVAL_DECISION_MAX_BYTES);
    if (bytes === undefined) return { valid: false as const };
    const body: unknown = JSON.parse(new TextDecoder().decode(bytes));
    if (
      !isRecord(body) ||
      Object.keys(body).length !== 1 ||
      typeof body["approved"] !== "boolean"
    ) {
      return { valid: false as const };
    }
    return {
      valid: true as const,
      approved: body["approved"],
    };
  } catch {
    return { valid: false as const };
  }
}
