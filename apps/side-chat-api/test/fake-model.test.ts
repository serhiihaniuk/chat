import { afterEach, describe, expect, it, vi } from "vitest";
import type { SidechatRequest } from "@side-chat/shared-protocol";
import { createFakeModelAdapter } from "../src/adapters/ai/fake-model.js";

const request = {
  workspaceId: "demo-workspace",
  message: { id: "msg-1", role: "user", content: "explain this report" },
  model: { provider: "openai", id: "gpt-4.1-mini" },
} satisfies SidechatRequest;

describe("fakeModelAdapter", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("waits before emitting mocked chunks so streaming is visible", async () => {
    vi.useFakeTimers();
    const iterator = createFakeModelAdapter({ chunkDelayMs: 50 })
      .stream(request)
      [Symbol.asyncIterator]();
    let firstChunkSettled = false;
    const firstChunk = iterator.next().then((result) => {
      firstChunkSettled = true;
      return result;
    });

    await Promise.resolve();
    expect(firstChunkSettled).toBe(false);

    await vi.advanceTimersByTimeAsync(49);
    expect(firstChunkSettled).toBe(false);

    await vi.advanceTimersByTimeAsync(1);
    await expect(firstChunk).resolves.toMatchObject({
      value: { kind: "delta", text: "# Assistant answer\n" },
      done: false,
    });

    await iterator.return?.();
  });

  it("streams a rich deterministic markdown response", async () => {
    const chunks = [];

    for await (const chunk of createFakeModelAdapter({
      chunkDelayMs: 0,
    }).stream(request)) {
      chunks.push(chunk);
    }

    const deltas = chunks.filter((chunk) => chunk.kind === "delta");
    const done = chunks.find((chunk) => chunk.kind === "done");
    const content = deltas.map((chunk) => chunk.text).join("");

    expect(deltas).toHaveLength(10);
    expect(content).toContain("## Mocked streaming process");
    expect(content).toContain("| Feature | Demo value |");
    expect(content).toContain("1. Parse the workspace context.");
    expect(content).toContain("```ts");
    expect(content).toContain("- [ ] Review the highlighted metrics");
    expect(done).toMatchObject({
      kind: "done",
      usage: {
        inputTokens: 3,
        outputTokens: expect.any(Number),
        totalTokens: expect.any(Number),
      },
    });
    if (done?.kind === "done") {
      expect(done.usage.outputTokens).toBeGreaterThan(18);
      expect(done.usage.totalTokens).toBe(
        done.usage.inputTokens + done.usage.outputTokens,
      );
    }
  });
});
