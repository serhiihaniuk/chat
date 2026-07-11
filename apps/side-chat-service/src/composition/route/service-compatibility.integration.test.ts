import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { LATE_CONTENT_MARKER, PROVIDER_OBSERVATION_PREFIX } from "#testing/scripted-language-model";
import { BUNDLED_CONFIG_NAMES } from "#config/declaration/bundled-config-catalog";
import { SERVICE_ENV_KEYS } from "#config/declaration/side-chat-config";
import { serviceProcessEnv } from "#config/environment/process-environment";
import {
  startCompiledService,
  type CompiledService,
} from "#adapters/http/testing/compiled-service-process";

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
 */
let service: CompiledService | undefined;
let serviceBaseUrl = "";

describe("WorkflowAgent substrate service", { timeout: 120_000 }, () => {
  beforeAll(async () => {
    service = await startCompiledService({
      environment: serviceProcessEnv(),
      configName: BUNDLED_CONFIG_NAMES.FAKE,
      configNameEnvKey: SERVICE_ENV_KEYS.CONFIG_NAME,
      localBaseUrlEnvKey: SERVICE_ENV_KEYS.WORKFLOW_LOCAL_BASE_URL,
      localDataDirectoryEnvKey: SERVICE_ENV_KEYS.WORKFLOW_LOCAL_DATA_DIR,
      providerObservationPrefix: PROVIDER_OBSERVATION_PREFIX,
      targetWorldEnvKey: SERVICE_ENV_KEYS.WORKFLOW_TARGET_WORLD,
    });
    serviceBaseUrl = service.baseUrl;
  }, 300_000);

  afterAll(async () => {
    await service?.close();
  }, 300_000);

  it("boots and completes a native WorkflowAgent UI message stream", async () => {
    const requestId = "completed-turn";
    const response = await startTurn(requestId, "complete");
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
    const response = await startTurn(requestId, "block");
    expect(response.status).toBe(200);

    await waitForObservation(requestId, "provider-streaming");
    await cancelTurn(requestId);

    const observation = await waitForObservation(requestId, "provider-aborted");
    expect(observation["abortObserved"]).toBe(true);
    expect(observation["lateContentAccepted"]).toBe(false);

    const stream = await response.text();
    expect(stream).toContain("streaming before ");
    expect(stream).not.toContain(LATE_CONTENT_MARKER);
    expect(stream).toContain("[DONE]");

    // The abort must end the turn, not trigger engine-level step retries.
    expect(countObservations(requestId, "provider-streaming")).toBe(1);
  });

  it("runs the production chat route through the compiled WorkflowAgent", async () => {
    const requestId = "api-happy-turn";
    const response = await startApiTurn(requestId, "happy");
    expect(response.status).toBe(200);
    expect(response.headers.get("x-vercel-ai-ui-message-stream")).toBe("v1");
    expect(response.headers.get("x-workflow-run-id")).toBeTruthy();
    const stream = await response.text();
    expect(stream).toContain(`Scripted reply: ${requestId}`);
    expect(countStreamParts(stream, "finish")).toBe(1);
    const runId = requireRunId(response);
    const shape = await readJournalShape(runId);
    expect(shape).toEqual({ dataRows: 6, totalRows: 7, postgresSqlRoundTrips: 14 });
  });

  it("replays a terminal turn with pinned zero, negative, and past-end cursor semantics", async () => {
    const requestId = "api-terminal-replay";
    const started = await startApiTurn(requestId, "happy");
    const runId = requireRunId(started);
    await started.text();

    const full = await replayApiTurn(runId, 0);
    expect(full.status).toBe(200);
    const tailIndex = Number(full.headers.get("x-workflow-stream-tail-index"));
    expect(Number.isSafeInteger(tailIndex)).toBe(true);
    const fullBody = await full.text();
    expect(fullBody).toContain(`Scripted reply: ${requestId}`);
    expect(countStreamParts(fullBody, "finish")).toBe(1);

    const negative = await replayApiTurn(runId, -2);
    expect(negative.status).toBe(200);
    expect(negative.headers.get("x-workflow-stream-tail-index")).toBe(String(tailIndex));
    expect(countStreamParts(await negative.text(), "finish")).toBe(1);

    const atEnd = await replayApiTurn(runId, tailIndex + 1);
    expect(atEnd.status).toBe(200);
    expect(dataLines(await atEnd.text())).toEqual([]);

    const pastEnd = await replayApiTurn(runId, tailIndex + 2);
    expect(pastEnd.status).toBe(416);
    expect(pastEnd.headers.get("x-workflow-stream-tail-index")).toBe(String(tailIndex));
  });

  it("gives simultaneous subscribers the same replay prefix and live tail", async () => {
    const requestId = "api-live-replay";
    const started = await startApiTurn(requestId, "cancel-mid");
    const runId = requireRunId(started);
    await waitForObservation(requestId, "provider-streaming");

    const [first, second] = await Promise.all([replayApiTurn(runId, 0), replayApiTurn(runId, 0)]);
    await cancelApiTurn(runId);
    const [postBody, firstBody, secondBody] = await Promise.all([
      started.text(),
      first.text(),
      second.text(),
    ]);

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(dataLines(firstBody)).toEqual(dataLines(secondBody));
    expect(firstBody.match(/partial reply/g)).toHaveLength(1);
    expect(secondBody.match(/partial reply/g)).toHaveLength(1);
    expect(postBody).toContain("partial reply");
  });

  it("durably times out and aborts a blocked provider call", async () => {
    const requestId = "api-provider-timeout";
    const response = await startApiTurn(requestId, "cancel-before-first");
    const observation = await waitForObservation(requestId, "provider-aborted");
    expect(observation["abortObserved"]).toBe(true);
    expect(observation["lateContentAccepted"]).toBe(false);
    await response.text();
    expect(countObservations(requestId, "provider-attempt")).toBe(1);
  });

  it.each([
    ["before-first", "cancel-before-first", "provider-waiting", false],
    ["mid-stream", "cancel-mid", "provider-streaming", true],
  ] as const)(
    "aborts the provider exactly once on %s cancellation",
    async (_label, mode, readyEvent, expectsPartial) => {
      const requestId = `api-${mode}`;
      const response = await startApiTurn(requestId, mode);
      const runId = response.headers.get("x-workflow-run-id");
      expect(runId).toBeTruthy();
      await waitForObservation(requestId, readyEvent);
      if (!runId) throw new Error("Expected the chat route to return a run id");
      await cancelApiTurn(runId);
      const observation = await waitForObservation(requestId, "provider-aborted");
      expect(observation["attemptCount"]).toBe(1);
      expect(observation["abortObserved"]).toBe(true);
      expect(observation["lateContentAccepted"]).toBe(false);
      const stream = await response.text();
      expect(stream.includes("partial reply")).toBe(expectsPartial);
      expect(stream).not.toContain(LATE_CONTENT_MARKER);
      expect(countObservations(requestId, "provider-attempt")).toBe(1);
    },
  );

  it.each([
    ["before output", "error-before", false],
    ["mid-stream", "error-mid", true],
  ] as const)(
    "keeps a provider error %s inside the opened SSE stream",
    async (_label, mode, partial) => {
      const requestId = `api-${mode}`;
      const response = await startApiTurn(requestId, mode);
      expect(response.status).toBe(200);
      const stream = await response.text();
      expect(stream.includes("partial reply")).toBe(partial);
      expect(countStreamParts(stream, "error")).toBe(1);
      expect(countObservations(requestId, "provider-attempt")).toBe(1);
    },
  );

  it("proves the realm patch is load-bearing (unpatched abortSignal throws)", async () => {
    const response = await fetch(`${serviceBaseUrl}/compatibility/probes/unpatched-abort-signal`, {
      method: "POST",
    });
    expect(response.status).toBe(200);

    const outcome: unknown = await response.json();
    expect(isRecord(outcome)).toBe(true);
    if (!isRecord(outcome)) return;
    expect(outcome["status"]).toBe("stream-rejected");
    expect(outcome["errorName"]).toBe("TypeError");
    expect(outcome["errorMessage"]).toContain("instanceof");
  });
});

