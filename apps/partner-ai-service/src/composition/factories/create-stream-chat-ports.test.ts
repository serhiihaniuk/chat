import { createMemorySidechatRepositories } from "@side-chat/db";
import { describe, expect, it } from "vitest";
import { DEFAULT_SERVICE_CONVERSATION_TITLE_GENERATION } from "#config/service-conversation-title-config";
import type { ServicePersistenceBundle, ServiceSecurityBundle } from "./bundle-types.js";
import { createServiceAssistantBundle } from "./create-service-assistant-bundle.js";
import { createServiceCapabilityBundle } from "./create-service-capability-bundle.js";
import { createServiceContextBundle } from "./create-service-context-bundle.js";
import { createServiceProviderBundle } from "./create-service-provider-bundle.js";
import { createServiceRuntimeBundle } from "./create-service-runtime-bundle.js";
import { createServiceToolBundle } from "./create-service-tool-bundle.js";
import { createStreamChatPorts } from "./create-stream-chat-ports.js";

const workspace = { tenantId: "tenant_ports", workspaceId: "workspace_ports" } as const;

const buildDeps = (security: ServiceSecurityBundle) => {
  const repositories = createMemorySidechatRepositories();
  const persistence: ServicePersistenceBundle = {
    persistence: { kind: "memory" },
    repositories,
    persistenceLabel: "memory",
  };
  const providers = createServiceProviderBundle({ workspace });
  const tools = createServiceToolBundle({ workspace });
  const assistants = createServiceAssistantBundle(
    { workspace },
    {
      providers: providers.registry,
      tools: tools.registry,
      turnGuardIds: [],
      registeredGuardIds: [],
    },
  );
  const capabilities = createServiceCapabilityBundle(
    { workspace },
    { assistants: assistants.registry, tools: tools.registry, persistence },
  );
  const context = createServiceContextBundle({ workspace }, { repositories });
  const runtime = createServiceRuntimeBundle({ workspace }, { providers, tools });
  return { persistence, capabilities, context, runtime, security };
};

const developmentSecurity: ServiceSecurityBundle = {
  auth: { profile: "development", workspace },
  policies: { profile: "development", mode: "allow_all" },
};

describe("createStreamChatPorts", () => {
  it("assembles a complete StreamChatPorts object with default clock and ids", () => {
    const deps = buildDeps(developmentSecurity);

    const { ports } = createStreamChatPorts({
      ...deps,
      turnGuards: { guards: [] },
      titleGeneration: DEFAULT_SERVICE_CONVERSATION_TITLE_GENERATION,
    });

    expect(ports.conversations).toBeDefined();
    expect(ports.assistantTurns).toBeDefined();
    expect(ports.runtime).toBe(deps.runtime.runtime);
    expect(ports.contextManager).toBe(deps.context.contextManager);
    expect(ports.clock.now()).toBeTypeOf("string");
    expect(ports.ids.nextConversationId()).toContain("conversation_");
    expect(ports.conversationTitleGeneration.mode).toBe("enabled");
  });

  it("disables title generation when none is provided", () => {
    const deps = buildDeps(developmentSecurity);

    const { ports } = createStreamChatPorts({ ...deps, turnGuards: { guards: [] } });

    expect(ports.conversationTitleGeneration.mode).toBe("disabled");
  });

  it("fails closed when the policy port cannot honor the resolved policy", () => {
    const productionSecurity: ServiceSecurityBundle = {
      auth: { profile: "production", workspace },
      policies: { profile: "production", mode: "allow_all" },
    };
    const deps = buildDeps(developmentSecurity);

    expect(() =>
      createStreamChatPorts({ ...deps, security: productionSecurity, turnGuards: { guards: [] } }),
    ).toThrow("Production policy cannot use the allow-all adapter.");
  });
});
