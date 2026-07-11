import type { LanguageModelV4StreamPart } from "@ai-sdk/provider";

/** First scripted round asks the browser for one deterministic dynamic tool. */
export function clientToolCallParts(
  requestId: string,
): readonly LanguageModelV4StreamPart[] {
  return [
    { type: "stream-start", warnings: [] },
    {
      type: "tool-call",
      toolCallId: `client-tool-${requestId}`,
      toolName: "open_file",
      input: JSON.stringify({ path: "/workspace/readme.md" }),
    },
    {
      type: "finish",
      finishReason: { unified: "tool-calls", raw: "tool-calls" },
      usage: {
        inputTokens: {
          total: 1,
          noCache: 1,
          cacheRead: undefined,
          cacheWrite: undefined,
        },
        outputTokens: { total: 1, text: 0, reasoning: undefined },
      },
    },
  ];
}
