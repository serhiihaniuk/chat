import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClientToolDurabilityProbe } from "@side-chat/db/testing/client-tool-durability-test-support";

import { HTTP_HEADERS } from "#adapters/http/http-contract";
import {
  prepareCompiledService,
  type CompiledService,
  type PreparedCompiledService,
} from "#adapters/http/testing/compiled-service-process";
import { BUNDLED_CONFIG_NAMES } from "#config/declaration/bundled-config-catalog";
import { SERVICE_ENV_KEYS } from "#config/declaration/side-chat-config";
import { serviceProcessEnv } from "#config/environment/process-environment";
import {
  CLIENT_TOOL_PRIVATE_RESULT_MARKER,
  PROVIDER_OBSERVATION_PREFIX,
} from "#testing/scripted-language-model";

const AUTHORIZATION = { authorization: "Bearer local-test-token" } as const;
const CLIENT_TOOL_CAPABILITY = "a".repeat(64);
const PRIVATE_TOOL_OUTPUT = CLIENT_TOOL_PRIVATE_RESULT_MARKER;
const HAS_DATABASE = process.env["SIDECHAT_TEST_DATABASE_URL"] !== undefined;
const HTTP_TIMEOUT_MS = 30_000;

let build: PreparedCompiledService | undefined;
let firstService: CompiledService | undefined;
let secondService: CompiledService | undefined;
let stoppedServiceOutput = "";
let databaseProbe: ReturnType<typeof createClientToolDurabilityProbe> | undefined;

describe.skipIf(!HAS_DATABASE)("client-tool durability", { timeout: 180_000 }, () => {
  beforeAll(async () => {
    const databaseUrl = requireDatabaseUrl();
    databaseProbe = createClientToolDurabilityProbe(databaseUrl);
    build = await prepareCompiledService({
      environment: {
        ...serviceProcessEnv(),
        [SERVICE_ENV_KEYS.SIDECHAT_DATABASE_URL]: databaseUrl,
        [SERVICE_ENV_KEYS.WORKFLOW_POSTGRES_URL]: databaseUrl,
        [SERVICE_ENV_KEYS.WORKFLOW_TARGET_WORLD]: "@workflow/world-postgres",
      },
      configName: BUNDLED_CONFIG_NAMES.FAKE,
      configNameEnvKey: SERVICE_ENV_KEYS.CONFIG_NAME,
      localBaseUrlEnvKey: SERVICE_ENV_KEYS.WORKFLOW_LOCAL_BASE_URL,
      localDataDirectoryEnvKey: SERVICE_ENV_KEYS.WORKFLOW_LOCAL_DATA_DIR,
      providerObservationPrefix: PROVIDER_OBSERVATION_PREFIX,
      targetWorldEnvKey: SERVICE_ENV_KEYS.WORKFLOW_TARGET_WORLD,
      useConfiguredTargetWorld: true,
    });
    firstService = await build.start();
  }, 300_000);

  afterAll(async () => {
    await Promise.all([firstService?.close(), secondService?.close()]);
    await databaseProbe?.close();
    await build?.close();
  }, 300_000);

  it("resumes a dispatched tool after a full service restart", async () => {
    const requestId = `client-tool-${crypto.randomUUID()}`;
    const toolCallId = `client-tool-${requestId}`;
    await requireDatabaseProbe().seedConversation(`conversation-${requestId}`);
    const started = await startClientToolTurn(requireService(firstService), requestId);
    await expectStarted(started);
    const runId = requireRunId(started);

    await requireDatabaseProbe().waitForDispatch(runId, toolCallId, "dispatched");
    await requireDatabaseProbe().waitForWorkflowHook(`tool:${runId}:${toolCallId}`);
    await started.body?.cancel();
    stoppedServiceOutput = requireService(firstService).output();
    await firstService?.crash();
    await firstService?.close();
    firstService = undefined;
    secondService = await requireBuild().start();

    const acknowledgement = await submitWhenReady(requireService(secondService), runId, toolCallId);
    expect(acknowledgement).toMatchObject({
      runId,
      toolCallId,
      state: "settled",
      accepted: true,
    });

    const settled = await requireDatabaseProbe().waitForDispatch(runId, toolCallId, "settled");
    expect(settled.state).toBe("settled");
    expect(
      await requireDatabaseProbe().countDispatchRows(settled.assistantTurnId, toolCallId),
    ).toBe(1);
    const replayStream = await replayCompletedTurn(runId);
    assertCompletedStream(replayStream, requestId);
    expect(replayStream).toContain('"output":{"status":"settled"}');
    expect(countStreamParts(replayStream, "tool-input-available")).toBe(1);
    expect(countStreamParts(replayStream, "tool-output-available")).toBe(1);
    expect(combinedServiceOutput()).toContain('"event":"client-tool-output-observed"');
    expect(combinedServiceOutput()).not.toContain(PRIVATE_TOOL_OUTPUT);
  });

  it("settles an abandoned client-tool wait as timed out", async () => {
    const requestId = `client-tool-timeout-${crypto.randomUUID()}`;
    const toolCallId = `client-tool-${requestId}`;
    await requireDatabaseProbe().seedConversation(`conversation-${requestId}`);
    const started = await startClientToolTurn(requireService(secondService), requestId);
    const runId = requireRunId(started);
    await requireDatabaseProbe().waitForDispatch(runId, toolCallId, "dispatched");

    const stream = await started.text();
    expect(
      (await requireDatabaseProbe().waitForDispatch(runId, toolCallId, "timed_out")).state,
    ).toBe("timed_out");
    assertCompletedStream(stream, requestId);
  });

  it("settles a cancelled client-tool wait as aborted", async () => {
    const requestId = `client-tool-cancel-${crypto.randomUUID()}`;
    const toolCallId = `client-tool-${requestId}`;
    const conversationId = `conversation-${requestId}`;
    await requireDatabaseProbe().seedConversation(conversationId);
    const started = await startClientToolTurn(requireService(secondService), requestId);
    const runId = requireRunId(started);
    await requireDatabaseProbe().waitForDispatch(runId, toolCallId, "dispatched");

    const cancelled = await fetch(
      `${requireService(secondService).baseUrl}/api/chat/${runId}/cancel`,
      {
        method: "POST",
        headers: { ...AUTHORIZATION, "content-type": "application/json" },
        body: JSON.stringify({ conversationId }),
        signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
      },
    );
    expect(cancelled.status).toBe(200);
    await started.text();
    expect((await requireDatabaseProbe().waitForDispatch(runId, toolCallId, "aborted")).state).toBe(
      "aborted",
    );
  });
});

