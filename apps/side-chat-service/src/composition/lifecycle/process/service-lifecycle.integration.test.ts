import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClientToolDurabilityProbe } from "@side-chat/db/testing/client-tool-durability-test-support";

import {
  observeCompiledStartupFailure,
  prepareCompiledService,
  type CompiledService,
  type CompiledServiceOptions,
  type PreparedCompiledService,
} from "#adapters/http/testing/compiled-service-process";
import { BUNDLED_CONFIG_NAMES } from "#config/declaration/bundled-config-catalog";
import { SERVICE_ENV_KEYS } from "#config/declaration/side-chat-config";
import { serviceProcessEnv } from "#config/environment/process-environment";
import {
  PROVIDER_OBSERVATION_EVENT,
  PROVIDER_OBSERVATION_PREFIX,
  readProviderObservations,
} from "#testing/scripted-language-model";

const DATABASE_URL = process.env["SIDECHAT_TEST_DATABASE_URL"];
const HAS_DATABASE = DATABASE_URL !== undefined;
const AUTHORIZATION = { authorization: "Bearer local-test-token" } as const;
const HTTP_TIMEOUT_MS = 30_000;
const TEST_DRAIN_BUDGET_MS = 150;
const WORKFLOW_INLINE_OWNERSHIP_LEASE_ENV_KEY = "WORKFLOW_INLINE_OWNERSHIP_LEASE_SECONDS";

let build: PreparedCompiledService | undefined;
let databaseProbe: ReturnType<typeof createClientToolDurabilityProbe> | undefined;
const startedServices = new Set<CompiledService>();

