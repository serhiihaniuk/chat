import { NOOP_OBSERVABILITY_SINK, type ObservabilityRecord } from "@side-chat/partner-ai-core";
import { SILENT_DIAGNOSTIC_LOGGER } from "@side-chat/shared";
import { Effect } from "effect";
import { afterEach, describe, expect, it, vi } from "vitest";

import sideChatFakeConfig from "#sidechat-fake-config";
import { createPartnerAiServiceApp } from "#inbound/http/app";
import { TOOLS } from "#config/catalog/capabilities/tools";
import { TOOL_POLICY_MODES } from "#config/catalog/config-values";
import {
  createPartnerAiServiceOptionsFromConfig,
  defineSideChatConfig,
} from "#config/sidechat-config";
import { createDefaultObservabilitySink } from "#adapters/observability/service-observability";
import { readLoggingConfig } from "#config/sidechat-config/environment";
import { SERVICE_ENV_KEYS } from "#config/env/service-env-contract";

const FAKE_ENV = {
  [SERVICE_ENV_KEYS.authBearerToken]: "local-fake-token",
  [SERVICE_ENV_KEYS.safetyPollIntervalMs]: "10",
} as const;

describe("config-driven tool registration", () => {
  it("registers a config tool through the map and offers it to the model", async () => {
    // The tool comes only from the config `tools` block through the registration
    // map (no programmatic `runtime.tools`); the manifest offering it — plus the
    // profile allowlisting it — is what makes it model-callable.
    const options = createPartnerAiServiceOptionsFromConfig(sideChatFakeConfig, FAKE_ENV);
    expect(options.runtime).toMatchObject({
      tools: [{ name: TOOLS.MOCK_WEB_SEARCH.NAME, defaultEnabled: true }],
    });
    expect(options.turnProfiles?.[0]?.toolPolicy).toMatchObject({
      allowedToolNames: [TOOLS.MOCK_WEB_SEARCH.NAME],
    });

    const app = createPartnerAiServiceApp(options);
    const health = await app.request("/healthz");
    await expect(health.json()).resolves.toMatchObject({
      tools: { tools: [{ name: TOOLS.MOCK_WEB_SEARCH.NAME, defaultEnabled: true }] },
    });
  });

  it("fails boot with the available tool names when a configured tool is unknown", () => {
    const unknownName = "custom.unknown_tool";
    const [baseTool] = sideChatFakeConfig.tools.availableTools;
    if (!baseTool) throw new Error("Expected the fake config to configure a tool.");
    const config = defineSideChatConfig({
      ...sideChatFakeConfig,
      tools: {
        availableTools: [
          {
            ...baseTool,
            tool: { ...TOOLS.MOCK_WEB_SEARCH, NAME: unknownName, LABEL: "Custom unknown" },
          },
        ],
      },
      chat: {
        ...sideChatFakeConfig.chat,
        turnProfile: {
          ...sideChatFakeConfig.chat.turnProfile,
          tools: { mode: TOOL_POLICY_MODES.PROFILE_ALLOWLIST, names: [unknownName] },
        },
      },
    });

    expect(() => createPartnerAiServiceOptionsFromConfig(config, FAKE_ENV)).toThrow(
      /Unsupported configured tool custom\.unknown_tool\. Available tools: mock_web_search/u,
    );
  });
});

describe("config-driven model call settings", () => {
  it("surfaces configured call settings on the turn profile", () => {
    const config = defineSideChatConfig({
      ...sideChatFakeConfig,
      chat: {
        ...sideChatFakeConfig.chat,
        turnProfile: {
          ...sideChatFakeConfig.chat.turnProfile,
          callSettings: { maxOutputTokens: 512, maxToolSteps: 4 },
        },
      },
    });

    const options = createPartnerAiServiceOptionsFromConfig(config, FAKE_ENV);
    expect(options.turnProfiles?.[0]?.callSettings).toEqual({
      maxOutputTokens: 512,
      maxToolSteps: 4,
    });
  });

  it("leaves call settings absent when the config sets none", () => {
    const options = createPartnerAiServiceOptionsFromConfig(sideChatFakeConfig, FAKE_ENV);
    expect(options.turnProfiles?.[0]?.callSettings).toBeUndefined();
  });
});

describe("config-driven logging defaults", () => {
  const RECEIVED: ObservabilityRecord = {
    requestId: "request_1",
    traceId: "trace_request_1",
    lifecycleState: "received",
    latencyMs: 0,
    attributes: {},
  };

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("resolves format by profile and honors an explicit level", () => {
    const env = sideChatFakeConfig.environment;
    expect(readLoggingConfig("development", {}, env)).toEqual({ level: "info", format: "pretty" });
    expect(readLoggingConfig("production", {}, env)).toEqual({ level: "info", format: "json" });
    expect(readLoggingConfig("production", { [SERVICE_ENV_KEYS.logLevel]: "debug" }, env)).toEqual({
      level: "debug",
      format: "json",
    });
  });

  it("rejects an unknown log level", () => {
    expect(() =>
      readLoggingConfig(
        "development",
        { [SERVICE_ENV_KEYS.logLevel]: "verbose" },
        sideChatFakeConfig.environment,
      ),
    ).toThrow(/SIDECHAT_LOG_LEVEL/u);
  });

  it("uses the console sink in development and the no-op sink in production", () => {
    expect(createDefaultObservabilitySink(false, SILENT_DIAGNOSTIC_LOGGER)).toBe(
      NOOP_OBSERVABILITY_SINK,
    );
    expect(createDefaultObservabilitySink(true, SILENT_DIAGNOSTIC_LOGGER)).not.toBe(
      NOOP_OBSERVABILITY_SINK,
    );
  });

  it("config-driven development boot installs a writing console sink and a logger", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const options = createPartnerAiServiceOptionsFromConfig(sideChatFakeConfig, FAKE_ENV);

    expect(options.diagnosticLogger).toBeDefined();
    Effect.runSync(options.observability?.record(RECEIVED) ?? Effect.void);

    expect(log).toHaveBeenCalledTimes(1);
    expect(String(log.mock.calls[0]?.[0])).toContain("turn received");
  });
});
