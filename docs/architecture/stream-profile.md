# Side Chat stream profile (v7)

Read this when: consuming or producing the chat stream — the widget transport, the service scrub filter, or anything that inspects an outbound part.

Source of truth for: the public wire contract of the v7 service — protocol version, error vocabulary, `data-*` surface, and the transport/keepalive envelope.

Not source of truth for: the base stream grammar (AI SDK's UI message stream `v1`) or turn lifecycle order ([`assistant-turn.md`](./assistant-turn.md) once cut over). The old `sidechat.v1` custom protocol in `packages/chat-protocol` describes the legacy service and is deleted at cutover (Step 20).

## The contract

The public stream **is** AI SDK's UI message stream `v1`. Side Chat adds a deliberately narrow profile — safe errors, validated native message metadata for folded usage and assistant-activity duration, a `data-*` extension point, and a transport envelope — and nothing else. There is no custom event union, SSE codec, or engine-to-wire translator. The engine's stream is the protocol; one edge transform narrows it for privacy and safety.

Protocol version is pinned and both sides move together:

| Header                          | Value |
| ------------------------------- | ----- |
| `x-vercel-ai-ui-message-stream` | `v1`  |

The shared, browser-safe vocabulary — error codes, finish reasons, native reasoning efforts, and the `data-*` type surface — lives in [`packages/stream-profile`](../../packages/stream-profile/README.md) and is imported by both the service and the widget. Each provider model descriptor owns its supported reasoning efforts and default; `/api/models` publishes that per-model subset, and the widget renders only the selected model's advertised choices. Luna currently advertises `low`, `medium`, and `high`, displayed as Light, Medium, and High. The request carries the exact provider-neutral value as optional `reasoningEffort`; the service validates it against the selected model and resolves it into provider options inside the durable turn. Omission uses that model's configured default.

## Parts

Native parts own all content and lifecycle: `text-*`, `reasoning-*`, tool input/output/approval, `source-*`, `file`, `start`/`finish`/`abort`, and the step boundaries. The widget renders turn state from these plus HTTP status. Native `message-metadata` on `start`, `finish`, or `message-metadata` carries only validated `SideChatMessageMetadata`; provider metadata remains private and is scrubbed.

Browser-executed client tools use native dynamic tool parts. Their successful
`tool-output-available` payload is private model input, so the outbound scrub
replaces it with `{ status: "settled" }`; dynamic `tool-output-error` text is
collapsed to the safe `provider_failed` code. The pinned Workflow decoder can
drop dynamic identity and repeat a completed tool step on full replay, so the
replay edge restores that identity and removes only a repeated step with the
same tool-call id before the common scrub transform runs. That normalizer holds
at most the step opener while it identifies a repeated tool call; ordinary text
and reasoning continue before `finish-step` instead of being buffered to terminal.

### Finish semantics

The `finish` part's native `finishReason` carries the outcome, named by `SIDE_CHAT_FINISH_REASONS`: `stop`, `length` (output truncated), `content-filter` (**blocked**), `tool-calls`, `error`, or `other`. Side Chat introduces no separate "blocked" code — a content-filtered turn is a native `finish` with `finishReason: "content-filter"`, and the persisted turn records the same reason so history is distinguishable from a clean stop.

The engine's `createModelCallToUIChunkTransform` emits a bare `finish` chunk; the service re-attaches the reason and folded `messageMetadata.usage` from the run's terminal outcome at the one edge that holds both the stream and the terminal. A missing reason remains absent, while usage metadata is still emitted for the terminal.

### Native message metadata

`SideChatMessageMetadata` is the named native metadata extension. It contains folded turn usage (`inputTokens`, `outputTokens`, `totalTokens`, and optional reasoning/cache counts) plus optional `activityDurationMs`; every value is a finite non-negative safe integer. `activityDurationMs` is measured inside the durable workflow from immediately before `WorkflowAgent.stream` starts until a completed model stream settles. It therefore covers provider generation and any tool or approval suspension inside that assistant activity, but excludes pre-run admission/preparation and terminal persistence. This is the replay-safe source for the widget's completed `Thought for Ns` label; the widget rounds up to whole seconds with a one-second display minimum when a trace exists.

The dependency-free stream-profile schema rejects unknown/private fields. Live and replayed terminal chunks carry the same folded usage and activity duration. Completed assistant persistence replaces arbitrary metadata with that safe object; the history read edge omits legacy empty metadata and degrades invalid metadata before transport. The scrub edge validates every metadata-bearing stream chunk, and the widget validates both history and live messages with the same schema. Older messages may omit `activityDurationMs` and render the duration-free `Thought process` label.

### `data-*` parts

Baseline: **none.** Turn state derives from native parts, so no custom `data-*` part ships (ADR 0015). The extension point is `SideChatDataParts` in `packages/stream-profile`; adding a part requires a schema, a named consumer that cannot derive the concept from native parts, and a privacy review. Injection composes into the outbound transform chain, ordered relative to native parts.

## Errors

Every outbound `error` part carries a safe code as `errorText` and nothing else — raw provider, database, prompt, and tool text never reach the wire. The scrub filter collapses any in-stream error to the generic retryable `provider_failed`; the precise classification lives in the persisted terminal, not on the wire. Codes that arise before the stream opens (validation, auth, ownership, busy) are returned as an HTTP JSON error, not a stream part.

Retryability and safe messages are looked up from the code via `SIDE_CHAT_ERROR_VOCABULARY`. The table is the single source of truth; it is exhaustive by construction (a new code without an entry fails to compile).

| Code                   | Retryable | Safe meaning                                       |
| ---------------------- | --------- | -------------------------------------------------- |
| `bad_request`          | no        | The request is invalid.                            |
| `unauthorized`         | no        | Authentication is required.                        |
| `forbidden`            | no        | The caller may not perform this action.            |
| `not_found`            | no        | The requested resource is unavailable.             |
| `conflict`             | yes       | Current conversation state prevents the operation. |
| `rate_limited`         | yes       | Capacity or provider limits rejected the attempt.  |
| `aborted`              | no        | The user or system cancelled the turn.             |
| `timeout`              | yes       | A bounded operation exceeded its deadline.         |
| `provider_failed`      | yes       | The model provider failed safely.                  |
| `tool_failed`          | no        | A tool failed and cannot be retried automatically. |
| `persistence_failed`   | yes       | Durable state could not be written.                |
| `internal_error`       | yes       | An unexpected safe server failure occurred.        |
| `unsupported_protocol` | no        | Client and service stream versions do not match.   |

### Durable replay

`GET /api/chat/:runId/stream?startIndex=N` proves tenant ownership, then
returns replay plus live tail through the same finish-reason, scrub, SSE, and
keepalive chain as `POST /api/chat`. It returns both `x-workflow-run-id` and
`x-workflow-stream-tail-index`.

`startIndex` is an index in the public `UIMessageChunk` stream, not the raw
WorkflowAgent journal. Missing and `0` replay from the beginning; a negative
value is resolved once against the current UI tail and clamps to zero; exactly
`tail + 1` opens an empty live tail; anything greater returns `416` before SSE.
The service scans the bounded raw prefix to translate that cursor because the
pinned SDK's model-part-to-UI transform is not one-to-one. This preserves an
exact client contract at O(history) reconnect cost without inventing a second
durable stream or modifying WorkflowAgent internals.

Both the initial stream and every replay emit `start.messageId` as the stable
turn-scoped assistant id used by durable history. Reconnect therefore extends
one assistant projection; it never creates a second transient message identity.

## Terminal discipline

Exactly one terminal-class part (`finish`, `error`, or `abort`) reaches the client. The scrub filter drops and counts any second terminal chunk as defense in depth; the SDK should already guarantee this. Unknown chunk types are forwarded untouched and counted, never dropped, so a future native part is forward-compatible.

## Transport envelope

| Concern         | Contract                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Start a turn    | `POST /api/chat` — streams the response; returns `x-workflow-run-id`; optional `modelPreference`, `reasoningEffort`, and `enabledToolNames` may only narrow/select advertised policy.                                                                                                                                                                                                                                                                                                 |
| Cancel a turn   | `POST /api/chat/:runId/cancel` — auth/ownership first, then the durable user-cancel hook is recorded before the active step's Postgres-backed abort stream is woken. The direct wake is required because a same-run Workflow continuation is serialized behind its active provider step in the Postgres World; replay still records the authoritative cancelled outcome. The route absorbs the bounded hook-registration race, and the stream or snapshot remains terminal authority. |
| Auth            | `authorization` header, verified before any run, stream, or cancel.                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Request tracing | `x-request-id` (echoed if provided, generated otherwise).                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Keepalive       | An SSE comment frame (`: hb\n\n`) is emitted only after one idle interval, at the byte edge, transparent to chunk decoding. Core AI SDK has no heartbeat; idle-timeout proxies need this.                                                                                                                                                                                                                                                                                             |
