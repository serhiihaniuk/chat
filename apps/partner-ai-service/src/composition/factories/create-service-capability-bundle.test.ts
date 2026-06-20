import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import type { ServicePersistenceBundle } from "./bundle-types.js";
import { createServiceTurnProfileBundle } from "./create-service-turn-profile-bundle.js";
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

const buildInput = (persistence: ServicePersistenceBundle) => {
  const providers = createServiceProviderBundle({ workspace });
  const tools = createServiceToolBundle({ workspace });
  const turnProfiles = createServiceTurnProfileBundle(
    { workspace },
    {
      providers: providers.registry,
      tools: tools.registry,
      turnGuardIds: [],
      registeredGuardIds: [],
    },
  );
  return {
    turnProfiles: turnProfiles.registry,
    providers: providers.registry,
    tools: tools.registry,
    persistence,
  };
};

const memoryPersistence: ServicePersistenceBundle = {
  persistence: { kind: "memory" },
  repositories: {} as ServicePersistenceBundle["repositories"],
  persistenceLabel: "memory",
};

describe("createServiceCapabilityBundle", () => {
  it("publishes a manifest the manifest port resolves under the matching host app id", async () => {
    const bundle = createServiceCapabilityBundle({ workspace }, buildInput(memoryPersistence));

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

  it("publishes configured history status", () => {
    const bundle = createServiceCapabilityBundle(
      {
        workspace,
        capabilities: {
          history: { mode: "recent_messages", maxMessages: 6, maxTokens: 900 },
          contextAdmission: {
            policyId: "deterministic_v1",
            maxInputTokens: 24_000,
            reservedOutputTokens: 4_000,
            maxHistoryTokens: 4_000,
          },
        },
      },
      buildInput(memoryPersistence),
    );

    expect(bundle.capabilityStatus.history).toMatchObject({
      state: "configured",
      policyId: "recent_messages",
      safeForProduction: true,
    });
  });
});
