import type { LanguageModelV4StreamPart } from "@ai-sdk/provider";
import { dynamicTool, jsonSchema, stepCountIs, streamText } from "ai";
import { MockLanguageModelV4 } from "ai/test";
import { Ajv } from "ajv";
import { describe, expect, it, vi } from "vitest";

import type { ClientToolDefinition } from "#application/turn/tools/client-tool-catalog";
import { isSupportedClientToolSchema } from "#application/turn/tools/client-tool-schema";
import { modelStream, TOOL_CALL_OUTPUT_TOKENS } from "#testing/provider/model-stream-parts";

// The runtime never validates model-produced tool input itself: `createClientTools`
// wraps each admitted schema in a bare `jsonSchema` and `WorkflowAgent`
// reconstructs the tool inside a "use step" (`resolveSerializableTools` in
// `@ai-sdk/workflow`), compiling the schema with Ajv and attaching the `validate`
// that turns a schema mismatch into a typed tool error. That step is unreachable
// from a plain test, so this focused test reproduces the exact reconstruction —
// real Ajv, real `jsonSchema` validate, real `streamText` tool handling — to
// prove a schema-violating input becomes a typed tool error, the durable
// `execute` (the client-tool wait) is never entered, and the turn does not throw.

const OPEN_FILE: ClientToolDefinition = {
  name: "open_file",
  description: "Open one workspace file.",
  inputSchema: {
    type: "object",
    properties: { path: { type: "string" } },
    required: ["path"],
    additionalProperties: false,
  },
};

describe("client-tool model input validation", () => {
  it("turns a schema-violating model input into a typed tool error without running the wait", async () => {
    expect(isSupportedClientToolSchema(OPEN_FILE.inputSchema)).toBe(true);

    const execute = vi.fn(async () => ({ opened: true }));
    const model = new MockLanguageModelV4({
      doStream: async () => ({
        stream: toStream(invalidToolCallParts()),
      }),
    });

    const result = streamText({
      model,
      stopWhen: stepCountIs(1),
      prompt: "Open the requested file.",
      tools: { open_file: reconstructAdmittedTool(OPEN_FILE, execute) },
    });

    const types: string[] = [];
    let erroredToolName: string | undefined;
    let toolErrorMessage: unknown;
    for await (const part of result.fullStream) {
      types.push(part.type);
      if (part.type === "tool-error") {
        erroredToolName = part.toolName;
        toolErrorMessage = part.error;
      }
    }

    expect(types).toContain("tool-error");
    expect(types).not.toContain("error");
    expect(erroredToolName).toBe("open_file");
    expect(String(toolErrorMessage)).toContain("path");
    expect(execute).not.toHaveBeenCalled();
  });
});

/**
 * Rebuild an admitted client tool the way `@ai-sdk/workflow`'s
 * `resolveSerializableTools` does: compile the host JSON Schema with Ajv and
 * expose a `validate` that reports a typed error on mismatch.
 */
function reconstructAdmittedTool(
  definition: ClientToolDefinition,
  execute: () => Promise<unknown>,
) {
  const ajv = new Ajv();
  const validateInput = ajv.compile(definition.inputSchema);
  return dynamicTool({
    description: definition.description,
    inputSchema: jsonSchema(definition.inputSchema, {
      validate: (value) =>
        validateInput(value)
          ? { success: true, value }
          : {
              success: false,
              error: new Error(ajv.errorsText(validateInput.errors)),
            },
    }),
    execute,
  });
}

function invalidToolCallParts(): readonly LanguageModelV4StreamPart[] {
  return modelStream()
    .toolCall({
      toolCallId: "call-1",
      toolName: "open_file",
      // `path` must be a string; a number violates the admitted schema.
      input: JSON.stringify({ path: 42 }),
    })
    .finish("tool-calls", TOOL_CALL_OUTPUT_TOKENS);
}

function toStream(
  parts: readonly LanguageModelV4StreamPart[],
): ReadableStream<LanguageModelV4StreamPart> {
  return new ReadableStream({
    start(controller) {
      for (const part of parts) controller.enqueue(part);
      controller.close();
    },
  });
}
