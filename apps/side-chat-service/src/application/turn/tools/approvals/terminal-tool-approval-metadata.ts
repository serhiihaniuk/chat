const TERMINAL_TOOL_STATES = new Set(["output-available", "output-error", "output-denied"]);

/**
 * Approval ids describe a pending interaction, not a completed tool result.
 *
 * AI SDK's stream reducer currently retains `approval` when a later tool-output
 * chunk moves the same part to a terminal state. Its persisted-message validator
 * correctly rejects that impossible combination, so remove the transient field
 * before persistence and when reading rows written by older builds.
 */
export function withoutTerminalToolApprovalMetadata<Part extends Readonly<Record<string, unknown>>>(
  part: Part,
): Part {
  if (!isTerminalApprovedToolPart(part)) return part;
  const sanitized = { ...part };
  Reflect.deleteProperty(sanitized, "approval");
  return sanitized;
}

function isTerminalApprovedToolPart(part: Readonly<Record<string, unknown>>): boolean {
  return (
    typeof part["type"] === "string" &&
    part["type"].startsWith("tool-") &&
    typeof part["state"] === "string" &&
    TERMINAL_TOOL_STATES.has(part["state"]) &&
    Object.hasOwn(part, "approval")
  );
}
