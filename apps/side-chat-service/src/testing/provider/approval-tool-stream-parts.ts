import type { LanguageModelV4StreamPart } from "@ai-sdk/provider";

import { modelStream, TOOL_CALL_OUTPUT_TOKENS } from "./model-stream-parts.js";

/** First scripted round requests the executable tool used by the native approval GAP probe. */
export function approvalToolCallParts(requestId: string): readonly LanguageModelV4StreamPart[] {
  return modelStream()
    .toolCall({
      toolCallId: `native-approval-${requestId}`,
      toolName: "riskyTool",
      input: JSON.stringify({ action: "delete" }),
    })
    .finish("tool-calls", TOOL_CALL_OUTPUT_TOKENS);
}
