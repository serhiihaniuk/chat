import type { ToolCapability } from "@side-chat/partner-ai-core";
import type { RuntimeTool } from "@side-chat/agent-runtime";

/**
 * One source of truth for tool declaration and executable registration.
 *
 * One registration becomes two downstream targets: the manifest
 * `ToolCapability` and the executable `RuntimeTool`. Composition keeps those
 * targets from the same source so a tool can never be declared to the model
 * without a matching executable behind it.
 */
export type ServiceToolRegistration = {
  readonly name: string;
  readonly capability: ToolCapability;
  readonly runtimeTool: RuntimeTool;
  /** Whether the default profile includes this name before request checks run. */
  readonly defaultEnabled: boolean;
  /** Approval policy ids that gate this tool; reported in diagnostics. */
  readonly approvalPolicyIds: readonly string[];
  /** Curated display label for the composer tools menu; humanized name when absent. */
  readonly label?: string | undefined;
};

/** Secret-free tool summary exposed by service diagnostics. */
export type ServiceToolStatus = {
  readonly name: string;
  readonly defaultEnabled: boolean;
  readonly approvalPolicyIds: readonly string[];
};

/**
 * One tool as the composer tools menu sees it, served by `GET /tools`.
 *
 * The label is the curated display name (humanized tool name when a
 * registration omits one); `defaultEnabled` seeds the menu toggle. Approval and
 * runtime detail stay out — this is a display catalog, not a policy surface.
 */
export type ServiceToolCatalogEntry = {
  readonly name: string;
  readonly label: string;
  readonly description: string;
  readonly defaultEnabled: boolean;
};

/** Tool registry status shape published by `/healthz` and `/readyz`. */
export type ServiceToolRegistryStatus = {
  readonly tools: readonly ServiceToolStatus[];
};

/** Validated tool registry consumed by composition. */
export type ServiceToolRegistry = {
  readonly toolCapabilities: readonly ToolCapability[];
  readonly runtimeTools: readonly RuntimeTool[];
  readonly defaultEnabledToolNames: readonly string[];
  readonly status: ServiceToolRegistryStatus;
  /** Display catalog served by `GET /tools` for the composer tools menu. */
  readonly catalog: readonly ServiceToolCatalogEntry[];
};

/** Composition-time failure raised when tool registrations are invalid. */
export class ServiceToolRegistryError extends Error {
  readonly code = "service_tool_registry_invalid";

  constructor(message: string) {
    super(message);
    this.name = "ServiceToolRegistryError";
  }
}

/**
 * Build one registration from a matched capability and runtime tool.
 *
 * The registration name is taken from the runtime tool; `createServiceToolRegistry`
 * later rejects any registration whose capability or runtime tool name drifts
 * from it.
 */
export const createServiceToolRegistration = ({
  capability,
  runtimeTool,
  defaultEnabled = true,
  approvalPolicyIds = [],
  label,
}: {
  readonly capability: ToolCapability;
  readonly runtimeTool: RuntimeTool;
  readonly defaultEnabled?: boolean;
  readonly approvalPolicyIds?: readonly string[];
  readonly label?: string | undefined;
}): ServiceToolRegistration => ({
  name: runtimeTool.name,
  capability,
  runtimeTool,
  defaultEnabled,
  approvalPolicyIds,
  label,
});

/**
 * Validate tool registrations and split them into manifest and runtime outputs.
 *
 * Manifest capabilities and runtime tools come from the same registration list,
 * so the capability surface and the executable surface stay in lockstep.
 */
export const createServiceToolRegistry = (
  registrations: readonly ServiceToolRegistration[],
): ServiceToolRegistry => {
  const seenNames = new Set<string>();
  for (const registration of registrations) {
    assertMatchingNames(registration);
    assertUniqueName(seenNames, registration.name);
  }

  return {
    toolCapabilities: registrations.map((registration) => registration.capability),
    runtimeTools: registrations.map((registration) => registration.runtimeTool),
    defaultEnabledToolNames: registrations
      .filter((registration) => registration.defaultEnabled)
      .map((registration) => registration.name),
    status: { tools: registrations.map(toToolStatus) },
    catalog: registrations.map(toCatalogEntry),
  };
};

const assertMatchingNames = (registration: ServiceToolRegistration): void => {
  if (
    registration.name === registration.capability.name &&
    registration.name === registration.runtimeTool.name
  ) {
    return;
  }

  throw new ServiceToolRegistryError(
    `Tool registration ${registration.name} must match capability ${registration.capability.name} and runtime tool ${registration.runtimeTool.name}.`,
  );
};

const assertUniqueName = (seen: Set<string>, name: string): void => {
  if (seen.has(name)) {
    throw new ServiceToolRegistryError(`Duplicate tool ${name}.`);
  }
  seen.add(name);
};

const toToolStatus = (registration: ServiceToolRegistration): ServiceToolStatus => ({
  name: registration.name,
  defaultEnabled: registration.defaultEnabled,
  approvalPolicyIds: registration.approvalPolicyIds,
});

const toCatalogEntry = (registration: ServiceToolRegistration): ServiceToolCatalogEntry => ({
  name: registration.name,
  label: registration.label ?? humanizeToolName(registration.name),
  description: registration.capability.description,
  defaultEnabled: registration.defaultEnabled,
});

// Fallback for a registration with no curated label: split the snake/kebab tool
// name into words and title-case them (`mock_web_search` -> `Mock Web Search`).
const humanizeToolName = (name: string): string => {
  const words = name
    .trim()
    .split(/[\s_-]+/u)
    .filter(Boolean);
  if (words.length === 0) return name;
  return words.map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(" ");
};
