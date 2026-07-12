import { isRecord, type JsonValue } from "@side-chat/shared";

export const SERVER_TOOL_APPROVAL_POLICIES = Object.freeze({
  UNGATED: "ungated",
  ALWAYS: "always",
  PER_INPUT: "per_input",
} as const);

export type ServerToolApprovalPolicyKind =
  (typeof SERVER_TOOL_APPROVAL_POLICIES)[keyof typeof SERVER_TOOL_APPROVAL_POLICIES];

export type ServerToolApprovalPolicy<Input extends JsonValue> =
  | Readonly<{ kind: typeof SERVER_TOOL_APPROVAL_POLICIES.UNGATED }>
  | Readonly<{ kind: typeof SERVER_TOOL_APPROVAL_POLICIES.ALWAYS }>
  | Readonly<{
      kind: typeof SERVER_TOOL_APPROVAL_POLICIES.PER_INPUT;
      requiresApproval: (input: Input) => boolean | Promise<boolean>;
    }>;

export type ServerToolExecutionContext = Readonly<{
  /** Stable identity that a mutating adapter must use for idempotency. */
  executionKey: string;
}>;

/** A server-owned tool cannot enter the catalog without an approval classification. */
export type ServerToolDefinition<Input extends JsonValue = JsonValue, Output = unknown> = Readonly<{
  name: string;
  description: string;
  inputSchema: Readonly<Record<string, unknown>>;
  /** Revalidate journaled input against the current schema after a durable resume. */
  validateInput: (input: JsonValue) => input is Input;
  approvalPolicy: ServerToolApprovalPolicy<Input>;
  execute: (input: Input, context: ServerToolExecutionContext) => Promise<Output>;
}>;

/**
 * Preserve the tool's input/output types while rejecting an unclassified policy
 * at the catalog boundary. This runtime check protects dynamically composed
 * catalogs in addition to the TypeScript discriminated union.
 */
export function defineServerTool<Input extends JsonValue, Output>(
  definition: ServerToolDefinition<Input, Output>,
): ServerToolDefinition<Input, Output>;
export function defineServerTool(definition: unknown): ServerToolDefinition;
export function defineServerTool(definition: unknown): ServerToolDefinition {
  if (!isRecord(definition)) throw new TypeError("Server tool definition is invalid");
  assertApprovalPolicy(definition["approvalPolicy"]);
  if (typeof definition["validateInput"] !== "function") {
    throw new TypeError("Server tool input validator is missing or invalid");
  }
  if (!isServerToolDefinition(definition)) {
    throw new TypeError("Server tool definition is incomplete or invalid");
  }
  return Object.freeze(definition);
}

/** Resolve the policy again immediately before a durable approval decision is used. */
export async function requiresServerToolApproval<Input extends JsonValue>(
  policy: ServerToolApprovalPolicy<Input>,
  input: Input,
): Promise<boolean> {
  if (policy.kind === SERVER_TOOL_APPROVAL_POLICIES.UNGATED) return false;
  if (policy.kind === SERVER_TOOL_APPROVAL_POLICIES.ALWAYS) return true;
  return await policy.requiresApproval(input);
}

function assertApprovalPolicy(policy: unknown): void {
  if (!isRecord(policy)) throw new TypeError("Server tool approval policy is missing or invalid");
  if (
    policy["kind"] === SERVER_TOOL_APPROVAL_POLICIES.UNGATED ||
    policy["kind"] === SERVER_TOOL_APPROVAL_POLICIES.ALWAYS
  ) {
    return;
  }
  if (
    policy["kind"] === SERVER_TOOL_APPROVAL_POLICIES.PER_INPUT &&
    typeof policy["requiresApproval"] === "function"
  ) {
    return;
  }
  throw new TypeError("Server tool approval policy is missing or invalid");
}

function isServerToolDefinition(value: Record<string, unknown>): value is ServerToolDefinition {
  return (
    typeof value["name"] === "string" &&
    typeof value["description"] === "string" &&
    isRecord(value["inputSchema"]) &&
    typeof value["validateInput"] === "function" &&
    typeof value["execute"] === "function"
  );
}
