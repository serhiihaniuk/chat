import { describe, expect, it } from "vitest";
import {
  parseSidechatStreamEvent,
  SIDECHAT_BLOCKED_REASONS,
  SIDECHAT_EVENT_TYPES,
  SIDECHAT_PROTOCOL_VERSION,
  type SidechatStreamEvent,
} from "@side-chat/chat-protocol";
import {
  advanceProtocolStream,
  createProtocolStreamState,
  isTerminalStatus,
  PROTOCOL_STREAM_STATUSES,
  type ProtocolStreamState,
} from "./protocol-stream-state-machine.js";

describe("protocol stream state machine", () => {
  it("starts idle and accepts sidechat.started once", () => {
    const idle = createProtocolStreamState();
    expect(idle.status).toBe(PROTOCOL_STREAM_STATUSES.IDLE);

    const started = expectAccept(idle, event(SIDECHAT_EVENT_TYPES.STARTED));
    expect(started.status).toBe(PROTOCOL_STREAM_STATUSES.STARTED);

    const second = advanceProtocolStream(started, event(SIDECHAT_EVENT_TYPES.STARTED));
    expect(second.ok).toBe(false);
  });

  it("rejects progress and terminal events before sidechat.started", () => {
    const idle = createProtocolStreamState();
    expect(advanceProtocolStream(idle, event(SIDECHAT_EVENT_TYPES.DELTA)).ok).toBe(false);
    expect(advanceProtocolStream(idle, completedEvent("stop")).ok).toBe(false);
  });

  it("moves through streaming and into each terminal status", () => {
    const streaming = streamingState();
    expect(streaming.status).toBe(PROTOCOL_STREAM_STATUSES.STREAMING);

    expect(expectAccept(streaming, completedEvent("stop")).status).toBe(
      PROTOCOL_STREAM_STATUSES.COMPLETED,
    );
    // An aborted completion gates as a normal completion; finishReason does not
    // create a separate terminal status.
    expect(expectAccept(streaming, completedEvent("aborted")).status).toBe(
      PROTOCOL_STREAM_STATUSES.COMPLETED,
    );
    expect(expectAccept(streaming, event(SIDECHAT_EVENT_TYPES.ERROR)).status).toBe(
      PROTOCOL_STREAM_STATUSES.FAILED,
    );
    expect(expectAccept(streaming, blockedEvent()).status).toBe(PROTOCOL_STREAM_STATUSES.BLOCKED);
  });

  it("rejects any event after a terminal status", () => {
    const completed = expectAccept(streamingState(), completedEvent("stop"));
    expect(isTerminalStatus(completed.status)).toBe(true);

    expect(advanceProtocolStream(completed, event(SIDECHAT_EVENT_TYPES.DELTA)).ok).toBe(false);
    expect(advanceProtocolStream(completed, event(SIDECHAT_EVENT_TYPES.ERROR)).ok).toBe(false);
    expect(advanceProtocolStream(completed, completedEvent("stop")).ok).toBe(false);
  });

  it("rejects a second terminal event after failure", () => {
    const failed = expectAccept(streamingState(), event(SIDECHAT_EVENT_TYPES.ERROR));
    expect(advanceProtocolStream(failed, completedEvent("stop")).ok).toBe(false);
  });
});

const streamingState = (): ProtocolStreamState => {
  const started = expectAccept(createProtocolStreamState(), event(SIDECHAT_EVENT_TYPES.STARTED));
  return expectAccept(started, event(SIDECHAT_EVENT_TYPES.DELTA));
};

const expectAccept = (
  state: ProtocolStreamState,
  next: SidechatStreamEvent,
): ProtocolStreamState => {
  const transition = advanceProtocolStream(state, next);
  if (!transition.ok) throw new Error(`expected accepted transition, got: ${transition.reason}`);
  return transition.state;
};

const base = {
  protocolVersion: SIDECHAT_PROTOCOL_VERSION,
  eventId: "event_001",
  assistantTurnId: "turn_001",
  sequence: 0,
  createdAt: "2026-06-17T00:00:00.000Z",
};

const event = (type: SidechatStreamEvent["type"]): SidechatStreamEvent => {
  if (type === SIDECHAT_EVENT_TYPES.STARTED) return parseSidechatStreamEvent({ ...base, type });
  if (type === SIDECHAT_EVENT_TYPES.DELTA) {
    return parseSidechatStreamEvent({ ...base, type, content: "hello" });
  }
  if (type === SIDECHAT_EVENT_TYPES.ERROR) {
    return parseSidechatStreamEvent({
      ...base,
      type,
      code: "internal_error",
      message: "boom",
      retryable: false,
    });
  }
  throw new Error(`unsupported test event type ${type}`);
};

const completedEvent = (finishReason: "stop" | "aborted"): SidechatStreamEvent =>
  parseSidechatStreamEvent({ ...base, type: SIDECHAT_EVENT_TYPES.COMPLETED, finishReason });

const blockedEvent = (): SidechatStreamEvent =>
  parseSidechatStreamEvent({
    ...base,
    type: SIDECHAT_EVENT_TYPES.BLOCKED,
    reason: SIDECHAT_BLOCKED_REASONS.CONTENT_FILTER,
    publicMessage: "blocked",
  });
