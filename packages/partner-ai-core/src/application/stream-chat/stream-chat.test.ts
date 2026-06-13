import {
  PROTOCOL_ERROR_CODES,
  SIDECHAT_EVENT_TYPES,
  validateSidechatEventSequence,
} from "@side-chat/chat-protocol";
import { describe, expect, it } from "vitest";
import { AUTHORITY_DENIAL_CODES } from "#domain/authority";
import { RUNTIME_ERROR_CODES, RUNTIME_EVENT_TYPES, RUNTIME_FINISH_REASONS } from "#ports";
import { denyRequestPolicy, POLICY_DENIAL_CODES } from "#policies/policy";
import { authContext, input } from "#testing/stream-chat/fixtures.test-support";
import {
  collect,
  createFakePorts,
  isTerminalEvent,
  runStreamChat,
} from "#testing/stream-chat/fake-ports.test-support";

describe("stream chat use case", () => {
  it("streams valid sidechat.v1 events through Effect services", async () => {
    const ports = createFakePorts({ authContext });

    const events = await collect(runStreamChat(input, ports));

    expect(events.map((event) => event.type)).toEqual([
      SIDECHAT_EVENT_TYPES.STARTED,
      SIDECHAT_EVENT_TYPES.ACTIVITY,
      SIDECHAT_EVENT_TYPES.DELTA,
      SIDECHAT_EVENT_TYPES.COMPLETED,
    ]);
    expect(events.map((event) => event.sequence)).toEqual([0, 1, 2, 3]);
    expect(validateSidechatEventSequence(events).terminalEvent.type).toBe(
      SIDECHAT_EVENT_TYPES.COMPLETED,
    );
    expect(events.filter(isTerminalEvent)).toHaveLength(1);
    expect(ports.calls).toEqual([
      "hostCapabilities",
      "turnPolicy",
      "policy",
      "ensureConversation",
      "appendUserMessage",
      "startAssistantTurn",
      "contextManager",
      "recordContextSnapshot",
      "runtime",
      "completeAssistantTurn",
    ]);
  });

  it("passes resolved profile, prepared context, explicit tool allowlist, and abort signal to runtime", async () => {
    const ports = createFakePorts({ authContext });
    const abortController = new AbortController();

    await collect(runStreamChat({ ...input, abortSignal: abortController.signal }, ports));

    expect(ports.runtimeRequests[0]).toMatchObject({
      requestId: "request_001",
      assistantTurnId: "assistant_turn_001",
      providerId: "fake",
      modelId: "fake-echo",
      profileId: "analyst",
      availableToolNames: ["mock_web_search"],
      messages: [{ role: "user", content: "hello" }],
      contextBoard: {
        manifest: {
          profileId: "analyst",
          profileVersion: "2026-06-13",
        },
      },
    });
    expect(ports.runtimeRequests[0]?.abortSignal).toBe(abortController.signal);
  });

  it("requires normalized AuthContext before protected work", async () => {
    const ports = createFakePorts();

    await expect(
      collect(runStreamChat({ ...input, authContext: undefined }, ports)),
    ).rejects.toMatchObject({
      code: AUTHORITY_DENIAL_CODES.MISSING_AUTH,
      protocolCode: PROTOCOL_ERROR_CODES.UNAUTHORIZED,
    });
    expect(ports.calls).toEqual([]);
  });

  it("maps policy denials before persistence or model work", async () => {
    const ports = createFakePorts({
      authContext,
      policies: denyRequestPolicy({
        allowed: false,
        check: "rate_limit",
        code: POLICY_DENIAL_CODES.RATE_LIMIT_EXCEEDED,
        protocolCode: PROTOCOL_ERROR_CODES.RATE_LIMITED,
        message: "Rate limit exceeded for this workspace.",
        retryable: true,
      }),
    });

    await expect(collect(runStreamChat(input, ports))).rejects.toMatchObject({
      code: POLICY_DENIAL_CODES.RATE_LIMIT_EXCEEDED,
      protocolCode: PROTOCOL_ERROR_CODES.RATE_LIMITED,
      retryable: true,
    });
    expect(ports.calls).toEqual(["hostCapabilities", "turnPolicy", "policy"]);
  });

  it("denies cross-tenant access before persistence or model work", async () => {
    const ports = createFakePorts({ authContext });

    await expect(
      collect(
        runStreamChat(
          { ...input, workspace: { tenantId: "tenant_002", workspaceId: "workspace_001" } },
          ports,
        ),
      ),
    ).rejects.toMatchObject({
      code: AUTHORITY_DENIAL_CODES.CROSS_TENANT_WORKSPACE,
      protocolCode: PROTOCOL_ERROR_CODES.FORBIDDEN,
    });
    expect(ports.calls).toEqual([]);
  });

  it("allocates contiguous protocol sequences when runtime lifecycle events are dropped", async () => {
    const ports = createFakePorts({
      authContext,
      runtimeEvents: [
        {
          type: RUNTIME_EVENT_TYPES.STARTED,
          requestId: "request_001",
          assistantTurnId: "assistant_turn_001",
          sequence: 0,
          providerId: "fake",
          modelId: "fake-echo",
        },
        {
          type: RUNTIME_EVENT_TYPES.OUTPUT_DELTA,
          requestId: "request_001",
          assistantTurnId: "assistant_turn_001",
          sequence: 1,
          content: "Hello",
        },
        {
          type: RUNTIME_EVENT_TYPES.COMPLETED,
          requestId: "request_001",
          assistantTurnId: "assistant_turn_001",
          sequence: 2,
          finishReason: RUNTIME_FINISH_REASONS.STOP,
        },
      ],
    });

    const events = await collect(runStreamChat(input, ports));

    expect(events.map((event) => event.type)).toEqual([
      SIDECHAT_EVENT_TYPES.STARTED,
      SIDECHAT_EVENT_TYPES.DELTA,
      SIDECHAT_EVENT_TYPES.COMPLETED,
    ]);
    expect(events.map((event) => event.sequence)).toEqual([0, 1, 2]);
  });

  it("maps runtime failures to a stable terminal protocol error", async () => {
    const ports = createFakePorts({
      authContext,
      runtimeEvents: [
        {
          type: RUNTIME_EVENT_TYPES.ERROR,
          requestId: "request_001",
          assistantTurnId: "assistant_turn_001",
          sequence: 0,
          code: RUNTIME_ERROR_CODES.TIMEOUT,
          message: "provider timed out",
          retryable: true,
        },
      ],
    });

    const events = await collect(runStreamChat(input, ports));

    expect(events.at(-1)).toMatchObject({
      type: SIDECHAT_EVENT_TYPES.ERROR,
      code: PROTOCOL_ERROR_CODES.TIMEOUT,
      retryable: true,
    });
    expect(events.filter(isTerminalEvent)).toHaveLength(1);
    expect(ports.failedTurns[0]).toMatchObject({
      status: "timed_out",
      errorCode: PROTOCOL_ERROR_CODES.TIMEOUT,
    });
  });

  it("marks aborted runtime terminals as user-aborted turns", async () => {
    const ports = createFakePorts({
      authContext,
      runtimeEvents: [
        {
          type: RUNTIME_EVENT_TYPES.ERROR,
          requestId: "request_001",
          assistantTurnId: "assistant_turn_001",
          sequence: 0,
          code: RUNTIME_ERROR_CODES.ABORTED,
          message: "request aborted",
          retryable: false,
        },
      ],
    });

    const events = await collect(runStreamChat(input, ports));

    expect(events.at(-1)).toMatchObject({
      type: SIDECHAT_EVENT_TYPES.ERROR,
      code: PROTOCOL_ERROR_CODES.ABORTED,
      retryable: false,
    });
    expect(ports.failedTurns[0]).toMatchObject({
      status: "user_aborted",
      errorCode: PROTOCOL_ERROR_CODES.ABORTED,
    });
  });
});
