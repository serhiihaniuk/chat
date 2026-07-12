import type { LanguageModelV4StreamPart } from "@ai-sdk/provider";

import { modelStream, TOOL_CALL_OUTPUT_TOKENS } from "./model-stream-parts.js";

/** First scripted round asks the browser for one deterministic dynamic tool. */
export function clientToolCallParts(requestId: string): readonly LanguageModelV4StreamPart[] {
  return modelStream()
    .toolCall({
      toolCallId: `client-tool-${requestId}`,
      toolName: "open_file",
      input: JSON.stringify({ path: "/workspace/readme.md" }),
    })
    .finish("tool-calls", TOOL_CALL_OUTPUT_TOKENS);
}
