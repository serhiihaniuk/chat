import type { LanguageModelV4StreamPart } from "@ai-sdk/provider";
import { describe, expect, it, vi } from "vitest";

import { PROVIDER_SCRIPT_MODE, type ProviderScriptMode } from "../scripted-provider-contract.js";
import { createScriptedStream } from "./scripted-provider-stream.js";

describe("scripted provider residual edge cases", () => {
  it("finishes without content for an empty model response", async () => {
    const parts = await readAll(PROVIDER_SCRIPT_MODE.EMPTY);

    expect(parts.map((part) => part.type)).toEqual(["stream-start", "finish"]);
    expect(finishReason(parts)).toBe("stop");
  });

  it("emits native reasoning parts without text", async () => {
    const parts = await readAll(PROVIDER_SCRIPT_MODE.REASONING_ONLY);

    expect(parts.map((part) => part.type)).toEqual([
      "stream-start",
      "reasoning-start",
      "reasoning-delta",
      "reasoning-end",
      "finish",
    ]);
    expect(parts.some((part) => part.type.startsWith("text-"))).toBe(false);
  });

  it("can represent the length finish exposed after a step cap", async () => {
    const parts = await readAll(PROVIDER_SCRIPT_MODE.STEP_LIMIT);

    expect(finishReason(parts)).toBe("length");
  });

  it("holds a crash-recovery stream open after content, then completes it", async () => {
    vi.useFakeTimers();
    try {
      const reader = createScriptedStream(
        "request-recovery",
        PROVIDER_SCRIPT_MODE.CRASH_RECOVERY,
        1,
        undefined,
      ).getReader();
      const partial = await Promise.all([reader.read(), reader.read(), reader.read()]);
      expect(partial.map((result) => (result.done ? "done" : result.value.type))).toEqual([
        "stream-start",
        "text-start",
        "text-delta",
      ]);

      const terminal = readRemaining(reader);
      await vi.runAllTimersAsync();
      expect((await terminal).map((part) => part.type)).toEqual(["text-end", "finish"]);
    } finally {
      vi.useRealTimers();
    }
  });
});

async function readAll(mode: ProviderScriptMode): Promise<LanguageModelV4StreamPart[]> {
  const reader = createScriptedStream("request-1", mode, 1, undefined).getReader();
  const parts: LanguageModelV4StreamPart[] = [];
  while (true) {
    const next = await reader.read();
    if (next.done) return parts;
    parts.push(next.value);
  }
}

async function readRemaining(
  reader: ReadableStreamDefaultReader<LanguageModelV4StreamPart>,
): Promise<LanguageModelV4StreamPart[]> {
  const parts: LanguageModelV4StreamPart[] = [];
  for (;;) {
    const next = await reader.read();
    if (next.done) return parts;
    parts.push(next.value);
  }
}

function finishReason(parts: readonly LanguageModelV4StreamPart[]): string | undefined {
  const finish = parts.find((part) => part.type === "finish");
  return finish?.type === "finish" ? finish.finishReason.unified : undefined;
}
