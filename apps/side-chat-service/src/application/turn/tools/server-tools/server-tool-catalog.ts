import { isRecord, type JsonValue } from "@side-chat/shared";

export const SERVER_TOOL_APPROVAL_POLICIES = Object.freeze({
  UNGATED: "ungated",
  ALWAYS: "always",
  PER_INPUT: "per_input",
} as const);

export const SERVER_TOOL_CATALOG_LIMITS = Object.freeze({
  MAX_TOOLS: 16,
  MAX_NAME_LENGTH: 64,
  MAX_DESCRIPTION_LENGTH: 1_024,
} as const);

const SERVER_TOOL_NAME_PATTERN = /^[A-Za-z][A-Za-z0-9_.-]*$/u;

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
  /** Available only in the post-approval execution step. */
  generateText?: ServerToolTextGenerator | undefined;
}>;

export type ServerToolTextGenerationRequest = Readonly<{
  modelId: string;
  system: string;
  prompt: string;
  maxOutputTokens: number;
}>;

export type ServerToolTextGenerator = (request: ServerToolTextGenerationRequest) => Promise<string>;

export type ServerToolSource = Readonly<{
  label: string;
  url: string;
}>;

/** A server-owned tool cannot enter the catalog without an approval classification. */
export type ServerToolDefinition<Input extends JsonValue = JsonValue, Output = unknown> = Readonly<{
  name: string;
  description: string;
  inputSchema: Readonly<Record<string, unknown>>;
  /** Revalidate journaled input against the current schema after a durable resume. */
  validateInput: (input: JsonValue) => input is Input;
  approvalPolicy: ServerToolApprovalPolicy<Input>;
  /** Hidden models required by this tool, separate from the user-selectable model catalog. */
  internalModelIds?: readonly string[] | undefined;
  /** Project trusted tool output into durable native source parts for the widget. */
  readSources?(output: Output): readonly ServerToolSource[];
  execute: (input: Input, context: ServerToolExecutionContext) => Promise<Output>;
}>;

/**
 * Preserve the tool's input/output types while rejecting an unclassified policy
 * at the catalog boundary. This runtime check protects dynamically composed
 * catalogs in addition to the TypeScript discriminated union.
 */
export type ServerToolCatalogOption = Readonly<{
  name: string;
  label: string;
  description: string;
  defaultEnabled: boolean;
}>;

/** Expose only the display contract; schemas, executors, and policies stay private. */
export function toServerToolCatalog(
  definitions: readonly ServerToolDefinition[],
): readonly ServerToolCatalogOption[] {
  return definitions.map((definition) => ({
    name: definition.name,
    label: toReadableToolLabel(definition.name),
    description: definition.description,
    defaultEnabled: true,
  }));
}

/** Absent means the registered catalog; present input can only narrow it. */
export function selectServerToolDefinitions(
  definitions: readonly ServerToolDefinition[],
  enabledToolNames: readonly string[] | undefined,
): readonly ServerToolDefinition[] {
  if (enabledToolNames === undefined) return definitions;
  const enabled = new Set(enabledToolNames);
  return definitions.filter((definition) => enabled.has(definition.name));
}

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

function toReadableToolLabel(name: string): string {
  const normalized = name
    .replace(/([a-z0-9])([A-Z])/gu, "$1 $2")
    .replace(/[\s_-]+/gu, " ")
    .trim()
    .toLowerCase();
  return normalized.length === 0
    ? normalized
    : `${normalized[0]?.toUpperCase()}${normalized.slice(1)}`;
}

function isServerToolDefinition(value: Record<string, unknown>): value is ServerToolDefinition {
  const name = value["name"];
  const description = value["description"];
  return (
    typeof name === "string" &&
    name === name.trim() &&
    name.length <= SERVER_TOOL_CATALOG_LIMITS.MAX_NAME_LENGTH &&
    SERVER_TOOL_NAME_PATTERN.test(name) &&
    typeof description === "string" &&
    description === description.trim() &&
    description.length > 0 &&
    description.length <= SERVER_TOOL_CATALOG_LIMITS.MAX_DESCRIPTION_LENGTH &&
    isRecord(value["inputSchema"]) &&
    typeof value["validateInput"] === "function" &&
    typeof value["execute"] === "function"
  );
}
