import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { decodeSseEvents, encodeSseEvent } from "./codec/sse-codec.js";
import {
  SIDECHAT_BLOCKED_REASONS,
  SIDECHAT_EVENT_TYPES,
  isTerminalEvent,
  type SidechatEventType,
  type SidechatStreamEvent,
} from "./events/event-union.js";
import { validateSidechatEventSequence } from "./ordering/sequence.js";
import { SIDECHAT_PROTOCOL_VERSION } from "./version.js";

/**
 * The protocol has several representations that must agree on the event set:
 * the TypeScript union, the hand-maintained schema JSON, the offline sequence
 * validator, and the SSE codecs. This suite is the completeness gate: adding an
 * event to the union without carrying every representation fails here (the
 * payload-validator table is already locked at compile time via
 * `satisfies Record<SidechatEventType, …>`).
 */

const base = (type: SidechatEventType, sequence: number) => ({
  protocolVersion: SIDECHAT_PROTOCOL_VERSION,
  type,
  eventId: `evt_${sequence}`,
  assistantTurnId: "assistant_turn_completeness",
  sequence,
  createdAt: "2026-07-03T00:00:00.000Z",
});

/** One valid fixture per event type — extend this map when the union grows. */
const EVENT_FIXTURES: Record<SidechatEventType, SidechatStreamEvent> = {
  [SIDECHAT_EVENT_TYPES.STARTED]: {
    ...base(SIDECHAT_EVENT_TYPES.STARTED, 0),
    type: SIDECHAT_EVENT_TYPES.STARTED,
    conversationId: "conversation_completeness",
  },
  [SIDECHAT_EVENT_TYPES.DELTA]: {
    ...base(SIDECHAT_EVENT_TYPES.DELTA, 1),
    type: SIDECHAT_EVENT_TYPES.DELTA,
    content: "hello",
  },
  [SIDECHAT_EVENT_TYPES.ACTIVITY]: {
    ...base(SIDECHAT_EVENT_TYPES.ACTIVITY, 2),
    type: SIDECHAT_EVENT_TYPES.ACTIVITY,
    activityId: "activity_completeness",
    activityKind: "tool",
    status: "completed",
    title: "Run completeness_check",
    details: {
      tool: { toolCallId: "call_1", toolName: "completeness_check", input: { q: "x" } },
    },
  },
  [SIDECHAT_EVENT_TYPES.COMPLETED]: {
    ...base(SIDECHAT_EVENT_TYPES.COMPLETED, 3),
    type: SIDECHAT_EVENT_TYPES.COMPLETED,
    finishReason: "stop",
    usage: { inputTokens: 1, outputTokens: 2, totalTokens: 3 },
  },
  [SIDECHAT_EVENT_TYPES.ERROR]: {
    ...base(SIDECHAT_EVENT_TYPES.ERROR, 4),
    type: SIDECHAT_EVENT_TYPES.ERROR,
    code: "provider_failed",
    message: "provider failed",
    retryable: true,
  },
  [SIDECHAT_EVENT_TYPES.BLOCKED]: {
    ...base(SIDECHAT_EVENT_TYPES.BLOCKED, 5),
    type: SIDECHAT_EVENT_TYPES.BLOCKED,
    reason: SIDECHAT_BLOCKED_REASONS.CONTENT_FILTER,
    publicMessage: "This request was blocked by a safety filter.",
  },
};

const eventTypes = Object.values(SIDECHAT_EVENT_TYPES);

type SchemaDef = {
  readonly properties?: Record<string, { readonly const?: string; readonly enum?: string[] }>;
};

const schema = JSON.parse(
  readFileSync(join(dirname(fileURLToPath(import.meta.url)), "../sidechat-v1.schema.json"), "utf8"),
) as {
  readonly $defs: Record<string, SchemaDef> & {
    readonly SidechatEventBase: SchemaDef;
    readonly SidechatStreamEvent: { readonly oneOf: readonly { readonly $ref: string }[] };
    readonly BlockedEvent: SchemaDef;
  };
};

describe("sidechat.v1 protocol completeness", () => {
  it("has a fixture for every event type (grows with the union by construction)", () => {
    // EVENT_FIXTURES is typed Record<SidechatEventType, …>, so a new union member
    // without a fixture fails to compile; this runtime check guards JS-level drift.
    expect(Object.keys(EVENT_FIXTURES).sort()).toEqual([...eventTypes].sort());
  });

  it("keeps the schema's base type enum identical to the TypeScript union", () => {
    const schemaTypes = schema.$defs.SidechatEventBase.properties?.["type"]?.enum ?? [];
    expect([...schemaTypes].sort()).toEqual([...eventTypes].sort());
  });

  it("declares one schema def per event type, each pinned by its type const", () => {
    const oneOfDefs = schema.$defs.SidechatStreamEvent.oneOf.map(
      (entry) => schema.$defs[entry.$ref.replace("#/$defs/", "")],
    );
    const pinnedTypes = oneOfDefs.map((def) => def?.properties?.["type"]?.const ?? "");
    expect([...pinnedTypes].sort()).toEqual([...eventTypes].sort());
  });

  it("keeps the schema's blocked reasons identical to the exported constants", () => {
    const schemaReasons = schema.$defs.BlockedEvent.properties?.["reason"]?.enum ?? [];
    expect([...schemaReasons].sort()).toEqual(Object.values(SIDECHAT_BLOCKED_REASONS).sort());
  });

  it("accepts every terminal member through the offline sequence validator", () => {
    const terminals = eventTypes
      .map((type) => EVENT_FIXTURES[type])
      .filter((event) => isTerminalEvent(event));
    expect(terminals.length).toBeGreaterThanOrEqual(3);

    for (const terminal of terminals) {
      const stream = [EVENT_FIXTURES[SIDECHAT_EVENT_TYPES.STARTED], terminal];
      expect(validateSidechatEventSequence(stream).terminalEvent).toEqual(terminal);
    }
  });

  it("round-trips every event type through the SSE codecs unchanged", () => {
    for (const type of eventTypes) {
      const fixture = EVENT_FIXTURES[type];
      expect(decodeSseEvents(encodeSseEvent(fixture))).toEqual([fixture]);
    }
  });
});
