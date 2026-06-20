import {
  DEFAULT_AGENT_EXECUTOR_ID,
  FAKE_ECHO_MODEL_ID,
  FAKE_PROVIDER_ID,
  OPENAI_PROVIDER_ID,
  OPENAI_REASONING_EFFORTS,
} from "@side-chat/agent-runtime";
import {
  OUTPUT_FORMATS,
  PROMPT_INJECTION_MODES,
  TOOL_POLICY_MODES,
} from "@side-chat/partner-ai-core";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_MOCK_WEB_SEARCH_DELAY_MS,
  MOCK_WEB_SEARCH_TOOL_NAME,
} from "#adapters/tools/mock-web-search-tool";
import { SERVICE_MODEL_RETENTION_POLICIES } from "#composition/providers/service-provider-registry";
import {
  AUXILIARY_JOBS,
  CONFIG_IDS,
  DEFAULT_OUTPUT_CONTRACT,
  EXECUTORS,
  OPENAI_MODEL_METADATA_BY_ID,
  PROVIDERS,
  SAFETY_POLICIES,
  TOOLS,
} from "./index.js";

describe("service config catalog", () => {
  it("keeps provider ids, model metadata, and reasoning options importable", () => {
    const gpt54Mini = PROVIDERS.OPENAI.MODELS.GPT_5_4_MINI;
    const declaredOpenAIModels = Object.values(PROVIDERS.OPENAI.MODELS);

    expect(PROVIDERS.FAKE.PROVIDER_ID).toBe(FAKE_PROVIDER_ID);
    expect(PROVIDERS.FAKE.MODELS.FAKE_ECHO.MODEL_ID).toBe(FAKE_ECHO_MODEL_ID);
    expect(PROVIDERS.OPENAI.PROVIDER_ID).toBe(OPENAI_PROVIDER_ID);
    expect(PROVIDERS.OPENAI.DEFAULT_RETENTION).toBe(SERVICE_MODEL_RETENTION_POLICIES.NO_RETENTION);
    expect(gpt54Mini).toMatchObject({
      MODEL_ID: "gpt-5.4-mini",
      DISPLAY_NAME: "GPT-5.4 mini",
      CONTEXT_WINDOW_TOKENS: 400_000,
      MAX_OUTPUT_TOKENS: 128_000,
    });
    expect(gpt54Mini.REASONING.MEDIUM).toBe(OPENAI_REASONING_EFFORTS.MEDIUM);
    expect(gpt54Mini.SUPPORTED_REASONING_EFFORTS).toContain(gpt54Mini.DEFAULT_REASONING_EFFORT);
    expect(OPENAI_MODEL_METADATA_BY_ID[gpt54Mini.MODEL_ID]).toEqual({
      modelId: "gpt-5.4-mini",
      displayName: "GPT-5.4 mini",
      contextWindowTokens: 400_000,
      maxOutputTokens: 128_000,
    });
    expect(
      declaredOpenAIModels.map((model) => OPENAI_MODEL_METADATA_BY_ID[model.MODEL_ID]?.modelId),
    ).toEqual(declaredOpenAIModels.map((model) => model.MODEL_ID));
  });

  it("exposes closed config values without repeating core literals", () => {
    expect(CONFIG_IDS.TURN_PROFILES.DEFAULT).toBe("default");
    expect(DEFAULT_OUTPUT_CONTRACT.format).toBe(OUTPUT_FORMATS.MARKDOWN);
    expect(TOOLS.MOCK_WEB_SEARCH.EXPOSURE.DEFAULT_MODE).toBe("enabled");
    expect(SAFETY_POLICIES.STANDARD.DEFAULT_PROMPT_INJECTION_MODE).toBe(
      PROMPT_INJECTION_MODES.STANDARD,
    );
    expect(TOOL_POLICY_MODES.CLOSED).toBe("closed");
  });

  it("points executor and tool descriptors at implemented runtime pieces", () => {
    expect(EXECUTORS.AI_SDK_TOOL_LOOP.EXECUTOR_ID).toBe(DEFAULT_AGENT_EXECUTOR_ID);
    expect(TOOLS.MOCK_WEB_SEARCH.NAME).toBe(MOCK_WEB_SEARCH_TOOL_NAME);
    expect(TOOLS.MOCK_WEB_SEARCH.PARAMETERS.DEFAULT_DELAY_MS).toBe(
      DEFAULT_MOCK_WEB_SEARCH_DELAY_MS,
    );
    expect(TOOLS.MOCK_WEB_SEARCH.MODEL_PROMPT.USAGE_INSTRUCTIONS).toContain("Search the web");
  });

  it("declares auxiliary jobs as importable descriptors", () => {
    expect(AUXILIARY_JOBS.CONVERSATION_TITLE.JOB_ID).toBe("conversation_title");
    expect(AUXILIARY_JOBS.CONVERSATION_TITLE.MODES.ENABLED).toBe("enabled");
    expect(AUXILIARY_JOBS.CONVERSATION_TITLE.DEFAULT_PROMPT.systemInstructions).toContain(
      "Generate a concise",
    );
  });
});