describe
  .skipIf(!HAS_DATABASE)
  .sequential("compiled process lifecycle", { timeout: 180_000 }, () => {
    beforeAll(async () => {
      build = await prepareCompiledService(serviceOptions(requireDatabaseUrl()));
      databaseProbe = createClientToolDurabilityProbe(requireDatabaseUrl());
    }, 300_000);

    afterAll(async () => {
      await Promise.all([...startedServices].map((service) => service.close()));
      await databaseProbe?.close();
      await build?.close();
    }, 300_000);

    it("boots ready, completes and cancels turns, then handles double shutdown once", async () => {
      const service = await startService();
      await expectReady(service);
      console.log("Lifecycle smoke: ready");

      const completeId = uniqueId("complete");
      const completeRequestId = uniqueId("complete-request");
      await requireProbe().seedConversation(completeId);
      const complete = await startTurn(service, completeId, "complete", completeRequestId);
      const completeRunId = requireRunId(complete);
      expect(complete.status).toBe(200);
      expect(await complete.text()).toContain('"type":"finish"');
      const replay = await startTurn(service, completeId, "complete", completeRequestId);
      expect(requireRunId(replay)).toBe(completeRunId);
      expect(await replay.text()).toContain('"type":"finish"');
      expect(
        readProviderObservations(
          service.output(),
          completeRequestId,
          PROVIDER_OBSERVATION_EVENT.ATTEMPT,
        ),
      ).toHaveLength(1);
      console.log("Lifecycle smoke: completed turn");

      const cancelId = uniqueId("cancel");
      await requireProbe().seedConversation(cancelId);
      const cancelled = await startTurn(service, cancelId, "block");
      const cancelledRunId = requireRunId(cancelled);
      console.log("Lifecycle smoke: blocking turn started");
      await cancelWhenReady(service, cancelId, cancelledRunId);
      console.log("Lifecycle smoke: cancellation acknowledged");
      await waitForSettledConversation(service, cancelId, cancelledRunId);
      console.log("Lifecycle smoke: cancellation durable");
      await cancelled.body?.cancel().catch(() => undefined);

      const shutdown = await service.shutdown(2);
      expect(shutdown.exitCode).toBe(0);
      expect(shutdown.observations).toMatchObject([
        { stage: "drain", outcome: "completed" },
        { stage: "streams", outcome: "completed" },
        { stage: "server", outcome: "completed" },
        { stage: "world", outcome: "completed" },
        { stage: "resources", outcome: "completed" },
      ]);
      await releaseService(service);
    });

    it("hard-crashes mid-stream, resumes after restart, and reconnects to the terminal", async () => {
      const conversationId = uniqueId("crash-resume");
      const requestId = uniqueId("crash-recovery");
      await requireProbe().seedConversation(conversationId);
      const first = await startService();
      const response = await startTurn(first, conversationId, "crash-recovery", requestId);
      const runId = requireRunId(response);
      const reader = response.body?.getReader();
      await waitForProviderObservation(first, requestId, PROVIDER_OBSERVATION_EVENT.STREAMING);
      await reader?.read();
      console.log("Lifecycle smoke: crash stream produced output");
      await first.crash();
      await releaseService(first);

      const second = await startService();
      await expectReady(second);
      console.log("Lifecycle smoke: crash restart ready");
      const replay = await fetch(`${second.baseUrl}/api/chat/${runId}/stream`, {
        headers: AUTHORIZATION,
        signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
      });
      expect(replay.status).toBe(200);
      await waitForSettledConversation(second, conversationId, runId);
      console.log("Lifecycle smoke: recovered turn completed without a new command");
      expect(await requireProbe().waitForWorkflowRunTerminal(runId)).toBe("completed");
      const replayBody = await replay.text();
      expect(replayBody).toContain(`Scripted recovered reply: ${requestId}`);
      expect(replayBody).toContain('"type":"finish"');
      console.log("Lifecycle smoke: reconnect terminal received");
      expect((await second.shutdown()).exitCode).toBe(0);
      await releaseService(second);
    });

    it("advances past a blocked provider within drain budget plus grace", async () => {
      const conversationId = uniqueId("blocked-shutdown");
      await requireProbe().seedConversation(conversationId);
      const service = await startService();
      const response = await startTurn(service, conversationId, "block");
      const startedAt = Date.now();
      const shutdown = await service.shutdown();

      expect(Date.now() - startedAt).toBeLessThan(6_000);
      expect(shutdown.exitCode).toBe(0);
      expect(shutdown.observations).toMatchObject([
        { stage: "drain", outcome: "timed_out" },
        { stage: "streams", outcome: "completed" },
        { stage: "server", outcome: "completed" },
        { stage: "world", outcome: "completed" },
        { stage: "resources", outcome: "completed" },
      ]);
      await response.body?.cancel().catch(() => undefined);
      await releaseService(service);
    });

    it("fails bad-database boot without opening the reserved port", async () => {
      const failure = await observeCompiledStartupFailure(
        serviceOptions("postgres://sidechat:sidechat@127.0.0.1:1/sidechat"),
      );
      expect(failure.exitCode).not.toBe(0);
      expect(failure.openedPort).toBe(false);
      expect(failure.output).toContain("Side Chat failed during compiled module import.");
    });
  });

function serviceOptions(databaseUrl: string): CompiledServiceOptions {
  return {
    environment: {
      ...serviceProcessEnv(),
      [SERVICE_ENV_KEYS.SIDECHAT_DATABASE_URL]: databaseUrl,
      [SERVICE_ENV_KEYS.WORKFLOW_POSTGRES_URL]: databaseUrl,
      [SERVICE_ENV_KEYS.WORKFLOW_TARGET_WORLD]: "@workflow/world-postgres",
      [SERVICE_ENV_KEYS.SIDECHAT_DRAIN_BUDGET_MS]: String(TEST_DRAIN_BUDGET_MS),
      // The fake provider is bounded to two seconds; a one-second ownership
      // lease lets this disposable process-crash proof observe the SDK's
      // delayed backstop recovery without waiting for the production default.
      [WORKFLOW_INLINE_OWNERSHIP_LEASE_ENV_KEY]: "1",
    },
    configName: BUNDLED_CONFIG_NAMES.FAKE,
    configNameEnvKey: SERVICE_ENV_KEYS.CONFIG_NAME,
    localBaseUrlEnvKey: SERVICE_ENV_KEYS.WORKFLOW_LOCAL_BASE_URL,
    localDataDirectoryEnvKey: SERVICE_ENV_KEYS.WORKFLOW_LOCAL_DATA_DIR,
    providerObservationPrefix: PROVIDER_OBSERVATION_PREFIX,
    targetWorldEnvKey: SERVICE_ENV_KEYS.WORKFLOW_TARGET_WORLD,
    useConfiguredTargetWorld: true,
  };
}

