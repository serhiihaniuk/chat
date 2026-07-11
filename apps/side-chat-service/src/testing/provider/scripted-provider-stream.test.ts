import type { LanguageModelV4StreamPart } from "@ai-sdk/provider";
import { describe, expect, it } from "vitest";

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

function finishReason(parts: readonly LanguageModelV4StreamPart[]): string | undefined {
  const finish = parts.find((part) => part.type === "finish");
  return finish?.type === "finish" ? finish.finishReason.unified : undefined;
}
