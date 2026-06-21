import type { TurnEventLogPort } from "@side-chat/partner-ai-core";
import { parseSidechatStreamEvent, type SidechatStreamEvent } from "@side-chat/chat-protocol";
import { toJsonObject } from "@side-chat/shared";
import { Effect } from "effect";
import type { SidechatRepositories, TurnEventRecord, TurnEventType } from "@side-chat/db";

/**
 * Adapt the durable turn-event repository to the core `TurnEventLogPort`.
 *
 * Source is `SidechatRepositories` (the Postgres/memory append+notify writer from
 * Step 1); target is the provider-neutral port core appends each emitted
 * `SidechatStreamEvent` to. The `sidechat.` transport prefix is dropped here so
 * the `db` package keeps storing the protocol-free `type` it checks and indexes
 * on, while the full event lives in `payloadJson`.
 *
 * The append delegates idempotency, payload-conflict detection, and the
 * one-terminal partial-unique guard to the repository; this adapter only crosses
 * the protocol/persistence boundary.
 */
export const createServiceTurnEventLog = (
  repositories: SidechatRepositories,
): TurnEventLogPort => ({
  appendEvent: ({ authContext, assistantTurnId, event }) =>
    fromRepository(() =>
      repositories.appendTurnEvent({
        workspaceId: authContext.workspaceId,
        assistantTurnId,
        sequence: event.sequence,
        type: toTurnEventType(event),
        payloadJson: toJsonObject(event),
        now: event.createdAt,
      }),
    ).pipe(Effect.asVoid),
  readEventsAfter: ({ authContext, assistantTurnId, after }) =>
    fromRepository(() =>
      repositories.readTurnEventsAfter({
        workspaceId: authContext.workspaceId,
        assistantTurnId,
        after,
      }),
    ).pipe(Effect.map(toStreamEvents)),
  maxSequence: ({ authContext, assistantTurnId }) =>
    fromRepository(() =>
      repositories.maxTurnEventSequence({
        workspaceId: authContext.workspaceId,
        assistantTurnId,
      }),
    ),
});

/**
 * Lift a deferred repository call into the port's `unknown`-error Effect channel.
 *
 * The thunk keeps the call lazy so the write fires when the Effect runs, not when
 * it is built. The repository already throws typed `DbRepositoryError`s
 * (idempotency conflict, one-terminal conflict, missing turn); core maps those to
 * its own failure codes, so this boundary only keeps the thrown value intact.
 */
const fromRepository = <A>(operation: () => Promise<A>): Effect.Effect<A, unknown> =>
  Effect.tryPromise({ try: operation, catch: (error) => error });

const toStreamEvents = (records: readonly TurnEventRecord[]): readonly SidechatStreamEvent[] =>
  records.map(toStreamEvent);

const TURN_EVENT_TYPE_PREFIX = "sidechat.";

/**
 * Derive the persisted turn-event `type` from the stream event type.
 *
 * Every `sidechat.v1` event type is the persisted type with the transport
 * prefix (`sidechat.completed` -> `completed`), so stripping it yields the
 * column value the persistence contract checks and indexes on.
 */
const toTurnEventType = (event: SidechatStreamEvent): TurnEventType =>
  event.type.slice(TURN_EVENT_TYPE_PREFIX.length) as TurnEventType;

// Source is the protocol-free `JsonObject` payload `db` stored; target is the
// typed `SidechatStreamEvent` core consumes. The stored row is the exact event
// core appended, so decoding it back through the protocol parser rehydrates the
// branded discriminated union without a blind cast and fails closed if a durable
// row was ever corrupted past the persistence boundary.
const toStreamEvent = (record: TurnEventRecord): SidechatStreamEvent =>
  parseSidechatStreamEvent(record.payloadJson);
