import type { DiagnosticLogFields, DiagnosticLogLevel, DiagnosticLogger } from "@side-chat/shared";
import type { ObservabilityRecord } from "@side-chat/partner-ai-core";
import { Effect } from "effect";
import { describe, expect, it } from "vitest";

import { createConsoleObservabilitySink } from "./console-observability-sink.js";

type Captured = {
  readonly level: DiagnosticLogLevel;
  readonly message: string;
  readonly fields: DiagnosticLogFields | undefined;
};

const createCapturingLogger = (): { logger: DiagnosticLogger; calls: Captured[] } => {
  const calls: Captured[] = [];
  const push = (level: DiagnosticLogLevel) => (message: string, fields?: DiagnosticLogFields) => {
    calls.push({ level, message, fields });
  };
  return {
    calls,
    logger: { debug: push("debug"), info: push("info"), warn: push("warn"), error: push("error") },
  };
};

const record = (over: Partial<ObservabilityRecord>): ObservabilityRecord => ({
  requestId: "request_00000001",
  traceId: "trace_request_00000001",
  lifecycleState: "received",
  assistantTurnId: "assistant_turn_00000009",
  latencyMs: 0,
  attributes: {},
  ...over,
});

const ALL_STATES: readonly ObservabilityRecord["lifecycleState"][] = [
  "received",
  "started",
  "runtime_event",
  "completed",
  "failed",
  "subscriber_attached",
  "subscriber_detached",
  "replay_served",
  "replay_expired",
  "event_read_failed",
  "turn_reaped",
  "turn_cancelled",
  "run_finished",
];

describe("console observability sink", () => {
  it("renders every lifecycle state without throwing", () => {
    const { logger, calls } = createCapturingLogger();
    const sink = createConsoleObservabilitySink(logger);

    for (const lifecycleState of ALL_STATES) {
      expect(() => Effect.runSync(sink.record(record({ lifecycleState })))).not.toThrow();
    }
    expect(calls).toHaveLength(ALL_STATES.length);
  });

  it("logs turn lifecycle and tool activity at info, delta churn at debug", () => {
    const { logger, calls } = createCapturingLogger();
    const sink = createConsoleObservabilitySink(logger);

    Effect.runSync(sink.record(record({ lifecycleState: "started", modelId: "fake-echo" })));
    Effect.runSync(
      sink.record(
        record({
          lifecycleState: "runtime_event",
          attributes: {
            eventType: "runtime.activity",
            activityKind: "tool",
            status: "running",
            activityMeta: { tool: { toolName: "mock_web_search" } },
          },
        }),
      ),
    );
    Effect.runSync(
      sink.record(
        record({
          lifecycleState: "runtime_event",
          attributes: { eventType: "runtime.output_delta" },
        }),
      ),
    );

    expect(calls[0]).toMatchObject({ level: "info", message: "turn started" });
    expect(calls[0]?.fields).toMatchObject({ model: "fake-echo" });
    expect(calls[1]).toMatchObject({ level: "info", message: "activity" });
    expect(calls[1]?.fields).toMatchObject({
      kind: "tool",
      name: "mock_web_search",
      status: "running",
    });
    expect(calls[2]).toMatchObject({ level: "debug", message: "runtime event" });
  });

  it("logs a failed event read at warn — a persistence fault, not routine churn", () => {
    const { logger, calls } = createCapturingLogger();
    const sink = createConsoleObservabilitySink(logger);

    Effect.runSync(sink.record(record({ lifecycleState: "event_read_failed" })));

    expect(calls[0]).toMatchObject({ level: "warn", message: "event read failed" });
  });

  it("never surfaces a payload that rode along in attributes", () => {
    const { logger, calls } = createCapturingLogger();
    const sink = createConsoleObservabilitySink(logger);

    Effect.runSync(
      sink.record(
        record({
          lifecycleState: "runtime_event",
          attributes: {
            eventType: "runtime.activity",
            activityKind: "tool",
            status: "completed",
            activityMeta: { tool: { toolName: "mock_web_search" } },
            output: "TOP SECRET TOOL OUTPUT",
          },
        }),
      ),
    );

    expect(JSON.stringify(calls[0]?.fields)).not.toContain("TOP SECRET TOOL OUTPUT");
  });

  it("is fail-open: a throwing logger never faults the record effect", () => {
    const throwingLogger: DiagnosticLogger = {
      debug: () => {
        throw new Error("logger is broken");
      },
      info: () => {
        throw new Error("logger is broken");
      },
      warn: () => undefined,
      error: () => undefined,
    };
    const sink = createConsoleObservabilitySink(throwingLogger);

    expect(() => Effect.runSync(sink.record(record({ lifecycleState: "started" })))).not.toThrow();
  });
});
