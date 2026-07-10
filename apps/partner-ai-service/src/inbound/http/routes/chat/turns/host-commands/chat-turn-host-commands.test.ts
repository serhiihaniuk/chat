import { SIDECHAT_PROTOCOL_VERSION, type ChatStreamRequest } from "@side-chat/chat-protocol";
import { createMemorySidechatRepositories, type MemorySidechatRepositories } from "@side-chat/db";
import { describe, expect, it } from "vitest";

import { createDevelopmentPartnerAiServiceApp, type PartnerAiServiceApp } from "../../../../app.js";
import {
  TEST_SAFETY_POLL_INTERVAL_MS,
  runTurnStream,
} from "#testing/turn-stream/turn-stream-harness.test-support";

const AUTH_HEADER = { authorization: "Bearer local-test-token" } as const;
const NOW = "2026-07-02T00:00:00.000Z";

const runRequest = (requestId: string): ChatStreamRequest => ({
  protocolVersion: SIDECHAT_PROTOCOL_VERSION,
  requestId,
  message: { id: `message_${requestId}`, content: "hello host commands" },
});

type Harness = {
  readonly app: PartnerAiServiceApp;
  readonly repositories: MemorySidechatRepositories;
};

const createApp = (repositories = createMemorySidechatRepositories()): Harness => ({
  repositories,
  app: createDevelopmentPartnerAiServiceApp({
    repositories,
    resumability: { safetyPollIntervalMs: TEST_SAFETY_POLL_INTERVAL_MS },
  }),
});

const seedEmittedCommand = (
  repositories: MemorySidechatRepositories,
  assistantTurnId: string,
  commandId: string,
) =>
  repositories.recordHostCommandResult({
    workspaceId: "workspace_local",
    assistantTurnId,
    commandId,
    commandType: "open_resource",
    status: "emitted",
    resultCode: "pending",
    commandRedactedJson: { target: "ticket-1" },
    now: NOW,
  });

const postResult = (app: PartnerAiServiceApp, path: string, body: unknown): Promise<Response> =>
  Promise.resolve(
    app.request(path, {
      method: "POST",
      headers: { ...AUTH_HEADER, "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );

describe("POST /chat/turns/:assistantTurnId/host-commands/:commandId/result relay", () => {
  it("persists the browser result against the emitted row and reports settled", async () => {
    const harness = createApp();
    const { assistantTurnId } = await runTurnStream(harness.app, runRequest("request_hc_1"));
    await seedEmittedCommand(harness.repositories, assistantTurnId, "cmd_1");

    const response = await postResult(
      harness.app,
      `/chat/turns/${assistantTurnId}/host-commands/cmd_1/result`,
      { status: "applied", resultCode: "opened", data: { ok: true } },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ settled: true });
    const storedResult = await harness.repositories.findHostCommandResult({
      workspaceId: "workspace_local",
      assistantTurnId,
      commandId: "cmd_1",
    });
    expect(storedResult).toMatchObject({
      status: "applied",
      resultCode: "opened",
      resultRedactedJson: { status: "applied", resultCode: "opened", data: { ok: true } },
    });
    expect(typeof storedResult?.resolvedAt).toBe("string");
  });

  it("rejects a commandId that was never emitted for the turn", async () => {
    const harness = createApp();
    const { assistantTurnId } = await runTurnStream(harness.app, runRequest("request_hc_2"));

    const response = await postResult(
      harness.app,
      `/chat/turns/${assistantTurnId}/host-commands/cmd_unknown/result`,
      { status: "applied", resultCode: "opened" },
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({ code: "not_found" });
  });

  it("never settles a command through a different turn in the same workspace", async () => {
    // The emitted row binds cmd_1 to turn A; posting the leaked commandId against
    // the caller's own (valid) turn B must not settle or overwrite anything.
    const harness = createApp();
    const turnA = await runTurnStream(harness.app, runRequest("request_hc_3a"));
    const turnB = await runTurnStream(harness.app, runRequest("request_hc_3b"));
    await seedEmittedCommand(harness.repositories, turnA.assistantTurnId, "cmd_1");

    const response = await postResult(
      harness.app,
      `/chat/turns/${turnB.assistantTurnId}/host-commands/cmd_1/result`,
      { status: "applied", resultCode: "forged" },
    );

    expect(response.status).toBe(404);
    await expect(
      harness.repositories.findHostCommandResult({
        workspaceId: "workspace_local",
        assistantTurnId: turnA.assistantTurnId,
        commandId: "cmd_1",
      }),
    ).resolves.toMatchObject({ status: "emitted" });
  });

  it("constrains an off-vocabulary browser status to failed", async () => {
    const harness = createApp();
    const { assistantTurnId } = await runTurnStream(harness.app, runRequest("request_hc_4"));
    await seedEmittedCommand(harness.repositories, assistantTurnId, "cmd_1");

    const response = await postResult(
      harness.app,
      `/chat/turns/${assistantTurnId}/host-commands/cmd_1/result`,
      { status: "emitted", resultCode: 42 },
    );

    expect(response.status).toBe(200);
    await expect(
      harness.repositories.findHostCommandResult({
        workspaceId: "workspace_local",
        assistantTurnId,
        commandId: "cmd_1",
      }),
    ).resolves.toMatchObject({ status: "failed", resultCode: "unknown" });
  });
});
