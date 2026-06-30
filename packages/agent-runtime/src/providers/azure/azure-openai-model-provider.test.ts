import { describe, expect, it } from "vitest";
import { Stream } from "effect";
import type { AiRuntimeRequest } from "@side-chat/ai-runtime-contract";
import { createAgentRuntime } from "#runtime/agent-runtime";
import {
  AZURE_OPENAI_PROVIDER_ID,
  createAzureOpenAIProvider,
} from "./azure-openai-model-provider.js";

describe("createAzureOpenAIProvider", () => {
  it("routes a turn to the configured deployment, endpoint, and api-version", async () => {
    const urls: string[] = [];
    const headers: Record<string, string>[] = [];
    const runtime = createAgentRuntime({
      providers: [
        createAzureOpenAIProvider({
          apiKey: "azure-test-key",
          endpoint: "https://test-resource.cognitiveservices.azure.com",
          apiVersion: "2024-12-01-preview",
          modelIds: ["gpt-4o"],
          // The deployment is deliberately different from the model id, to prove
          // the custom-per-model mapping is honored when building the request URL.
          deploymentsByModelId: { "gpt-4o": "my-gpt4o-prod" },
          fetch: (url, init) => {
            urls.push(String(url));
            headers.push((init?.headers ?? {}) as Record<string, string>);
            return Promise.resolve(
              new Response(
                [
                  chatChunk({ delta: { role: "assistant", content: "ok" } }),
                  chatChunk({ delta: {}, finish_reason: "stop" }),
                  "data: [DONE]\n\n",
                ].join(""),
                { status: 200, headers: { "content-type": "text/event-stream" } },
              ),
            );
          },
        }),
      ],
    });

    const events = await collect(
      Stream.toAsyncIterable(
        runtime.streamEffect(
          runtimeRequest({
            providerId: AZURE_OPENAI_PROVIDER_ID,
            modelId: "gpt-4o",
            messages: [{ role: "user", content: "hello" }],
          }),
        ),
      ),
    );

    // The model resolved and the stream opened against Azure.
    expect(events[0]).toMatchObject({
      type: "runtime.started",
      providerId: AZURE_OPENAI_PROVIDER_ID,
      modelId: "gpt-4o",
    });

    // The request URL carries the resource host, the `/openai/deployments/<deployment>`
    // routing with the custom deployment name (not the model id), and the api-version.
    const requestUrl = urls[0] ?? "";
    expect(requestUrl).toContain("test-resource.cognitiveservices.azure.com");
    expect(requestUrl).toContain("/openai/deployments/my-gpt4o-prod/");
    expect(requestUrl).not.toContain("/deployments/gpt-4o/");
    expect(requestUrl).toContain("api-version=2024-12-01-preview");

    // Azure authenticates with the `api-key` header, not an OpenAI bearer token.
    expect(headers[0]).toMatchObject({ "api-key": "azure-test-key" });
  });

  it("requires credentials, an endpoint, and at least one model", () => {
    expect(() =>
      createAzureOpenAIProvider({
        apiKey: "",
        endpoint: "https://test-resource.cognitiveservices.azure.com",
        modelIds: ["gpt-4o"],
        deploymentsByModelId: { "gpt-4o": "gpt-4o" },
      }),
    ).toThrow("requires an API key");

    expect(() =>
      createAzureOpenAIProvider({
        apiKey: "azure-test-key",
        endpoint: "",
        modelIds: ["gpt-4o"],
        deploymentsByModelId: { "gpt-4o": "gpt-4o" },
      }),
    ).toThrow("requires a resource endpoint");

    expect(() =>
      createAzureOpenAIProvider({
        apiKey: "azure-test-key",
        endpoint: "https://test-resource.cognitiveservices.azure.com",
        modelIds: [],
        deploymentsByModelId: {},
      }),
    ).toThrow("requires at least one allowed model");
  });
});

const chatChunk = (choice: object): string =>
  `data: ${JSON.stringify({ id: "chatcmpl_test", choices: [{ index: 0, ...choice }] })}\n\n`;

const collect = async <T>(events: AsyncIterable<T>): Promise<T[]> => {
  const collected: T[] = [];
  for await (const event of events) collected.push(event);
  return collected;
};

const runtimeRequest = (overrides: Partial<AiRuntimeRequest>): AiRuntimeRequest => ({
  executorId: "ai_sdk.tool_loop",
  providerId: AZURE_OPENAI_PROVIDER_ID,
  modelId: "gpt-4o",
  requestId: "request_default",
  assistantTurnId: "turn_default",
  messages: [],
  toolNames: [],
  toolScope: {
    hostAppId: "host_app_001",
    workspaceId: "workspace_001",
    subjectId: "subject_001",
    conversationId: "conversation_001",
    assistantTurnId: "turn_default",
  },
  ...overrides,
});
