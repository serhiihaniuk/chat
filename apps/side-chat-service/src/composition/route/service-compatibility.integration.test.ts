import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { LATE_CONTENT_MARKER, PROVIDER_OBSERVATION_EVENT } from "#testing/scripted-language-model";
import {
  CompiledCompatibilityFixture,
  isRecord,
} from "./testing-harness/compiled-compatibility-fixture.js";

/**
 * Permanent compatibility gate for the WorkflowAgent substrate. It runs against
 * the COMPILED Nitro output on the embedded local world (disposable per-run
 * data directory; production builds target @workflow/world-postgres via
 * WORKFLOW_TARGET_WORLD). It proves, on every dependency bump:
 * 1. the service boots and completes a native WorkflowAgent UI message stream;
 * 2. hook-based cancellation aborts the in-flight provider call (observed at
 *    the provider) and late provider content is rejected;
 * 3. the realm patch is load-bearing: the unpatched probe still throws the
 *    upstream `instanceof` TypeError. When that test starts failing because
 *    the probe completes, delete the outbound Workflow adapter's patch module.
 * 4. the pinned compiled path's native `needsApproval` behavior is characterized
 *    directly, so a dependency bump cannot silently move the safety boundary.
 * 5. the Side Chat wrapper suspends before its mutating step and executes that
 *    step exactly once only after the approval hook resumes.
 */
let fixture: CompiledCompatibilityFixture | undefined;

