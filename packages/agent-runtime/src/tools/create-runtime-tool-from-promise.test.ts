import { AiRuntimeError, RUNTIME_ERROR_CODES } from "@side-chat/ai-runtime-contract";
import type { JsonObject } from "@side-chat/shared";
import { Effect } from "effect";
import { describe, expect, it } from "vitest";

import { createRuntimeToolFromPromise } from "./create-runtime-tool-from-promise.js";
import type { RuntimeToolContext } from "./runtime-tool.js";

const SCHEMA = { type: "object", properties: {}, additionalProperties: true } as const;

const CONTEXT: RuntimeToolContext = {
  requestId: "request_1",
  assistantTurnId: "turn_1",
  modelId: "model_1",
  toolName: "example.tool",
};

// `flip` swaps channels: a tool failure resolves with the error, and a (wrong)
// success rejects the promise so the test fails loudly instead of silently.
const runError = (
  tool: ReturnType<typeof createRuntimeToolFromPromise>,
  input: JsonObject = {},
): Promise<AiRuntimeError> => Effect.runPromise(Effect.flip(tool.execute(input, CONTEXT)));

describe("createRuntimeToolFromPromise", () => {
  it("returns the resolved JSON result on success", async () => {
    const tool = createRuntimeToolFromPromise({
      name: "example.echo",
      description: "Echo the input.",
      inputSchema: SCHEMA,
      run: (input) => Promise.resolve({ echoed: input }),
    });

    await expect(Effect.runPromise(tool.execute({ q: "hi" }, CONTEXT))).resolves.toEqual({
      echoed: { q: "hi" },
    });
  });

  it("maps a thrown error to tool_failed with a scrubbed message", async () => {
    const tool = createRuntimeToolFromPromise({
      name: "example.boom",
      description: "Always throws.",
      inputSchema: SCHEMA,
      run: () => Promise.reject(new Error("raw internal detail: secret=sk-123")),
    });

    const error = await runError(tool);
    expect(error.code).toBe(RUNTIME_ERROR_CODES.TOOL_FAILED);
    // The raw message must never cross the runtime boundary.
    expect(error.message).toBe("example.boom failed.");
    expect(error.message).not.toContain("sk-123");
  });

  it("maps a caller abort to the aborted code", async () => {
    const tool = createRuntimeToolFromPromise({
      name: "example.slow",
      description: "Aborts.",
      inputSchema: SCHEMA,
      run: () => {
        const abort = new Error("The operation was aborted.");
        abort.name = "AbortError";
        return Promise.reject(abort);
      },
    });

    const error = await runError(tool);
    expect(error.code).toBe(RUNTIME_ERROR_CODES.ABORTED);
  });

  it("keeps a deliberately thrown typed AiRuntimeError code", async () => {
    const tool = createRuntimeToolFromPromise({
      name: "example.typed",
      description: "Throws a typed error.",
      inputSchema: SCHEMA,
      run: () =>
        Promise.reject(new AiRuntimeError(RUNTIME_ERROR_CODES.TIMEOUT, "example.typed timed out.")),
    });

    const error = await runError(tool);
    expect(error.code).toBe(RUNTIME_ERROR_CODES.TIMEOUT);
  });
});
