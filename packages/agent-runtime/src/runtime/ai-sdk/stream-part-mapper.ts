import type { LanguageModelUsage, TextStreamPart, ToolSet } from "ai";

import type { RuntimeEvent, RuntimeUsage } from "../contract/runtime-event.js";
import type { RuntimeProviderRequest } from "../contract/runtime-request.js";

/**
 * Emit the first event before any provider output is read.
 *
 * This gives the service/UI a concrete turn boundary immediately: which
 * provider/model is being used, which request is streaming, and where later
 * sequence numbers begin.
 */
export const createRuntimeStartedEvent = (
  request: RuntimeProviderRequest,
  sequence: number,
): RuntimeEvent => ({
  type: "runtime.started",
  requestId: request.requestId,
  assistantTurnId: request.assistantTurnId,
  sequence,
  providerId: request.providerId,
  modelId: request.modelId,
});

/**
 * Map ordinary AI SDK stream parts into the runtime event contract.
 *
 * Tool and reasoning parts are handled in their own files because they update
 * activity rows. This mapper owns the simple terminal/text cases that become
 * direct runtime events.
 */
export const mapAiSdkStreamPart = (
  request: RuntimeProviderRequest,
  part: TextStreamPart<ToolSet>,
  sequence: number,
): RuntimeEvent | undefined => {
  if (part.type === "text-delta") {
    return {
      type: "runtime.output_delta",
      requestId: request.requestId,
      assistantTurnId: request.assistantTurnId,
      sequence,
      content: part.text,
    };
  }
  if (part.type === "finish") {
    return {
      type: "runtime.completed",
      requestId: request.requestId,
      assistantTurnId: request.assistantTurnId,
      sequence,
      finishReason: mapFinishReason(part.finishReason),
      usage: toRuntimeUsage(part.totalUsage),
    };
  }
  if (part.type === "error") {
    return {
      type: "runtime.error",
      requestId: request.requestId,
      assistantTurnId: request.assistantTurnId,
      sequence,
      code: "provider_unavailable",
      message: part.error instanceof Error ? part.error.message : "AI SDK agent stream failed.",
      retryable: true,
    };
  }
  return undefined;
};

/**
 * Runtime finish reasons are intentionally smaller than provider reasons.
 *
 * Downstream protocol/UI only needs to know whether generation stopped
 * normally, hit length, or was aborted/blocked. Provider-specific reasons stay
 * inside the runtime adapter.
 */
const mapFinishReason = (reason: string): "stop" | "length" | "aborted" => {
  if (reason === "length") return "length";
  if (reason === "abort" || reason === "content-filter") return "aborted";
  return "stop";
};

/**
 * Normalize token usage before it crosses the adapter boundary.
 *
 * Providers do not always return every usage field. The runtime contract uses
 * numbers so downstream accounting and tests never have to branch on missing
 * provider-specific usage values.
 */
const toRuntimeUsage = (usage: LanguageModelUsage): RuntimeUsage => ({
  inputTokens: usage.inputTokens ?? 0,
  outputTokens: usage.outputTokens ?? 0,
  totalTokens: usage.totalTokens ?? 0,
});