describe("WorkflowAgent substrate service", { timeout: 120_000 }, () => {
  beforeAll(async () => {
    fixture = await CompiledCompatibilityFixture.start(fetch);
  }, 300_000);

  afterAll(async () => {
    await fixture?.close();
  }, 300_000);

  it("boots and completes a native WorkflowAgent UI message stream", async () => {
    const requestId = "completed-turn";
    const response = await requireFixture().startCompatibilityTurn(requestId, "complete");
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/event-stream");
    expect(response.headers.get("x-vercel-ai-ui-message-stream")).toBe("v1");
    expect(response.headers.get("x-workflow-run-id")).toBeTruthy();

    const stream = await response.text();
    expect(stream).toContain('"type":"text-start"');
    expect(stream).toContain('"type":"text-delta"');
    expect(stream).toContain(`Scripted reply: ${requestId}`);
    expect(stream).toContain('"type":"finish"');
    expect(stream).toContain("[DONE]");
  });

  it("delivers hook cancellation to the in-flight provider call", async () => {
    const requestId = "cancelled-turn";
    const response = await requireFixture().startCompatibilityTurn(requestId, "block");
    expect(response.status).toBe(200);

    await requireFixture().waitForObservation(requestId, "provider-streaming");
    await requireFixture().cancelCompatibilityTurn(requestId);

    const observation = await requireFixture().waitForObservation(requestId, "provider-aborted");
    expect(observation["abortObserved"]).toBe(true);
    expect(observation["lateContentAccepted"]).toBe(false);

    const stream = await response.text();
    expect(stream).toContain("streaming before ");
    expect(stream).not.toContain(LATE_CONTENT_MARKER);
    expect(stream).toContain("[DONE]");

    // The abort must end the turn, not trigger engine-level step retries.
    expect(requireFixture().countObservations(requestId, "provider-streaming")).toBe(1);
  });

  it("runs the production chat route through the compiled WorkflowAgent", async () => {
    const requestId = "api-happy-turn";
    const response = await requireFixture().startApiTurn(requestId, "happy");
    expect(response.status).toBe(200);
    expect(response.headers.get("x-vercel-ai-ui-message-stream")).toBe("v1");
    expect(response.headers.get("x-workflow-run-id")).toBeTruthy();
    const stream = await response.text();
    expect(stream).toContain(`Scripted reply: ${requestId}`);
    expect(countStreamParts(stream, "finish")).toBe(1);
    const runId = requireRunId(response);
    const shape = await requireFixture().readJournalShape(runId);
    expect(shape).toEqual({ dataRows: 6, totalRows: 7, postgresSqlRoundTrips: 14 });
  });

  it("replays a terminal turn with pinned zero, negative, and past-end cursor semantics", async () => {
    const requestId = "api-terminal-replay";
    const started = await requireFixture().startApiTurn(requestId, "happy");
    const runId = requireRunId(started);
    await started.text();

    const full = await requireFixture().replayApiTurn(runId, 0);
    expect(full.status).toBe(200);
    const tailIndex = Number(full.headers.get("x-workflow-stream-tail-index"));
    expect(Number.isSafeInteger(tailIndex)).toBe(true);
    const fullBody = await full.text();
    expect(fullBody).toContain(`Scripted reply: ${requestId}`);
    expect(countStreamParts(fullBody, "finish")).toBe(1);

    const negative = await requireFixture().replayApiTurn(runId, -2);
    expect(negative.status).toBe(200);
    expect(negative.headers.get("x-workflow-stream-tail-index")).toBe(String(tailIndex));
    expect(countStreamParts(await negative.text(), "finish")).toBe(1);

    const atEnd = await requireFixture().replayApiTurn(runId, tailIndex + 1);
    expect(atEnd.status).toBe(200);
    expect(dataLines(await atEnd.text())).toEqual([]);

    const pastEnd = await requireFixture().replayApiTurn(runId, tailIndex + 2);
    expect(pastEnd.status).toBe(416);
    expect(pastEnd.headers.get("x-workflow-stream-tail-index")).toBe(String(tailIndex));
  });

  it("gives simultaneous subscribers the same replay prefix and live tail", async () => {
    const requestId = "api-live-replay";
    const started = await requireFixture().startApiTurn(requestId, "cancel-mid");
    const runId = requireRunId(started);
    await requireFixture().waitForObservation(requestId, "provider-streaming");

    const [first, second] = await Promise.all([
      requireFixture().replayApiTurn(runId, 0),
      requireFixture().replayApiTurn(runId, 0),
    ]);
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    if (!first.body) throw new Error("Expected the first replay response body");
    const firstReader = first.body.getReader();
    const firstDecoder = new TextDecoder();
    let firstBody = await readUntilText(firstReader, firstDecoder, "partial reply", 5_000);
    await requireFixture().cancelApiTurn(runId);
    const [postBody, firstRemainder, secondBody] = await Promise.all([
      started.text(),
      readReaderToEnd(firstReader, firstDecoder),
      second.text(),
    ]);
    firstBody += firstRemainder;

    expect(dataLines(firstBody)).toEqual(dataLines(secondBody));
    expect(firstBody.match(/partial reply/g)).toHaveLength(1);
    expect(secondBody.match(/partial reply/g)).toHaveLength(1);
    expect(postBody).toContain("partial reply");
  });

  it("durably times out and aborts a blocked provider call", async () => {
    const requestId = "api-provider-timeout";
    const response = await requireFixture().startApiTurn(requestId, "cancel-before-first");
    const observation = await requireFixture().waitForObservation(requestId, "provider-aborted");
    expect(observation["abortObserved"]).toBe(true);
    expect(observation["lateContentAccepted"]).toBe(false);
    await response.text();
    expect(requireFixture().countObservations(requestId, "provider-attempt")).toBe(1);
  });

  it.each([
    ["before-first", "cancel-before-first", "provider-waiting", false],
    ["mid-stream", "cancel-mid", "provider-streaming", true],
  ] as const)(
    "aborts the provider exactly once on %s cancellation",
    async (_label, mode, readyEvent, expectsPartial) => {
      const requestId = `api-${mode}`;
      const response = await requireFixture().startApiTurn(requestId, mode);
      const runId = response.headers.get("x-workflow-run-id");
      expect(runId).toBeTruthy();
      await requireFixture().waitForObservation(requestId, readyEvent);
      if (!runId) throw new Error("Expected the chat route to return a run id");
      await requireFixture().cancelApiTurn(runId);
      const observation = await requireFixture().waitForObservation(requestId, "provider-aborted");
      expect(observation["attemptCount"]).toBe(1);
      expect(observation["abortObserved"]).toBe(true);
      expect(observation["lateContentAccepted"]).toBe(false);
      const stream = await response.text();
      expect(stream.includes("partial reply")).toBe(expectsPartial);
      expect(stream).not.toContain(LATE_CONTENT_MARKER);
      expect(requireFixture().countObservations(requestId, "provider-attempt")).toBe(1);
    },
  );

  it.each([
    ["before output", "error-before", false],
    ["mid-stream", "error-mid", true],
  ] as const)(
    "keeps a provider error %s inside the opened SSE stream",
    async (_label, mode, partial) => {
      const requestId = `api-${mode}`;
      const response = await requireFixture().startApiTurn(requestId, mode);
      expect(response.status).toBe(200);
      const stream = await response.text();
      expect(stream.includes("partial reply")).toBe(partial);
      expect(countStreamParts(stream, "error")).toBe(1);
      expect(requireFixture().countObservations(requestId, "provider-attempt")).toBe(1);
    },
  );

  it("proves the realm patch is load-bearing (unpatched abortSignal throws)", async () => {
    const response = await fetch(
      `${requireFixture().baseUrl}/compatibility/probes/unpatched-abort-signal`,
      { method: "POST" },
    );
    expect(response.status).toBe(200);

    const outcome: unknown = await response.json();
    expect(isRecord(outcome)).toBe(true);
    if (!isRecord(outcome)) return;
    expect(outcome["status"]).toBe("stream-rejected");
    expect(outcome["errorName"]).toBe("TypeError");
    expect(outcome["errorMessage"]).toContain("instanceof");
  });

  it("characterizes compiled native needsApproval as blocking execution", async () => {
    const requestId = "native-approval-gap";
    const response = await fetch(
      `${requireFixture().baseUrl}/compatibility/probes/native-needs-approval-gap`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ requestId }),
      },
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      stepCount: 1,
      toolCallsCount: 1,
      toolResultsCount: 0,
    });
    expect(
      requireFixture().countObservations(
        requestId,
        PROVIDER_OBSERVATION_EVENT.NATIVE_APPROVAL_TOOL_EXECUTED,
      ),
    ).toBe(0);
  });

  it("keeps the compiled wrapper side effect behind the approval hook", async () => {
    const requestId = "wrapper-approval-gate";
    const started = await fetch(
      `${requireFixture().baseUrl}/compatibility/probes/wrapper-approval-gate`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ requestId }),
      },
    );
    expect(started.status).toBe(200);
    const body: unknown = await started.json();
    if (!isRecord(body)) throw new Error("Expected wrapper approval probe identifiers");
    const runId = body["runId"];
    const approvalId = body["approvalId"];
    if (typeof runId !== "string" || typeof approvalId !== "string") {
      throw new Error("Expected wrapper approval probe run and approval identifiers");
    }

    await requireFixture().waitForObservation(requestId, "wrapper-approval-requested");
    expect(requireFixture().countObservations(requestId, "wrapper-side-effect-executed")).toBe(0);
    await requireFixture().approveWrapperProbe(runId, approvalId);
    await requireFixture().waitForObservation(requestId, "wrapper-side-effect-executed");
    expect(requireFixture().countObservations(requestId, "wrapper-side-effect-executed")).toBe(1);
  });
});

