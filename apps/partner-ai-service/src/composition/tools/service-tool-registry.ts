import type { ToolCapability } from "@side-chat/partner-ai-core";
import type { RuntimeTool } from "@side-chat/agent-runtime";

/**
 * One source of truth for tool declaration and executable registration.
 *
 * A `ServiceToolRegistration` supplies both the manifest `ToolCapability` and
 * the executable `RuntimeTool` for one tool name. Composition feeds the
 * registry capabilities into the manifest and the registry runtime tools into
 * agent runtime, so a tool can never be declared to the model without a matching
 * executable behind it.
 */
export type ServiceToolRegistration = {
  readonly name: string;
  readonly capability: ToolCapability;
  readonly runtimeTool: RuntimeTool;
  /** Whether the default assistant profile allows this tool without extra policy. */
  readonly defaultEnabled: boolean;
  /** Approval policy ids that gate this tool; reported in diagnostics. */
  readonly approvalPolicyIds: readonly string[];
};

/** Secret-free tool summary exposed by service diagnostics. */
export type ServiceToolStatus = {
  readonly name: string;
  readonly defaultEnabled: boolean;
  readonly approvalPolicyIds: readonly string[];
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
}: {
  readonly capability: ToolCapability;
  readonly runtimeTool: RuntimeTool;
  readonly defaultEnabled?: boolean;
  readonly approvalPolicyIds?: readonly string[];
}): ServiceToolRegistration => ({
  name: runtimeTool.name,
  capability,
  runtimeTool,
  defaultEnabled,
  approvalPolicyIds,
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
