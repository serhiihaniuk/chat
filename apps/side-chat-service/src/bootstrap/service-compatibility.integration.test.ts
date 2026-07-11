import { spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { TEST_COMPOSITION } from "#adapters/configuration/process-environment";
import {
  LATE_CONTENT_MARKER,
  PROVIDER_OBSERVATION_PREFIX,
} from "#adapters/outbound/workflow/scripted-language-model";
import { SERVICE_ENV_KEYS } from "#ports/configuration/side-chat-config";

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
const repoRoot = resolve(import.meta.dirname, "../../../..");
const serviceRoot = resolve(repoRoot, "apps/side-chat-service");
let service: ChildProcess | undefined;
let serviceBaseUrl = "";
let serviceOutput = "";
let workflowDataDir = "";

describe("WorkflowAgent substrate service", { timeout: 120_000 }, () => {
  beforeAll(async () => {
    await runCommand("npm", ["run", "build", "--workspace", "@side-chat/side-chat-service"]);
    const port = await availablePort();
    serviceBaseUrl = `http://127.0.0.1:${port}`;
    workflowDataDir = mkdtempSync(join(tmpdir(), "side-chat-workflow-data-"));
    service = startService(port);
    await waitForReady();
  }, 300_000);

  afterAll(async () => {
    await stopService(service);
    if (workflowDataDir) rmSync(workflowDataDir, { recursive: true, force: true });
  });

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
  throw new Error(`Cancel hook never became resumable:\n${serviceOutput}`);
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
  throw new Error(`Provider never reported "${event}" for ${requestId}:\n${serviceOutput}`);
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
  for (const line of serviceOutput.split("\n")) {
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

function startService(port: number): ChildProcess {
  const child = spawn(process.execPath, [".output/server/index.mjs"], {
    cwd: serviceRoot,
    env: cleanEnv({
      ...process.env,
      PORT: String(port),
      [SERVICE_ENV_KEYS.TEST_COMPOSITION]: TEST_COMPOSITION.ENABLED,
      [SERVICE_ENV_KEYS.WORKFLOW_LOCAL_DATA_DIR]: workflowDataDir,
      [SERVICE_ENV_KEYS.WORKFLOW_LOCAL_BASE_URL]: `http://127.0.0.1:${port}`,
    }),
    shell: false,
    stdio: "pipe",
  });
  child.stdout?.on("data", (chunk) => (serviceOutput += String(chunk)));
  child.stderr?.on("data", (chunk) => (serviceOutput += String(chunk)));
  return child;
}

async function waitForReady(): Promise<void> {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (service?.exitCode !== null) throw new Error(`Service exited:\n${serviceOutput}`);
    try {
      const response = await fetch(`${serviceBaseUrl}/readyz`);
      if (response.ok) return;
    } catch {
      // The child process may not have bound its port yet.
    }
    await delay(100);
  }
  throw new Error(`Timed out waiting for service:\n${serviceOutput}`);
}

async function stopService(child: ChildProcess | undefined): Promise<void> {
  if (!child || child.exitCode !== null) return;
  child.kill("SIGTERM");
  await new Promise<void>((resolveExit) => {
    child.once("exit", () => resolveExit());
    setTimeout(resolveExit, 5_000).unref();
  });
  if (child.exitCode === null) child.kill("SIGKILL");
}

async function runCommand(command: string, args: ReadonlyArray<string>): Promise<void> {
  await new Promise<void>((resolveRun, rejectRun) => {
    const child = spawn(resolveCommand(command), resolveArgs(command, args), {
      cwd: repoRoot,
      env: cleanEnv(process.env),
      shell: false,
      stdio: "inherit",
    });
    child.once("error", rejectRun);
    child.once("exit", (code) =>
      code === 0
        ? resolveRun()
        : rejectRun(new Error(`${command} exited with ${code ?? "unknown"}`)),
    );
  });
}

function resolveCommand(command: string): string {
  return process.platform === "win32" && command === "npm" ? "cmd.exe" : command;
}

function resolveArgs(command: string, args: ReadonlyArray<string>): ReadonlyArray<string> {
  return process.platform === "win32" && command === "npm"
    ? ["/d", "/s", "/c", "npm", ...args]
    : args;
}

/**
 * Drops undefined and malformed entries, and pins the suite to the local world
 * even when the surrounding shell targets postgres.
 */
function cleanEnv(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  return Object.fromEntries(
    Object.entries(env).filter(
      ([key, value]) =>
        key.length > 0 &&
        !key.startsWith("=") &&
        key !== SERVICE_ENV_KEYS.WORKFLOW_TARGET_WORLD &&
        value !== undefined,
    ),
  );
}

async function availablePort(): Promise<number> {
  return new Promise<number>((resolvePort, rejectPort) => {
    const server = createServer();
    server.once("error", rejectPort);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close();
        rejectPort(new Error("Failed to allocate a service port"));
        return;
      }
      server.close(() => resolvePort(address.port));
    });
  });
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));
}
