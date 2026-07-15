import { SIDE_CHAT_ERROR_CODES } from "../error-vocabulary.js";
import { SIDE_CHAT_FINISH_REASONS } from "../finish-reasons.js";
import { SIDE_CHAT_MESSAGE_TERMINAL_STATUSES } from "./message-terminal.js";

/** JSON Schema view of the same closed metadata contract enforced at runtime. */
export const SIDE_CHAT_MESSAGE_METADATA_JSON_SCHEMA = {
  type: "object",
  properties: {
    activityDurationMs: {
      type: "integer",
      minimum: 0,
      maximum: Number.MAX_SAFE_INTEGER,
    },
    usage: {
      type: "object",
      properties: {
        inputTokens: {
          type: "integer",
          minimum: 0,
          maximum: Number.MAX_SAFE_INTEGER,
        },
        outputTokens: {
          type: "integer",
          minimum: 0,
          maximum: Number.MAX_SAFE_INTEGER,
        },
        totalTokens: {
          type: "integer",
          minimum: 0,
          maximum: Number.MAX_SAFE_INTEGER,
        },
        reasoningTokens: {
          type: "integer",
          minimum: 0,
          maximum: Number.MAX_SAFE_INTEGER,
        },
        cachedInputTokens: {
          type: "integer",
          minimum: 0,
          maximum: Number.MAX_SAFE_INTEGER,
        },
      },
      required: ["inputTokens", "outputTokens", "totalTokens"],
      additionalProperties: false,
    },
    terminal: {
      oneOf: [
        {
          type: "object",
          properties: {
            status: { const: SIDE_CHAT_MESSAGE_TERMINAL_STATUSES.COMPLETED },
            finishReason: { enum: Object.values(SIDE_CHAT_FINISH_REASONS) },
          },
          required: ["status"],
          additionalProperties: false,
        },
        {
          type: "object",
          properties: {
            status: { const: SIDE_CHAT_MESSAGE_TERMINAL_STATUSES.CANCELLED },
          },
          required: ["status"],
          additionalProperties: false,
        },
        {
          type: "object",
          properties: {
            status: { const: SIDE_CHAT_MESSAGE_TERMINAL_STATUSES.FAILED },
            errorCode: { enum: Object.values(SIDE_CHAT_ERROR_CODES) },
          },
          required: ["status", "errorCode"],
          additionalProperties: false,
        },
      ],
    },
  },
  required: ["usage"],
  additionalProperties: false,
} as const satisfies Readonly<Record<string, unknown>>;