function startClientToolTurn(service: CompiledService, requestId: string): Promise<Response> {
  return fetch(`${service.baseUrl}/api/chat`, {
    method: "POST",
    headers: {
      ...AUTHORIZATION,
      "content-type": "application/json",
      "x-request-id": requestId,
      [HTTP_HEADERS.CLIENT_TOOL_CAPABILITY]: CLIENT_TOOL_CAPABILITY,
    },
    body: JSON.stringify({
      requestId,
      conversationId: `conversation-${requestId}`,
      modelPreference: "client-tool",
      clientTools: [
        {
          name: "open_file",
          description: "Open one workspace file.",
          inputSchema: {
            type: "object",
            properties: { path: { type: "string" } },
            required: ["path"],
            additionalProperties: false,
          },
        },
      ],
      messages: [
        {
          id: `user-${requestId}`,
          role: "user",
          parts: [{ type: "text", text: "Open the requested file." }],
        },
      ],
    }),
    signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
  });
}

async function submitWhenReady(
  service: CompiledService,
  runId: string,
  toolCallId: string,
): Promise<Record<string, unknown>> {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    const response = await fetch(
      `${service.baseUrl}/api/chat/${runId}/tools/${toolCallId}/output`,
      {
        method: "POST",
        headers: {
          ...AUTHORIZATION,
          "content-type": "application/json",
          [HTTP_HEADERS.CLIENT_TOOL_CAPABILITY]: CLIENT_TOOL_CAPABILITY,
        },
        body: JSON.stringify({ output: { content: PRIVATE_TOOL_OUTPUT } }),
        signal: AbortSignal.timeout(5_000),
      },
    );
    if (response.ok) {
      const body: unknown = await response.json();
      if (isRecord(body)) return body;
      throw new Error("Expected a client-tool acknowledgement object");
    }
    if (response.status !== 409) {
      throw new Error(
        `Client-tool output failed with ${response.status}: ${await response.text()}`,
      );
    }
    await delay(50);
  }
  throw new Error(`Client-tool dispatch never became ready:\n${combinedServiceOutput()}`);
}

async function replayCompletedTurn(runId: string): Promise<string> {
  const replay = await fetch(`${requireService(secondService).baseUrl}/api/chat/${runId}/stream`, {
    headers: AUTHORIZATION,
    signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
  });
  expect(replay.status).toBe(200);
  return replay.text();
}

function assertCompletedStream(stream: string, requestId: string): void {
  expect(stream).toContain(`Client tool completed: ${requestId}`);
  expect(countStreamParts(stream, "finish")).toBe(1);
  expect(stream).not.toContain(PRIVATE_TOOL_OUTPUT);
}

function requireDatabaseUrl(): string {
  const value = process.env["SIDECHAT_TEST_DATABASE_URL"];
  if (!value) throw new Error("SIDECHAT_TEST_DATABASE_URL is required");
  return value;
}

function requireService(service: CompiledService | undefined): CompiledService {
  if (!service) throw new Error("Compiled test service did not start");
  return service;
}

function requireBuild(): PreparedCompiledService {
  if (!build) throw new Error("Compiled test build is unavailable");
  return build;
}

function requireDatabaseProbe(): ReturnType<typeof createClientToolDurabilityProbe> {
  if (!databaseProbe) throw new Error("Postgres durability probe is unavailable");
  return databaseProbe;
}

function requireRunId(response: Response): string {
  const runId = response.headers.get("x-workflow-run-id");
  if (!runId) throw new Error("Expected the chat route to return a run id");
  return runId;
}

async function expectStarted(response: Response): Promise<void> {
  if (response.status === 200) return;
  throw new Error(`Expected turn start 200, received ${response.status}: ${await response.text()}`);
}

function countStreamParts(stream: string, type: string): number {
  return stream.split(`"type":"${type}"`).length - 1;
}

function combinedServiceOutput(): string {
  return [stoppedServiceOutput, firstService?.output(), secondService?.output()]
    .filter(Boolean)
    .join("\n");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));
}
