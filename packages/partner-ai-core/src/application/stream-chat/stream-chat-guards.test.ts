import { PROTOCOL_ERROR_CODES, SIDECHAT_EVENT_TYPES } from "@side-chat/chat-protocol";
import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import { PARTNER_AI_CORE_ERROR_CODES } from "#errors";
import type { TurnGuard, TurnGuardInput } from "#ports";
import {
  authContext,
  createManifest,
  input,
  resolveTestProfile,
} from "#testing/stream-chat/fixtures.test-support";
import {
  collect,
  createFakePorts,
  runStreamChat,
} from "#testing/stream-chat/fake-ports.test-support";

describe("stream chat turn guards", () => {
  it("runs allow turn guards before persistence, context, or runtime work", async () => {
    const guardInputs: TurnGuardInput[] = [];
    const guard = createTurnGuard((guardInput) => {
      guardInputs.push(guardInput);
      return Effect.succeed({ kind: "allow" });
    });
    const ports = createFakePorts({
      authContext,
      manifest: createGuardedManifest(guard.guardId),
      turnGuards: { guards: [guard] },
    });

    await collect(runStreamChat(input, ports));

    expect(guardInputs[0]).toMatchObject({
      requestId: "request_001",
      userMessage: "hello",
      hostAppId: "host_app_001",
      profileId: "analyst",
      safetyPolicyId: "standard",
    });
    expect(guardInputs[0]).not.toHaveProperty("contextBoard");
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

  it("does not run registered guards that the profile did not select", async () => {
    const guardInputs: TurnGuardInput[] = [];
    const guard = createTurnGuard((guardInput) => {
      guardInputs.push(guardInput);
      return Effect.succeed({ kind: "allow" });
    });
    const ports = createFakePorts({ authContext, turnGuards: { guards: [guard] } });

    await collect(runStreamChat(input, ports));

    expect(guardInputs).toEqual([]);
    expect(ports.runtimeRequests).toHaveLength(1);
  });

  it("fails closed when a selected turn guard is not registered", async () => {
    const ports = createFakePorts({
      authContext,
      manifest: createGuardedManifest("missing.guard"),
      turnGuards: { guards: [] },
    });

    await expect(collect(runStreamChat(input, ports))).rejects.toMatchObject({
      code: PARTNER_AI_CORE_ERROR_CODES.RUNTIME_FAILED,
      protocolCode: PROTOCOL_ERROR_CODES.INTERNAL_ERROR,
      message: expect.stringContaining("missing.guard"),
    });
    expect(ports.calls).toEqual(["hostCapabilities", "turnPolicy", "policy"]);
  });

  it("blocks guarded turns before persistence, context, or runtime work", async () => {
    const guardInputs: TurnGuardInput[] = [];
    const guard = createTurnGuard((guardInput) => {
      guardInputs.push(guardInput);
      return Effect.succeed({
        kind: "block",
        publicReason: "I cannot help with that request.",
        internalReason: "prompt injection attempt",
        errorCode: PROTOCOL_ERROR_CODES.FORBIDDEN,
      });
    });
    const ports = createFakePorts({
      authContext,
      manifest: createGuardedManifest(guard.guardId),
      turnGuards: { guards: [guard] },
    });

    await expect(collect(runStreamChat(input, ports))).rejects.toMatchObject({
      code: PARTNER_AI_CORE_ERROR_CODES.TURN_GUARD_BLOCKED,
      protocolCode: PROTOCOL_ERROR_CODES.FORBIDDEN,
      message: "I cannot help with that request.",
    });
    expect(guardInputs).toHaveLength(1);
    expect(ports.calls).toEqual(["hostCapabilities", "turnPolicy", "policy"]);
  });

  it("continues guarded turns with warnings", async () => {
    const guard = createTurnGuard(() =>
      Effect.succeed({
        kind: "allow_with_warning",
        warning: "Prompt looked unusual but stayed inside policy.",
      }),
    );
    const ports = createFakePorts({
      authContext,
      manifest: createGuardedManifest(guard.guardId),
      turnGuards: { guards: [guard] },
    });

    const events = await collect(runStreamChat(input, ports));

    expect(events.at(-1)).toMatchObject({ type: SIDECHAT_EVENT_TYPES.COMPLETED });
    expect(ports.runtimeRequests).toHaveLength(1);
  });

  it("maps guard failures before persistence, context, or runtime work", async () => {
    const guard = createTurnGuard(() => Effect.fail(new Error("classifier unavailable")));
    const ports = createFakePorts({
      authContext,
      manifest: createGuardedManifest(guard.guardId),
      turnGuards: { guards: [guard] },
    });

    await expect(collect(runStreamChat(input, ports))).rejects.toMatchObject({
      code: PARTNER_AI_CORE_ERROR_CODES.RUNTIME_FAILED,
      protocolCode: PROTOCOL_ERROR_CODES.INTERNAL_ERROR,
      message: "classifier unavailable",
    });
    expect(ports.calls).toEqual(["hostCapabilities", "turnPolicy", "policy"]);
  });
});

const createTurnGuard = (check: TurnGuard["check"]): TurnGuard => ({
  guardId: "test.guard",
  description: "Deterministic test turn guard.",
  check,
});

const createGuardedManifest = (...turnGuardIds: readonly string[]) => {
  const manifest = createManifest();
  const profile = resolveTestProfile(manifest);

  return {
    ...manifest,
    assistantProfiles: [
      {
        ...profile,
        safetyPolicy: { ...profile.safetyPolicy, turnGuardIds },
      },
    ],
  };
};