function startTurn(requestId: string, mode: "complete" | "block"): Promise<Response> {
  return fetch(`${serviceBaseUrl}/compatibility/turns`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      requestId,
      mode,
      messages: [
        {
          id: `user-${requestId}`,
          role: "user",
          parts: [{ type: "text", text: "hello" }],
        },
      ],
    }),
  });
}

type ApiScriptMode = "happy" | "cancel-before-first" | "cancel-mid" | "error-before" | "error-mid";

function startApiTurn(requestId: string, mode: ApiScriptMode): Promise<Response> {
  return fetch(`${serviceBaseUrl}/api/chat`, {
    method: "POST",
    headers: {
      authorization: "Bearer local-test-token",
      "content-type": "application/json",
      "x-request-id": requestId,
    },
    body: JSON.stringify({
      requestId,
      conversationId: "conversation-1",
      modelPreference: mode,
      messages: [
        {
          id: `user-${requestId}`,
          role: "user",
          parts: [{ type: "text", text: "hello" }],
        },
      ],
    }),
  });
}

function replayApiTurn(runId: string, startIndex: number): Promise<Response> {
  return fetch(`${serviceBaseUrl}/api/chat/${runId}/stream?startIndex=${startIndex}`, {
    headers: { authorization: "Bearer local-test-token" },
  });
}

