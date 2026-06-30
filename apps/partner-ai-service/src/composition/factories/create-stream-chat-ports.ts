// Owns: assembling the final StreamChatPorts object HTTP routes hand to core,
// including the conversation/turn ports, clock, and id generator defaults.
// Does not own: request parsing, SSE transport, or any product policy decision
// (those live in core; routes only carry these ports across the boundary).

import {
  DISABLED_CONVERSATION_TITLE_GENERATION,
  type ClockPort,
  type ConversationTitleGenerationPort,
  type IdGeneratorPort,
  type ObservabilitySinkPort,
  type StreamChatPorts,
  type TurnGuardRegistryPort,
} from "@side-chat/partner-ai-core";

import { createServicePolicyPort } from "#adapters/policy/service-policy";
import { createServicePersistence } from "#adapters/persistence/service-persistence";
import { createInMemoryTurnEventLog } from "#adapters/persistence/turn-events/in-memory-turn-event-log";
import type {
  ServiceCapabilityBundle,
  ServiceContextBundle,
  ServicePersistenceBundle,
  ServiceRuntimeBundle,
  ServiceSecurityBundle,
  StreamChatPortsBundle,
} from "./bundle-types.js";

export type StreamChatPortsInput = {
  readonly persistence: ServicePersistenceBundle;
  readonly capabilities: ServiceCapabilityBundle;
  readonly context: ServiceContextBundle;
  readonly runtime: ServiceRuntimeBundle;
  readonly security: ServiceSecurityBundle;
  readonly turnGuards: TurnGuardRegistryPort;
  readonly titleGeneration?: ConversationTitleGenerationPort | undefined;
  readonly observability?: ObservabilitySinkPort | undefined;
};

/**
 * Assemble the one ports object routes pass to core.
 *
 * Routes receive ready ports, not configuration: the conversation and turn
 * ports come from the repositories, the policy port from the resolved policy
 * config, and clock/id generators fall back to system defaults here so core
 * never reaches for ambient time or randomness.
 */
export const createStreamChatPorts = (input: StreamChatPortsInput): StreamChatPortsBundle => {
  const persistence = createServicePersistence(input.persistence.repositories);
  // Connection-bound transport: the live stream lives in this per-instance registry,
  // not a durable log. It is also the SSE dispatcher (see service-composition).
  const turnEventLog = createInMemoryTurnEventLog();

  const ports: StreamChatPorts = {
    conversations: persistence.conversations,
    assistantTurns: persistence.assistantTurns,
    turnEventLog,
    hostCapabilities: input.capabilities.manifestPort,
    turnPolicies: input.capabilities.turnPolicyResolver,
    turnGuards: input.turnGuards,
    contextManager: input.context.contextManager,
    runtime: input.runtime.runtime,
    conversationTitleGeneration: input.titleGeneration ?? DISABLED_CONVERSATION_TITLE_GENERATION,
    clock: systemClock,
    ids: randomIds,
    policies: createServicePolicyPort(input.security.policies),
    observability: input.observability,
  };

  return { ports, turnEventLog };
};

const systemClock: ClockPort = {
  now: () => new Date().toISOString(),
};

const randomIds: IdGeneratorPort = {
  nextConversationId: () => `conversation_${crypto.randomUUID()}`,
  nextEventId: () => `event_${crypto.randomUUID()}`,
};
