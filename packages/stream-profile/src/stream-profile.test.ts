import { describe, expect, it } from "vitest";

import {
  SIDE_CHAT_DATA_PART_TYPES,
  SIDE_CHAT_MESSAGE_TERMINAL_STATUSES,
  TURN_ACTIVITY_STATUS,
  isTurnActivityStatus,
  sideChatMessageMetadataSchema,
} from "./index.js";
import {
  SIDE_CHAT_ERROR_CODES,
  SIDE_CHAT_ERROR_VOCABULARY,
  isSideChatErrorCode,
  type SideChatErrorCode,
} from "./error-vocabulary.js";

describe("Side Chat error vocabulary", () => {
  const codes = Object.values(SIDE_CHAT_ERROR_CODES);

  it("maps every code to a retryability flag and a safe message", () => {
    for (const code of codes) {
      const profile = SIDE_CHAT_ERROR_VOCABULARY[code];
      expect(typeof profile.retryable).toBe("boolean");
      expect(profile.safeMessage.length).toBeGreaterThan(0);
    }
  });

  it("has exactly one vocabulary entry per code and no extras", () => {
    expect(Object.keys(SIDE_CHAT_ERROR_VOCABULARY).sort()).toEqual([...codes].sort());
  });

  it("recognizes known codes and rejects unknown text", () => {
    expect(isSideChatErrorCode(SIDE_CHAT_ERROR_CODES.PROVIDER_FAILED)).toBe(true);
    expect(isSideChatErrorCode("sk-live-raw-provider-secret")).toBe(false);
  });

  it("pins the documented retryability decisions", () => {
    const retryable: Record<SideChatErrorCode, boolean> = {
      bad_request: false,
      unauthorized: false,
      forbidden: false,
      not_found: false,
      conflict: true,
      rate_limited: true,
      aborted: false,
      timeout: true,
      provider_failed: true,
      tool_failed: false,
      persistence_failed: true,
      internal_error: true,
      unsupported_protocol: false,
    };
    for (const code of codes) {
      expect(SIDE_CHAT_ERROR_VOCABULARY[code].retryable).toBe(retryable[code]);
    }
  });
});

describe("turn activity status vocabulary", () => {
  it("recognizes only the closed running and terminal wire values", () => {
    expect(isTurnActivityStatus(TURN_ACTIVITY_STATUS.RUNNING)).toBe(true);
    expect(isTurnActivityStatus(TURN_ACTIVITY_STATUS.TERMINAL)).toBe(true);
    expect(isTurnActivityStatus("completed")).toBe(false);
    expect(isTurnActivityStatus(undefined)).toBe(false);
  });
});
describe("Side Chat data part registry", () => {
  it("has no public data parts at baseline", () => {
    expect(SIDE_CHAT_DATA_PART_TYPES).toEqual([]);
  });
});

describe("native message metadata schema", () => {
  it("accepts folded usage and returns a sanitized value", () => {
    const result = sideChatMessageMetadataSchema["~standard"].validate({
      activityDurationMs: 1501,
      usage: {
        inputTokens: 2,
        outputTokens: 3,
        totalTokens: 5,
        reasoningTokens: 0,
        cachedInputTokens: 0,
      },
      terminal: {
        status: SIDE_CHAT_MESSAGE_TERMINAL_STATUSES.COMPLETED,
        finishReason: "length",
      },
    });

    expect(result).toEqual({
      value: {
        activityDurationMs: 1501,
        usage: {
          inputTokens: 2,
          outputTokens: 3,
          totalTokens: 5,
          reasoningTokens: 0,
          cachedInputTokens: 0,
        },
        terminal: {
          status: SIDE_CHAT_MESSAGE_TERMINAL_STATUSES.COMPLETED,
          finishReason: "length",
        },
      },
    });
  });

  it("accepts public failed and cancelled terminal projections", () => {
    const usage = { inputTokens: 0, outputTokens: 0, totalTokens: 0 };
    expect(
      sideChatMessageMetadataSchema["~standard"].validate({
        usage,
        terminal: {
          status: SIDE_CHAT_MESSAGE_TERMINAL_STATUSES.FAILED,
          errorCode: SIDE_CHAT_ERROR_CODES.TIMEOUT,
        },
      }),
    ).toEqual({
      value: {
        usage,
        terminal: {
          status: SIDE_CHAT_MESSAGE_TERMINAL_STATUSES.FAILED,
          errorCode: SIDE_CHAT_ERROR_CODES.TIMEOUT,
        },
      },
    });
    expect(
      sideChatMessageMetadataSchema["~standard"].validate({
        usage,
        terminal: { status: SIDE_CHAT_MESSAGE_TERMINAL_STATUSES.CANCELLED },
      }),
    ).toEqual({
      value: {
        usage,
        terminal: { status: SIDE_CHAT_MESSAGE_TERMINAL_STATUSES.CANCELLED },
      },
    });
  });

  it("accepts older folded usage metadata without activity duration", () => {
    expect(
      sideChatMessageMetadataSchema["~standard"].validate({
        usage: { inputTokens: 1, outputTokens: 2, totalTokens: 3 },
      }),
    ).toEqual({
      value: { usage: { inputTokens: 1, outputTokens: 2, totalTokens: 3 } },
    });
  });

  it.each([
    {
      usage: {
        inputTokens: 1,
        outputTokens: 2,
        totalTokens: 3,
        privateField: "secret",
      },
    },
    { usage: { inputTokens: 1, outputTokens: 2, totalTokens: 2.5 } },
    {
      usage: {
        inputTokens: Number.POSITIVE_INFINITY,
        outputTokens: 2,
        totalTokens: 2,
      },
    },
    {
      usage: { inputTokens: 1, outputTokens: 2, totalTokens: 3 },
      privateField: "secret",
    },
    {
      activityDurationMs: -1,
      usage: { inputTokens: 1, outputTokens: 2, totalTokens: 3 },
    },
    {
      activityDurationMs: 1.5,
      usage: { inputTokens: 1, outputTokens: 2, totalTokens: 3 },
    },
    {
      usage: { inputTokens: 1, outputTokens: 2, totalTokens: 3 },
      terminal: { status: "failed", errorCode: "provider_timeout" },
    },
    {
      usage: { inputTokens: 1, outputTokens: 2, totalTokens: 3 },
      terminal: { status: "cancelled", privateReason: "raw abort reason" },
    },
  ])("rejects private or invalid metadata: %o", (value) => {
    const result = sideChatMessageMetadataSchema["~standard"].validate(value);

    expect(result).toEqual({
      issues: [{ message: "Message metadata is invalid." }],
    });
  });

  it("allows absent metadata for ordinary messages", () => {
    expect(sideChatMessageMetadataSchema["~standard"].validate(undefined)).toEqual({
      value: undefined,
    });
  });

  it("publishes strict input and output JSON schemas", () => {
    const jsonSchema = sideChatMessageMetadataSchema["~standard"].jsonSchema.input({
      target: "draft-2020-12",
    });

    expect(jsonSchema).toMatchObject({
      type: "object",
      additionalProperties: false,
      properties: {
        activityDurationMs: {
          type: "integer",
          minimum: 0,
          maximum: Number.MAX_SAFE_INTEGER,
        },
        usage: {
          type: "object",
          additionalProperties: false,
        },
        terminal: {
          oneOf: expect.any(Array),
        },
      },
    });
    expect(
      sideChatMessageMetadataSchema["~standard"].jsonSchema.output({
        target: "draft-07",
      }),
    ).toEqual(jsonSchema);
  });
});
