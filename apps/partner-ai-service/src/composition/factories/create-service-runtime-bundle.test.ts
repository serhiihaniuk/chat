import { AiRuntimeError } from "@side-chat/ai-runtime-contract";
import { Effect, Stream } from "effect";
import { describe, expect, it } from "vitest";
import type { AiRuntimePort } from "@side-chat/partner-ai-core";
import type { ServiceProviderBundle, ServiceToolBundle } from "./bundle-types.js";
import { createServiceProviderBundle } from "./create-service-provider-bundle.js";
import { createServiceRuntimeBundle } from "./create-service-runtime-bundle.js";
import { createServiceToolBundle } from "./create-service-tool-bundle.js";

const workspace = { tenantId: "tenant_rt", workspaceId: "workspace_rt" } as const;

const providerBundle = (): ServiceProviderBundle => createServiceProviderBundle({ workspace });
const toolBundle = (): ServiceToolBundle => createServiceToolBundle({ workspace });

describe("createServiceRuntimeBundle", () => {
  it("builds an AgentRuntime from the provider and tool bundles", () => {
    const bundle = createServiceRuntimeBundle(
      { workspace },
      { providers: providerBundle(), tools: toolBundle() },
    );

    expect(bundle.runtime.streamEffect).toBeTypeOf("function");
  });

  it("returns the injected runtime untouched for tests", () => {
    const injected: AiRuntimePort = { streamEffect: () => Stream.empty };

    const bundle = createServiceRuntimeBundle(
      { workspace, agentRuntime: injected },
      { providers: providerBundle(), tools: toolBundle() },
    );

    expect(bundle.runtime).toBe(injected);
  });

  it("rejects duplicate runtime tools", () => {
    const duplicate = {
      name: "dup_tool",
      description: "Duplicated tool.",
      inputSchema: { type: "object" },
      execute: () => Effect.succeed({}),
    } as const;
    const tools: ServiceToolBundle = {
      registry: toolBundle().registry,
      runtimeTools: [duplicate, duplicate],
      toolCapabilities: [],
    };

    expect(() =>
      createServiceRuntimeBundle({ workspace }, { providers: providerBundle(), tools }),
    ).toThrow(AiRuntimeError);
  });
});
