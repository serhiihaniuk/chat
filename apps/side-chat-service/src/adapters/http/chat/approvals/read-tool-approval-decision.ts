import { isRecord } from "@side-chat/shared";

import { readCappedBytes } from "../body/read-capped-bytes.js";

export const TOOL_APPROVAL_DECISION_MAX_BYTES = 4 * 1024;
const TOOL_APPROVAL_REASON_MAX_CHARACTERS = 500;

export async function readToolApprovalDecision(request: Request) {
  const declaredLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > TOOL_APPROVAL_DECISION_MAX_BYTES) {
    return { valid: false as const };
  }
  try {
    const bytes = await readCappedBytes(request.body, TOOL_APPROVAL_DECISION_MAX_BYTES);
    if (bytes === undefined) return { valid: false as const };
    const body: unknown = JSON.parse(new TextDecoder().decode(bytes));
    if (!isRecord(body) || typeof body["approved"] !== "boolean") {
      return { valid: false as const };
    }
    const reason = body["reason"];
    if (
      reason !== undefined &&
      (typeof reason !== "string" || reason.length > TOOL_APPROVAL_REASON_MAX_CHARACTERS)
    ) {
      return { valid: false as const };
    }
    return {
      valid: true as const,
      approved: body["approved"],
      reason: typeof reason === "string" ? reason : undefined,
    };
  } catch {
    return { valid: false as const };
  }
}
