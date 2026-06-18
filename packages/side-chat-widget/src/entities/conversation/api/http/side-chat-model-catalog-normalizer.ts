import { CHAT_REASONING_EFFORTS, type ChatReasoningEffort } from "@side-chat/chat-protocol";
import { isRecord, omitUndefinedProperties } from "@side-chat/shared";

import { SideChatApiError } from "./side-chat-api-error.js";
import type { ListModelsResult } from "../client/side-chat-api-types.js";

const reasoningEfforts = new Set<string>(Object.values(CHAT_REASONING_EFFORTS));

export const normalizeModelCatalog = (payload: unknown): ListModelsResult => {
  if (!isRecord(payload) || !Array.isArray(payload["models"])) {
    throw new SideChatApiError("network_error", "Malformed models response");
  }
  return omitUndefinedProperties({
    defaultModel: normalizeDefaultModel(payload["defaultModel"]),
    models: payload["models"].map(normalizeModelOption),
  });
};

const normalizeDefaultModel = (payload: unknown): ListModelsResult["defaultModel"] | undefined => {
  if (payload === undefined) return undefined;
  if (
    !isRecord(payload) ||
    typeof payload["providerId"] !== "string" ||
    typeof payload["modelId"] !== "string"
  ) {
    throw new SideChatApiError("network_error", "Malformed models response");
  }
  return {
    providerId: payload["providerId"],
    modelId: payload["modelId"],
  };
};

const normalizeModelOption = (payload: unknown): ListModelsResult["models"][number] => {
  if (
    !isRecord(payload) ||
    typeof payload["providerId"] !== "string" ||
    typeof payload["modelId"] !== "string" ||
    typeof payload["displayName"] !== "string" ||
    typeof payload["default"] !== "boolean" ||
    typeof payload["available"] !== "boolean" ||
    !isOptionalNumber(payload["contextWindowTokens"]) ||
    !isOptionalNumber(payload["maxOutputTokens"])
  ) {
    throw new SideChatApiError("network_error", "Malformed models response");
  }

  return omitUndefinedProperties({
    providerId: payload["providerId"],
    modelId: payload["modelId"],
    displayName: payload["displayName"],
    contextWindowTokens: payload["contextWindowTokens"],
    maxOutputTokens: payload["maxOutputTokens"],
    default: payload["default"],
    available: payload["available"],
    reasoning: normalizeModelReasoning(payload["reasoning"]),
  });
};

const normalizeModelReasoning = (
  payload: unknown,
): ListModelsResult["models"][number]["reasoning"] => {
  if (payload === undefined) return undefined;
  if (
    !isRecord(payload) ||
    !isReasoningEffort(payload["defaultEffort"]) ||
    !Array.isArray(payload["efforts"])
  ) {
    throw new SideChatApiError("network_error", "Malformed models response");
  }
  const efforts = payload["efforts"].map((effort) => {
    if (!isReasoningEffort(effort)) {
      throw new SideChatApiError("network_error", "Malformed models response");
    }
    return effort;
  });
  return {
    defaultEffort: payload["defaultEffort"],
    efforts,
  };
};

const isOptionalNumber = (value: unknown): value is number | undefined =>
  value === undefined || typeof value === "number";

const isReasoningEffort = (value: unknown): value is ChatReasoningEffort =>
  typeof value === "string" && reasoningEfforts.has(value);