function requireRunId(response: Response): string {
  const runId = response.headers.get("x-workflow-run-id");
  if (!runId) throw new Error("Expected the chat route to return a run id");
  return runId;
}

function dataLines(stream: string): string[] {
  return stream.split("\n").filter((line) => line.startsWith("data: ") && line !== "data: [DONE]");
}

async function readUntilText(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  decoder: TextDecoder,
  expected: string,
  timeoutMs: number,
): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  let text = "";
  while (!text.includes(expected)) {
    const remainingMs = deadline - Date.now();
    if (remainingMs <= 0) throw new Error("Live replay prefix did not arrive before cancellation");
    const result = await readWithTimeout(reader, remainingMs);
    if (result.done) break;
    text += decoder.decode(result.value, { stream: true });
  }
  expect(text).toContain(expected);
  return text;
}

async function readWithTimeout(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  timeoutMs: number,
): Promise<ReadableStreamReadResult<Uint8Array>> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      reader.read(),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(
          () => reject(new Error("Live replay prefix did not arrive before cancellation")),
          timeoutMs,
        );
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

async function readReaderToEnd(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  decoder: TextDecoder,
): Promise<string> {
  let text = "";
  while (true) {
    const result = await reader.read();
    if (result.done) return text + decoder.decode();
    text += decoder.decode(result.value, { stream: true });
  }
}

function countStreamParts(stream: string, type: string): number {
  return stream.split(`"type":"${type}"`).length - 1;
}

function requireFixture(): CompiledCompatibilityFixture {
  if (!fixture) throw new Error("Compiled compatibility fixture is unavailable");
  return fixture;
}