async function readJournalShape(runId: string): Promise<Record<string, unknown>> {
  const response = await fetch(`${serviceBaseUrl}/compatibility/chat-turns/${runId}/journal-shape`);
  const shape: unknown = await response.json();
  if (!isRecord(shape)) throw new Error("Expected journal shape JSON");
  return shape;
}

function requireRunId(response: Response): string {
  const runId = response.headers.get("x-workflow-run-id");
  if (!runId) throw new Error("Expected the chat route to return a run id");
  return runId;
}

function dataLines(stream: string): string[] {
  return stream.split("\n").filter((line) => line.startsWith("data: ") && line !== "data: [DONE]");
}

/** The durable run-id hook may not exist until the workflow first suspends. */
async function cancelApiTurn(runId: string): Promise<void> {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    const response = await fetch(`${serviceBaseUrl}/api/chat/${runId}/cancel`, {
      method: "POST",
      headers: {
        authorization: "Bearer local-test-token",
        "content-type": "application/json",
      },
      body: JSON.stringify({ conversationId: "conversation-1" }),
    });
    if (response.ok) return;
    await delay(100);
  }
  throw new Error(`Chat cancel hook never became resumable:\n${currentServiceOutput()}`);
}

function countStreamParts(stream: string, type: string): number {
  return stream.split(`"type":"${type}"`).length - 1;
}

/** The durable cancel hook registers when the workflow first suspends; retry until it exists. */
async function cancelTurn(requestId: string): Promise<void> {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    const response = await fetch(`${serviceBaseUrl}/compatibility/turns/${requestId}/cancel`, {
      method: "POST",
    });
    const body: unknown = await response.json();
    if (isRecord(body) && body["cancelled"] === true) return;
    await delay(100);
  }
  throw new Error(`Cancel hook never became resumable:\n${currentServiceOutput()}`);
}

async function waitForObservation(
  requestId: string,
  event: string,
): Promise<Record<string, unknown>> {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    const observation = readObservation(requestId, event);
    if (observation) return observation;
    await delay(50);
  }
  throw new Error(
    `Provider never reported "${event}" for ${requestId}:\n${currentServiceOutput()}`,
  );
}

/** Scans captured service stdout for the scripted provider's observation lines. */
function readObservation(requestId: string, event: string): Record<string, unknown> | undefined {
  return readObservations(requestId, event)[0];
}

function countObservations(requestId: string, event: string): number {
  return readObservations(requestId, event).length;
}

function readObservations(requestId: string, event: string): Array<Record<string, unknown>> {
  const observations: Array<Record<string, unknown>> = [];
  for (const line of currentServiceOutput().split("\n")) {
    const markerIndex = line.indexOf(PROVIDER_OBSERVATION_PREFIX);
    if (markerIndex < 0) continue;
    const parsed = tryParseJson(line.slice(markerIndex + PROVIDER_OBSERVATION_PREFIX.length));
    if (isRecord(parsed) && parsed["requestId"] === requestId && parsed["event"] === event) {
      observations.push(parsed);
    }
  }
  return observations;
}

function tryParseJson(source: string): unknown {
  try {
    const parsed: unknown = JSON.parse(source);
    return parsed;
  } catch {
    return undefined;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));
}

function currentServiceOutput(): string {
  return service?.output() ?? "Service output is unavailable";
}
