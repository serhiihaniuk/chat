import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import { ServiceCapabilityConfigurationError } from "#composition/capabilities/capability-status";
import { DEFAULT_SERVICE_CAPABILITY_CONFIG } from "#composition/capabilities/service-capability-settings";
import type {
  ServicePersistenceBundle,
  ServiceSecurityBundle,
} from "./bundle-types.js";
import { createServiceAssistantBundle } from "./create-service-assistant-bundle.js";
import { createServiceCapabilityBundle } from "./create-service-capability-bundle.js";
import { createServiceProviderBundle } from "./create-service-provider-bundle.js";
import { createServiceToolBundle } from "./create-service-tool-bundle.js";

const workspace = { tenantId: "tenant_cap", workspaceId: "workspace_cap" } as const;

const authContext = {
  tenantId: workspace.tenantId,
  workspaceId: workspace.workspaceId,
  subject: { subjectId: "subject_1", userId: "user_1" },
  actor: { subjectId: "subject_1", userId: "user_1" },
  roles: ["member"],
  scopes: ["conversation:read"],
  source: "test_authority",
  issuedAt: "2026-06-16T00:00:00.000Z",
} as const;

const buildInput = (security: ServiceSecurityBundle, persistence: ServicePersistenceBundle) => {
  const providers = createServiceProviderBundle({ workspace });
  const tools = createServiceToolBundle({ workspace });
  const assistants = createServiceAssistantBundle(
    { workspace },
    { providers: providers.registry, tools: tools.registry, turnGuardIds: [], registeredGuardIds: [] },
  );
  return { assistants: assistants.registry, tools: tools.registry, persistence, security };
};

const developmentSecurity: ServiceSecurityBundle = {
  auth: { profile: "development", workspace },
  policies: { profile: "development", mode: "allow_all" },
};

const memoryPersistence: ServicePersistenceBundle = {
  persistence: { kind: "memory" },
  repositories: {} as ServicePersistenceBundle["repositories"],
  persistenceLabel: "memory",
};

describe("createServiceCapabilityBundle", () => {
  it("publishes a manifest the manifest port resolves under the matching host app id", async () => {
    const bundle = createServiceCapabilityBundle(
      { workspace },
      buildInput(developmentSecurity, memoryPersistence),
    );

    const loaded = await Effect.runPromise(
      bundle.manifestPort.loadManifest({
        authContext,
        workspace,
        hostAppId: bundle.manifest.hostAppId,
      }),
    );

    expect(loaded.hostAppId).toBe(bundle.manifest.hostAppId);
    expect(bundle.capabilityStatus.persistence.adapterId).toBe("memory-sidechat-repositories");
  });

  it("fails closed in production when a model-visible capability is only declared", () => {
    const productionSecurity: ServiceSecurityBundle = {
      auth: { profile: "production", workspace },
      policies: { profile: "production", mode: "fail_closed" },
    };

    expect(() =>
      createServiceCapabilityBundle(
        {
          workspace,
          capabilities: {
            ...DEFAULT_SERVICE_CAPABILITY_CONFIG,
            history: { mode: "recent_plus_summary", maxMessages: 6, maxTokens: 900 },
          },
        },
        buildInput(productionSecurity, memoryPersistence),
      ),
    ).toThrow(ServiceCapabilityConfigurationError);
  });
});
