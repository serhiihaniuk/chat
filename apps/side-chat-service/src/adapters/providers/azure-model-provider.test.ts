import { streamText } from "ai";
import { describe, expect, it } from "vitest";

import { createAzureModelAdapter } from "./azure-model-provider.js";

describe("createAzureModelAdapter", () => {
  it("routes through the configured deployment and API version", async () => {
    let requestUrl = "";
    let requestHeaders = new Headers();
    const provider = createAzureModelAdapter({
      apiKey: "azure-test-key",
      endpoint: "https://test-resource.cognitiveservices.azure.com/",
      apiVersion: "2025-01-01-preview",
      models: [
        { id: "gpt-4o", deployment: "side-chat-production" },
        { id: "gpt-4o-mini", deployment: "side-chat-mini" },
      ],
      fetch: (url, init) => {
        requestUrl = String(url);
        requestHeaders = new Headers(init?.headers);
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
    });
    const model = provider.modelFor("gpt-4o-mini");

    const result = streamText({ model, prompt: "hello" });
    for await (const _part of result.fullStream) {
      // Consume the stream to complete the mocked provider call.
    }

    expect(requestUrl).toContain("/openai/deployments/side-chat-mini/");
    expect(requestUrl).toContain("api-version=2025-01-01-preview");
    expect(requestHeaders.get("api-key")).toBe("azure-test-key");
  });
});

function chatChunk(choice: object): string {
  return `data: ${JSON.stringify({ id: "chatcmpl_test", choices: [{ index: 0, ...choice }] })}\n\n`;
}
