import { AiRuntimeError, RUNTIME_ERROR_CODES } from "@side-chat/ai-runtime-contract";
import { describe, expect, it } from "vitest";

import {
  RUNTIME_ABORTED_PUBLIC_MESSAGE,
  RUNTIME_PROVIDER_ERROR_PUBLIC_MESSAGE,
  classifyAiSdkPart,
  toRuntimeError,
} from "./stream-part-mapper.js";

/** Every AI SDK stream part this runtime turns into a runtime event. */
const MAPPED_PART_TYPES = [
  "text-delta",
  "finish",
  "error",
  "abort",
  "reasoning-delta",
  "tool-input-start",
  "tool-call",
  "tool-result",
  "tool-error",
];

/** Every AI SDK stream part this runtime deliberately drops as a no-op. */
const IGNORED_PART_TYPES = [
  "start",
  "start-step",
  "finish-step",
  "text-start",
  "text-end",
  "reasoning-start",
  "reasoning-end",
  "tool-input-delta",
  "tool-input-end",
  "tool-output-denied",
  "tool-approval-request",
  "source",
  "file",
  "raw",
];

describe("classifyAiSdkPart", () => {
  it("classifies every mapped part type as mapped", () => {
    const classified = MAPPED_PART_TYPES.map((type) => [type, classifyAiSdkPart(type)]);
    expect(classified).toEqual(MAPPED_PART_TYPES.map((type) => [type, "mapped"]));
  });

  it("classifies every deliberately ignored part type as ignored", () => {
    const classified = IGNORED_PART_TYPES.map((type) => [type, classifyAiSdkPart(type)]);
    expect(classified).toEqual(IGNORED_PART_TYPES.map((type) => [type, "ignored"]));
  });

  it("classifies a part type outside the SDK union as unknown", () => {
    // A future SDK pin's new part type reaches here as `unknown` so the runner
    // logs it; the compile-time `Record<AiSdkPartType, …>` forces it to be
    // classified before it can ship.
    expect(classifyAiSdkPart("tool-teleport")).toBe("unknown");
  });
});

describe("toRuntimeError", () => {
  it("keeps an AiRuntimeError and its honest code", () => {
    const original = new AiRuntimeError(RUNTIME_ERROR_CODES.TOOL_CONFLICT, "conflict");
    expect(toRuntimeError(original)).toBe(original);
  });

  it("maps a caller AbortError to the aborted code, never a provider outage", () => {
    const aborted = new Error("The operation was aborted.");
    aborted.name = "AbortError";

    const mapped = toRuntimeError(aborted);

    expect(mapped.code).toBe(RUNTIME_ERROR_CODES.ABORTED);
    expect(mapped.message).toBe(RUNTIME_ABORTED_PUBLIC_MESSAGE);
  });

  it("reduces a foreign provider/SDK error to a public-safe provider failure", () => {
    const mapped = toRuntimeError(new Error("raw provider internals: key=sk-123"));

    expect(mapped.code).toBe(RUNTIME_ERROR_CODES.PROVIDER_UNAVAILABLE);
    expect(mapped.message).toBe(RUNTIME_PROVIDER_ERROR_PUBLIC_MESSAGE);
    expect(mapped.message).not.toContain("sk-123");
  });
});
