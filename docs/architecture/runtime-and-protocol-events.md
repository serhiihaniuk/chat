# Runtime and Public Stream Events

Read this when: you need to understand what crosses the service/widget stream boundary.
Source of truth for: native AI SDK UI-message streaming, Side Chat profiling, replay cursors, and the separate activity stream.
Not source of truth for: turn order ([assistant-turn.md](assistant-turn.md)) or package ownership ([package-boundaries.md](package-boundaries.md)).

## One public chat stream

Side Chat exposes the native AI SDK 7 UI-message stream. The service does not translate provider output through a second internal event vocabulary or a custom chat envelope. AI SDK produces `UIMessageChunk` values; the service validates and scrubs them through `@side-chat/stream-profile`; the widget consumes the same profiled chunks through its AI SDK transport.

This boundary keeps provider-native objects private while retaining the standard AI SDK stream contract. Provider SDK values, Workflow journal records, database rows, prompts, and raw errors never cross it.

## Profiled chunk categories

The supported surface follows AI SDK UI-message chunks, including:

- message start and finish metadata;
- text and reasoning start, delta, and end parts;
- source URL and source document parts;
- file parts;
- server-tool and client-tool input/output state;
- approval requests and decisions;
- Side Chat `data-*` parts explicitly registered by `@side-chat/stream-profile`.

The stream-profile package owns the closed error vocabulary, finish-reason normalization, message metadata schema, terminal metadata, reasoning-effort values, and registered Side Chat data parts. Unknown or private shapes are rejected or removed at the service boundary; the widget does not infer provider-specific fields.

## Stream start and replay

`POST /api/chat` starts or reuses a turn and returns the run's UI-message stream. `GET /api/chat/:runId/stream?startIndex=N` resumes an owned run.

The public cursor is a zero-based emitted UI-chunk index, not a Workflow journal offset. The service scans the durable journal, counts only public chunks, replays chunks at or after `startIndex`, and tails the run. Internal Workflow records therefore do not create holes in the browser cursor.

Important transport rules:

- ownership is proven before any replay data is returned;
- malformed or out-of-range cursors fail with safe JSON errors;
- negative cursors resolve once as `tail + 1 + startIndex` against the current public UI tail and clamp to zero;
- simultaneous subscribers receive independent stream readers;
- keepalive frames maintain the HTTP connection but do not advance the UI-chunk cursor;
- reconnecting with the last confirmed public index is idempotent;
- the stream closes only after the Workflow journal reaches its terminal boundary or the request is aborted.

## Scrubbing and error mapping

The outbound scrubber allows only public UI-message structure and profile-owned metadata. It removes or replaces:

- provider identifiers and raw provider error objects;
- prompts, private context, and model request details;
- server and client tool implementation payloads not intended for UI display;
- raw client-tool capability secrets and internal authority records;
- Workflow storage and queue details;
- stack traces and database information.

Public errors use the closed vocabulary exported by `@side-chat/stream-profile`. HTTP setup failures remain JSON responses. Once streaming begins, terminal state is represented by the profiled message finish/error shape and later reconciled from the durable conversation snapshot.

Unknown chunk types fail closed at this same outbound privacy boundary. An unregistered `data-*`, `custom`, or future native chunk is dropped before SSE encoding, and the observer receives only its `type` so telemetry cannot capture private payloads.

## Message metadata

Message metadata is transport-safe and versioned by the stream profile. It may carry Side Chat-owned values such as usage, normalized finish reason, and terminal status. It must not carry provider response bodies, private policy decisions, raw tool results, or authorization data.

The durable conversation API returns validated UI messages using the same profile. That lets live projection and refreshed history share one browser representation without storing the HTTP byte stream itself.

## Separate activity stream

Cross-conversation activity is intentionally not part of the chat UI-message stream. The service exposes a small authenticated SSE feed for the current subject:

- `sidechat.turn-activity-sync` is the initial active-turn snapshot;
- `sidechat.turn-activity` is a later lifecycle transition.

Transition status is the closed stream-profile value set `running | terminal`.
The service emits only those values, and the widget rejects unknown status text
instead of interpreting it as a terminal transition.

Activity events contain only the identity and state required for conversation-list indicators. They do not contain assistant content, reasoning, prompts, tool payloads, or terminal error detail. PostgreSQL `LISTEN`/`NOTIFY` is a wake-up signal; the authoritative state remains in the product tables and is re-read after notification or reconnect.

## Ownership

| Concern                                   | Owner                                            |
| ----------------------------------------- | ------------------------------------------------ |
| Native chunk production                   | AI SDK execution inside `apps/side-chat-service` |
| Durable run journal                       | Workflow DevKit storage in the `workflow` schema |
| Public chunk profile and scrub vocabulary | `packages/stream-profile`                        |
| HTTP stream/replay translation            | `apps/side-chat-service/src/adapters/http/`      |
| Browser transport and projection          | `packages/side-chat-widget`                      |
| Activity state and notifications          | `packages/db` plus the service activity route    |

## Verification anchors

- `packages/stream-profile/src/stream-profile.test.ts`
- `apps/side-chat-service/src/adapters/http/` stream and route tests
- `packages/side-chat-widget/src/entities/workflow-chat/api/workflow-chat-transport.test.ts`
- `packages/side-chat-widget/src/features/workflow-chat/model/use-workflow-widget-chat.recovery.test.tsx`
