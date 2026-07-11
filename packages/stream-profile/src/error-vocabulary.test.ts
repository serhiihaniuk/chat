import { describe, expect, it } from "vitest";

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
