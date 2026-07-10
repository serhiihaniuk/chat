import type { ToolCapability } from "@side-chat/partner-ai-core";
import type { AgentRuntime, RuntimeTool } from "@side-chat/agent-runtime";

/**
 * Read the AgentRuntime owned by one service composition.
 *
 * A runtime-aware tool receives this before its registry has built the runtime,
 * so it returns `undefined` until composition completes the cycle.
 */
export type ServiceToolRuntimeAccessor = () => AgentRuntime | undefined;

type ServiceRuntimeToolFactory = (getRuntime: ServiceToolRuntimeAccessor) => RuntimeTool;

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
  /**
   * Directly executable tool definition exposed to adopters and unit tests.
   *
   * Runtime-aware registrations create this with an unset accessor, so it uses
   * the tool's documented no-runtime behavior. Composition executes the fresh,
   * registry-owned instance returned by `createRuntimeTool` below.
   */
  readonly runtimeTool: RuntimeTool;
  /**
   * Create the executable for one service composition.
   *
   * The factory receives a composition-local runtime accessor from its target
   * registry. Invariant: a sub-agent tool can cross the tools-before-runtime
   * construction cycle without storing mutable state on this registration.
   */
  readonly createRuntimeTool: ServiceRuntimeToolFactory;
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
 * runtime detail are hidden — this is a display catalog, not a policy surface.
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
  /** Complete the composition-local accessor used by runtime-aware tools. */
  readonly bindRuntime: (runtime: AgentRuntime) => void;
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
 * Build one reusable registration from a capability and executable definition.
 *
 * Ordinary tools supply their executable directly. Runtime-aware tools supply a
 * factory; the registration exposes its no-runtime form while each registry
 * realizes a composition-local executable and validates that its name still
 * matches the capability.
 */
export const createServiceToolRegistration = (
  input: {
    readonly capability: ToolCapability;
    readonly defaultEnabled?: boolean;
    readonly approvalPolicyIds?: readonly string[];
    readonly label?: string | undefined;
  } & (
    | {
        readonly runtimeTool: RuntimeTool;
        readonly createRuntimeTool?: never;
      }
    | {
        readonly runtimeTool?: never;
        readonly createRuntimeTool: ServiceRuntimeToolFactory;
      }
  ),
): ServiceToolRegistration => {
  const createRuntimeTool =
    "createRuntimeTool" in input ? input.createRuntimeTool : () => input.runtimeTool;
  const runtimeTool =
    "runtimeTool" in input ? input.runtimeTool : input.createRuntimeTool(() => undefined);

  return {
    name: runtimeTool.name,
    capability: input.capability,
    runtimeTool,
    createRuntimeTool,
    defaultEnabled: input.defaultEnabled ?? true,
    approvalPolicyIds: input.approvalPolicyIds ?? [],
    label: input.label,
  };
};

/**
 * Validate tool registrations and split them into manifest and runtime outputs.
 *
 * Manifest capabilities and runtime tools come from the same registration list.
 * Each registry also owns the late runtime handle captured by its realized
 * tools, so an immutable registration can be reused without coupling service
 * compositions together.
 */
export const createServiceToolRegistry = (
  registrations: readonly ServiceToolRegistration[],
): ServiceToolRegistry => {
  const runtimeHandle: { current: AgentRuntime | undefined } = { current: undefined };
  const getRuntime: ServiceToolRuntimeAccessor = () => runtimeHandle.current;
  const realizedRegistrations = registrations.map((registration) => ({
    registration,
    runtimeTool: registration.createRuntimeTool(getRuntime),
  }));
  const seenNames = new Set<string>();
  for (const { registration, runtimeTool } of realizedRegistrations) {
    assertMatchingNames(registration, runtimeTool);
    assertUniqueName(seenNames, registration.name);
  }

  return {
    toolCapabilities: registrations.map((registration) => registration.capability),
    runtimeTools: realizedRegistrations.map(({ runtimeTool }) => runtimeTool),
    defaultEnabledToolNames: registrations
      .filter((registration) => registration.defaultEnabled)
      .map((registration) => registration.name),
    status: { tools: registrations.map(toToolStatus) },
    catalog: registrations.map(toCatalogEntry),
    bindRuntime: (runtime) => {
      runtimeHandle.current = runtime;
    },
  };
};

const assertMatchingNames = (
  registration: ServiceToolRegistration,
  runtimeTool: RuntimeTool,
): void => {
  if (
    registration.name === registration.capability.name &&
    registration.name === runtimeTool.name
  ) {
    return;
  }

  throw new ServiceToolRegistryError(
    `Tool registration ${registration.name} must match capability ${registration.capability.name} and runtime tool ${runtimeTool.name}.`,
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
