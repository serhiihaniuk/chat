import type { ModelProvider, RuntimeTool } from "@side-chat/agent-runtime";
import type {
  AiRuntimePort,
  ContextManagerPort,
  ConversationHistoryContextPort,
  HostCapabilityManifest,
  HostCapabilityManifestPort,
  StreamChatPorts,
  ToolCapability,
  TurnPolicyResolverPort,
} from "@side-chat/partner-ai-core";
import type { SidechatRepositories } from "@side-chat/db";

import type { ServiceAuthConfig } from "#adapters/auth/service-auth";
import type { ServicePolicyConfig } from "#adapters/policy/service-policy";
import type { InMemoryTurnEventLog } from "#adapters/persistence/turn-events/in-memory-turn-event-log";
import type {
  TurnProfileRegistry,
  ServiceTurnProfile,
} from "#composition/turn-profile/turn-profile-registry";
import type { SystemPromptBuilder } from "#composition/turn-profile/system-prompt-builder";
import type { ServiceCapabilityStatus } from "#composition/capabilities/capability-status";
import type { ServiceProviderRegistry } from "#composition/providers/service-provider-registry";
import type { ServiceToolRegistry } from "#composition/tools/service-tool-registry";
import type { PersistenceConfig } from "../service-composition-types.js";

/**
 * Named groups of already-wired dependencies returned by composition factories.
 *
 * Bundles make composition dependencies explicit: each factory takes a typed
 * input and returns one of these, so the composition root reads as a dependency
 * graph instead of a flat pile of ports. Bundles may name adapters,
 * repositories, registries, and secret-free diagnostics, but never provider
 * stream parts, secrets, or browser UI state.
 */

/** Auth and policy configuration. Basic/pass-through auth for alpha RC. */
export type ServiceSecurityBundle = {
  readonly auth: ServiceAuthConfig;
  readonly policies: ServicePolicyConfig;
};

/** Persistence config, repositories, and the secret-free adapter label. */
export type ServicePersistenceBundle = {
  readonly persistence: PersistenceConfig;
  readonly repositories: SidechatRepositories;
  readonly persistenceLabel: "memory" | "postgres-drizzle";
};

/** Provider registry plus the runtime provider list and default ids. */
export type ServiceProviderBundle = {
  readonly registry: ServiceProviderRegistry;
  readonly runtimeProviders: readonly ModelProvider[];
  readonly defaultProviderId: string;
  readonly defaultModelId: string;
};

/** Tool registry plus the runtime tools and manifest capabilities. */
export type ServiceToolBundle = {
  readonly registry: ServiceToolRegistry;
  readonly runtimeTools: readonly RuntimeTool[];
  readonly toolCapabilities: readonly ToolCapability[];
};

/** Turn profile registry, default profile id, and the prompt builder. */
export type ServiceTurnProfileBundle = {
  readonly registry: TurnProfileRegistry;
  readonly defaultTurnProfileId: string;
  readonly promptBuilder: SystemPromptBuilder;
};

/** Host capability manifest, its port, the turn policy resolver, and status. */
export type ServiceCapabilityBundle = {
  readonly manifest: HostCapabilityManifest;
  readonly manifestPort: HostCapabilityManifestPort;
  readonly turnPolicyResolver: TurnPolicyResolverPort;
  readonly capabilityStatus: ServiceCapabilityStatus;
};

/** History context port and the context manager built on top of it. */
export type ServiceContextBundle = {
  readonly historyContext: ConversationHistoryContextPort;
  readonly contextManager: ContextManagerPort;
};

/** The prepared runtime port. Runtime gets providers and tools, never profiles. */
export type ServiceRuntimeBundle = {
  readonly runtime: AiRuntimePort;
};

/** The final stream-chat ports object consumed by HTTP routes. */
export type StreamChatPortsBundle = {
  readonly ports: StreamChatPorts;
  /** The in-memory registry backing `ports.turnEventLog`, reused as the SSE dispatcher. */
  readonly turnEventLog: InMemoryTurnEventLog;
};

/**
 * Secret-free composition diagnostics surfaced by health and models routes.
 *
 * Source is the validated registries and persistence label; the target is the
 * health/models response. Diagnostics preserve selected runtime ids, registry
 * status, and adapter labels, but secrets and provider options stay hidden so
 * routes read these instead of reaching back into the wiring.
 */
export type ServiceDiagnostics = {
  readonly runtimeProviderId: string;
  readonly runtimeModelId: string;
  readonly providerRegistryStatus: ServiceProviderRegistry["status"];
  readonly toolRegistryStatus: ServiceToolRegistry["status"];
  readonly turnProfiles: readonly ServiceTurnProfile[];
  readonly persistenceLabel: "memory" | "postgres-drizzle";
};
