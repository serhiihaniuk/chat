import { Stream } from "effect";
import { RUNTIME_ERROR_CODES, type AiRuntimeRequest } from "@side-chat/ai-runtime-contract";
import { describe, expect, it } from "vitest";
import {
  createFakeProvider,
  FAKE_ECHO_MODEL_ID,
  FAKE_PROVIDER_ID,
} from "#providers/fake/fake-model-provider";
import { collectEvents, createThrowingProvider } from "#testing/agent-runtime-test-support";
import { createAgentRuntime, DEFAULT_AGENT_EXECUTOR_ID } from "./agent-runtime.js";

describe("createAgentRuntime selection failures", () => {
  it("rejects unavailable selected tools without fallback", async () => {
    const runtime = createAgentRuntime({
      providers: [createFakeProvider()],
    });

    await expect(
      collectEvents(
        Stream.toAsyncIterable(
          runtime.streamEffect({
            ...runtimeRequest(),
            providerId: FAKE_PROVIDER_ID,
            modelId: FAKE_ECHO_MODEL_ID,
            requestId: "req_missing_tool",
            assistantTurnId: "turn_missing_tool",
            messages: [],
            toolNames: ["missing_tool"],
          }),
        ),
      ),
    ).rejects.toThrow("tool missing_tool is not registered");
  });

  it("rejects unavailable provider and model selections without fallback", async () => {
    const runtime = createAgentRuntime({
      providers: [createFakeProvider()],
    });

    await expect(
      collectEvents(
        Stream.toAsyncIterable(
          runtime.streamEffect({
            ...runtimeRequest(),
            providerId: "missing-provider",
            modelId: FAKE_ECHO_MODEL_ID,
            requestId: "req_missing_provider",
            assistantTurnId: "turn_missing_provider",
            messages: [],
          }),
        ),
      ),
    ).rejects.toThrow("provider missing-provider is not registered");

    await expect(
      collectEvents(
        Stream.toAsyncIterable(
          runtime.streamEffect({
            ...runtimeRequest(),
            providerId: FAKE_PROVIDER_ID,
            modelId: "missing-model",
            requestId: "req_missing_model",
            assistantTurnId: "turn_missing_model",
            messages: [],
          }),
        ),
      ),
    ).rejects.toThrow("model missing-model is not registered");
  });

  it("maps unexpected adapter throws into the runtime error channel", async () => {
    const runtime = createAgentRuntime({
      providers: [createThrowingProvider()],
    });

    await expect(
      collectEvents(
        Stream.toAsyncIterable(
          runtime.streamEffect({
            ...runtimeRequest(),
            providerId: "throwing",
            modelId: "throwing-model",
            requestId: "req_throwing_provider",
            assistantTurnId: "turn_throwing_provider",
            messages: [],
          }),
        ),
      ),
    ).rejects.toMatchObject({
      code: RUNTIME_ERROR_CODES.INTERNAL_ERROR,
      message: "provider adapter exploded",
    });
  });
});

const runtimeRequest = (): AiRuntimeRequest => ({
  executorId: DEFAULT_AGENT_EXECUTOR_ID,
  providerId: FAKE_PROVIDER_ID,
  modelId: FAKE_ECHO_MODEL_ID,
  requestId: "req_default",
  assistantTurnId: "turn_default",
  messages: [],
  toolNames: [],
  toolScope: {
    hostAppId: "host_app_001",
    workspaceId: "workspace_001",
    subjectId: "subject_001",
    conversationId: "conversation_001",
    assistantTurnId: "turn_default",
    allowedHostCommandNames: [],
  },
});
