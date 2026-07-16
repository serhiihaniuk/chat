import type { LanguageModelV4StreamPart } from "@ai-sdk/provider";
import { dynamicTool, jsonSchema, stepCountIs, streamText, type Telemetry } from "ai";
import { MockLanguageModelV4 } from "ai/test";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  TELEMETRY_LABEL_ALLOWLIST,
  sanitizeTelemetryLabels,
  type TelemetryRecord,
  type TelemetrySink,
} from "#application/ports/telemetry-sink";
import { modelStream, TOOL_CALL_OUTPUT_TOKENS } from "#testing/provider/model-stream-parts";

import {
  AI_SDK_PINNED_TELEMETRY_ASSERTION_LIST,
  createAiSdkTelemetry,
  PRIVATE_TELEMETRY_OPTIONS,
  registerServiceTelemetry,
} from "#adapters/telemetry/ai-sdk-telemetry";

const PRIVATE_MARKERS = [
  "prompt-private-sentinel",
  "tool-input-private-sentinel",
  "tool-output-private-sentinel",
  "provider-error-private-sentinel",
  "approval-input-private-sentinel",
] as const;

describe("ai@7.0.22 telemetry contract", () => {
  let previous: typeof globalThis.AI_SDK_TELEMETRY_INTEGRATIONS;

  beforeEach(() => {
    previous = globalThis.AI_SDK_TELEMETRY_INTEGRATIONS;
    globalThis.AI_SDK_TELEMETRY_INTEGRATIONS = undefined;
  });

  afterEach(() => {
    globalThis.AI_SDK_TELEMETRY_INTEGRATIONS = previous;
  });

  it("implements the pinned callback assertion list", () => {
    const integration = createAiSdkTelemetry({ record: () => undefined });

    expect(AI_SDK_PINNED_TELEMETRY_ASSERTION_LIST).toEqual([
      "onStart",
      "onStepStart",
      "onStepEnd",
      "onLanguageModelCallStart",
      "onLanguageModelCallEnd",
      "onToolExecutionStart",
      "onToolExecutionEnd",
      "onEnd",
      "onAbort",
      "onError",
    ]);
    for (const callback of AI_SDK_PINNED_TELEMETRY_ASSERTION_LIST) {
      expect(integration[callback]).toBeTypeOf("function");
    }
  });

  it("drops identifier and other unknown label keys", () => {
    expect(
      sanitizeTelemetryLabels({
        operation: "ai.streamText",
        conversationId: "must-not-be-a-label",
        turnId: "must-not-be-a-label",
      }),
    ).toEqual({ operation: "ai.streamText" });
  });

  it("records the successful multi-step SDK sequence with timings and bounded labels", async () => {
    const records: TelemetryRecord[] = [];
    registerServiceTelemetry({ record: (record) => void records.push(record) });

    await runPrivateMultiStepTurn();

    expect(records.map(({ type }) => type)).toEqual([
      "service.boot",
      "ai.operation.start",
      "ai.step.start",
      "ai.language_model.start",
      "ai.language_model.end",
      "ai.tool.start",
      "ai.tool.end",
      "ai.step.end",
      "ai.step.start",
      "ai.language_model.start",
      "ai.language_model.end",
      "ai.step.end",
      "ai.operation.end",
    ]);

    const timedRecords = records.filter(
      (record) => record.type.endsWith(".end") && "responseTimeMs" in record,
    );
    expect(timedRecords.length).toBeGreaterThanOrEqual(3);
    for (const record of timedRecords) {
      expect(
        !("responseTimeMs" in record) ||
          record.responseTimeMs === undefined ||
          record.responseTimeMs >= 0,
      ).toBe(true);
    }

    const allowedLabels = new Set(Object.keys(TELEMETRY_LABEL_ALLOWLIST));
    for (const record of records) {
      for (const label of Object.keys(record.labels ?? {})) expect(allowedLabels).toContain(label);
    }
  });

  it("never serializes prompt, tool, error, runtime-context, or approval content", async () => {
    const records: TelemetryRecord[] = [];
    const integration = createAiSdkTelemetry({ record: (record) => void records.push(record) });

    await runPrivateMultiStepTurn(integration);
    await integration.onError?.(new Error(PRIVATE_MARKERS[3]));
    await integration.onAbort?.({
      callId: "private-call-id",
      reason: PRIVATE_MARKERS[4],
      steps: [],
      ...PRIVATE_TELEMETRY_OPTIONS,
    });

    const serialized = JSON.stringify(records);
    for (const marker of PRIVATE_MARKERS) expect(serialized).not.toContain(marker);
    expect(serialized).not.toContain("private-call-id");
  });

  it.each([
    [
      "throws",
      {
        record: () => {
          throw new Error("sink failed");
        },
      },
    ],
    ["rejects", { record: () => Promise.reject(new Error("sink failed")) }],
  ] satisfies readonly [string, TelemetrySink][])(
    "keeps the product outcome unchanged when the sink %s",
    async (_description, sink) => {
      await expect(runPrivateMultiStepTurn(createAiSdkTelemetry(sink))).resolves.toBe(
        PRIVATE_MARKERS[2],
      );
    },
  );
});

async function runPrivateMultiStepTurn(integration?: Telemetry): Promise<string> {
  let attempt = 0;
  const model = new MockLanguageModelV4({
    provider: "scripted-private-provider",
    modelId: "configured-private-alias",
    doStream: async () => ({
      stream: toStream(
        attempt++ === 0
          ? modelStream()
              .toolCall({
                toolCallId: "private-tool-call-id",
                toolName: "bounded_test_tool",
                input: JSON.stringify({ value: PRIVATE_MARKERS[1] }),
              })
              .finish("tool-calls", TOOL_CALL_OUTPUT_TOKENS)
          : modelStream().text(PRIVATE_MARKERS[2]).finish(),
      ),
    }),
  });
  const result = streamText({
    model,
    prompt: PRIVATE_MARKERS[0],
    stopWhen: stepCountIs(2),
    tools: {
      bounded_test_tool: dynamicTool({
        inputSchema: jsonSchema({ type: "object" }),
        execute: () => ({ content: PRIVATE_MARKERS[2] }),
      }),
    },
    runtimeContext: { approvalInput: PRIVATE_MARKERS[4] },
    telemetry: {
      ...PRIVATE_TELEMETRY_OPTIONS,
      ...(integration === undefined ? {} : { integrations: [integration] }),
    },
  });

  return result.text;
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