async function startService(): Promise<CompiledService> {
  const service = await requireBuild().start();
  startedServices.add(service);
  return service;
}

async function releaseService(service: CompiledService): Promise<void> {
  await service.close();
  startedServices.delete(service);
}

async function expectReady(service: CompiledService): Promise<void> {
  const response = await fetch(`${service.baseUrl}/readyz`, {
    signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
  });
  expect(response.status).toBe(200);
}

function startTurn(
  service: CompiledService,
  conversationId: string,
  mode: "block" | "complete" | "crash-recovery",
  requestId = uniqueId(mode),
): Promise<Response> {
  return fetch(`${service.baseUrl}/api/chat`, {
    method: "POST",
    headers: { ...AUTHORIZATION, "content-type": "application/json", "x-request-id": requestId },
    body: JSON.stringify({
      requestId,
      conversationId,
      modelPreference: mode,
      hostContext: {
        schemaVersion: "lifecycle-smoke.host-context.v1",
        title: conversationId,
      },
      messages: [
        { id: `user-${requestId}`, role: "user", parts: [{ type: "text", text: requestId }] },
      ],
    }),
    signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
  });
}

async function waitForProviderObservation(
  service: CompiledService,
  requestId: string,
  event: string,
): Promise<void> {
  const deadline = Date.now() + HTTP_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (readProviderObservations(service.output(), requestId, event).length > 0) return;
    await delay(50);
  }
  throw new Error(`Provider never reported "${event}" for ${requestId}:\n${service.output()}`);
}

async function waitForSettledConversation(
  service: CompiledService,
  conversationId: string,
  runId?: string,
): Promise<void> {
  const deadline = Date.now() + HTTP_TIMEOUT_MS;
  let lastState: unknown;
  while (Date.now() < deadline) {
    const response = await fetch(`${service.baseUrl}/api/conversations/${conversationId}/state`, {
      headers: AUTHORIZATION,
      signal: AbortSignal.timeout(5_000),
    });
    if (response.ok) {
      const state: unknown = await response.json();
      lastState = state;
      if (isRecord(state) && !("activeTurn" in state)) return;
    }
    await delay(50);
  }
  const workflow =
    runId === undefined ? undefined : await requireProbe().describeWorkflowRun(runId);
  throw new Error(
    `Turn did not reach durable terminal state. Last state: ${JSON.stringify(lastState)}\nWorkflow: ${JSON.stringify(workflow)}\nService output:\n${service.output()}`,
  );
}

async function cancelWhenReady(
  service: CompiledService,
  conversationId: string,
  runId: string,
): Promise<void> {
  const deadline = Date.now() + HTTP_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const response = await fetchCancel(service, conversationId, runId);
    if (response.ok) return;
    await delay(50);
  }
  throw new Error("Recovered Workflow cancel hook did not become ready");
}

async function fetchCancel(
  service: CompiledService,
  conversationId: string,
  runId: string,
): Promise<Response> {
  try {
    return await fetch(`${service.baseUrl}/api/chat/${runId}/cancel`, {
      method: "POST",
      headers: { ...AUTHORIZATION, "content-type": "application/json" },
      body: JSON.stringify({ conversationId }),
      signal: AbortSignal.timeout(5_000),
    });
  } catch (error) {
    throw new Error(`Cancellation request failed. Service output:\n${service.output()}`, {
      cause: error,
    });
  }
}

function requireRunId(response: Response): string {
  const runId = response.headers.get("x-workflow-run-id");
  if (runId !== null) return runId;
  throw new Error("Expected Workflow run id response header");
}

function requireDatabaseUrl(): string {
  if (DATABASE_URL !== undefined) return DATABASE_URL;
  throw new Error("SIDECHAT_TEST_DATABASE_URL is required");
}

function requireBuild(): PreparedCompiledService {
  if (build !== undefined) return build;
  throw new Error("Compiled lifecycle build is unavailable");
}

function requireProbe(): ReturnType<typeof createClientToolDurabilityProbe> {
  if (databaseProbe !== undefined) return databaseProbe;
  throw new Error("Lifecycle database probe is unavailable");
}

function uniqueId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));
}
