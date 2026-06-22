# Assistant Turn

Read this when: you need the order of one stream-chat assistant turn.
Source of truth for: request-to-stream lifecycle and pre-start/post-start
failure meaning.
Not source of truth for: package ownership tables or provider adapter internals.

## Request Chain

```txt
browser form submit
-> ChatStreamRequest
-> HTTP adapter validation/auth
-> StreamChatInput
-> prepareStreamChatTurn (pre-start) + runTurnGeneration (post-start)
-> AiRuntimeRequest
-> RuntimeProviderRequest
-> AI SDK provider request
```

This chain is the pre-start half of the two-call flow: `POST /chat/runs` runs it
synchronously, then the service forks generation onto a server-owned fiber that a
client streams over `GET /chat/turns/:assistantTurnId/stream`. See
[Server-Owned Generation](#server-owned-generation) for the full model.

Browser requests do not carry raw system instructions, executor choices, or
provider-native options. They may carry a model preference learned from the
backend model catalog. Service composition resolves profile system prompt ids
into instructions, core validates profile/model/reasoning policy, renders final
runtime messages, and runtime receives one provider-neutral request.

## Turn Lifecycle

| Order | Stage                                                                                                                                                 | Owner                      | Failure behavior                                                      |
| ----: | ----------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------- | --------------------------------------------------------------------- |
|     1 | Validate HTTP method, auth, and request body.                                                                                                         | service route              | HTTP/request error                                                    |
|     2 | Prove workspace/project authority.                                                                                                                    | core                       | Pre-start rejection                                                   |
|     3 | Record request received.                                                                                                                              | core observability         | Pre-start rejection                                                   |
|     4 | Load and validate host capability manifest.                                                                                                           | core through port          | Pre-start rejection                                                   |
|     5 | Resolve profile, backend-validated model/reasoning, tools, executor id, instructions, commands, and approval policy.                                  | core policy                | Pre-start rejection                                                   |
|     6 | Run profile-selected turn guards before private context, persistence, or runtime tools.                                                               | core guard port            | Pre-start rejection                                                   |
|     7 | Ensure authorized conversation and append the user message.                                                                                           | core repository port       | Pre-start rejection                                                   |
|     8 | Start the assistant turn record.                                                                                                                      | core lifecycle port        | Pre-start rejection, with failed turn recording after this point      |
|     9 | Prepare context: same-conversation history, host context, tool context, and context manifest.                                                         | core context ports         | Pre-start rejection, with failed turn recording                       |
|    10 | Record stream started and emit `sidechat.started`.                                                                                                    | core/protocol              | Streaming has begun                                                   |
|    11 | Execute selected AgentExecutor through runtime.                                                                                                       | runtime                    | Post-start terminal `sidechat.error`                                  |
|    12 | Map RuntimeEvents to SidechatStreamEvents.                                                                                                            | core protocol mapper       | Post-start terminal `sidechat.error`                                  |
|    13 | Finalize terminal state, persist the assistant outcome, and optionally run core-owned post-success title generation through the neutral runtime port. | core protocol finalization | `sidechat.completed` or `sidechat.error`; title failures are observed |

## Extension Timing

- Turn guards run after policy selection and before conversation persistence,
  context gathering, or runtime tools.
- Conversation history is context-preparation work. It happens before
  `sidechat.started` and uses the policy-allowed conversation.
- Runtime executor selection is part of the turn policy decision. The model does
  not choose an executor.
- Model and reasoning selection is validated before persistence or runtime. The
  widget can request only ids from `/models`; core still fails closed if the
  provider, model, turn profile, or reasoning effort is not allowed.
- Runtime tools are exposed only after policy allows their names and runtime can
  resolve matching executable registrations.
- Conversation title generation runs only after successful assistant output for
  an untitled first exchange. The service owns the prompt config; core owns
  eligibility, no-tools runtime request shape, sanitization, write-once
  persistence, and failure isolation.

## Failure Split

| Phase     | Browser has seen `sidechat.started`? | Product behavior                                |
| --------- | ------------------------------------ | ----------------------------------------------- |
| Setup     | No                                   | Reject setup as request/core error.             |
| Streaming | Yes                                  | Emit exactly one terminal `sidechat.error`.     |
| Success   | Yes                                  | Emit exactly one terminal `sidechat.completed`. |

If an assistant turn record exists before the stream starts, core records the
failed turn and still rejects setup. This preserves durable state without
half-opening a browser stream.

Conversation title failures are observable side effects, not a second terminal
stream outcome.

## Server-Owned Generation

Stages 1-9 are pre-start (`prepareStreamChatTurn`); stages 10-13 are post-start
(the protocol event stream). The two are independently callable so the service
can run pre-start synchronously and then run post-start on a server-owned fiber
that is not tied to the browser connection.

`POST /chat/runs` runs pre-start synchronously and returns the turn identity as
JSON; a pre-start failure is the documented setup rejection. The service runner
then forks `runTurnGeneration` into its own scope, draining each post-start
`SidechatStreamEvent` to the durable event log. Finalization is owned by
`Effect.onExit`, so terminal ownership is exact across every exit:

- a normal terminal (`completed`/`error`/`blocked`) is emitted by the stream and
  appended by the drain, and finalize only writes the durable turn status;
- an abnormal exit appends one synthetic terminal `sidechat.error` at
  `maxSequence + 1`, guarded by the partial-unique terminal index so a turn can
  never have two terminals. Its code/status is classified honestly from the exit
  cause plus the durable cancel intent: an interrupt with cancel intent is
  `user_aborted` (`aborted`); an interrupt without cancel intent
  (shutdown/lease-fence) is `provider_failed` (`timeout`); any non-interrupt
  abnormal exit (defect, event-log append failure) is `provider_failed`. The
  durable status write rides the running-guard and is skipped once a real terminal
  already won, so there is exactly one status transition.

There is exactly one streaming path: `POST /chat/runs` starts a turn, then
`GET /chat/turns/:assistantTurnId/stream?after=<seq>` subscribes. The browser is
only a subscriber: the SSE response replays the durable log from `after` and
tails live events, and cancelling it unsubscribes the local subscriber without
interrupting the generation fiber. The response-owned `POST /chat/stream` path is
removed.

Generation is interruptible end to end: the runner forks without a browser abort
signal, and core ties an `AbortController` to the runtime stream so fiber
interruption (a cross-instance cancel or shutdown) aborts the in-flight provider
call, stopping generation and billing rather than only the socket.

## Live Subscription Transport

The durable `turn_events` log is the source of truth; Postgres `LISTEN/NOTIFY`
decides only *when* to read. Persistence (`@side-chat/db`) owns the one dedicated
`LISTEN` connection and surfaces a notification source. The service owns a
per-instance dispatcher that reads new rows on each notify and fans them out to
local subscribers, plus a per-subscriber safety reconcile-poll
(`resumability.safetyPollInterval`) as a missed-notify backstop. A reconnect or
cancel can land on any instance, so a subscriber may watch a turn generated by a
different instance — both read the same log.

Replay offset is one convention everywhere: `after=<lastSeenSequence>`, default
`-1`, returning `sequence > after`; `sidechat.started` is sequence 0.

## Retention and Replay Expiry

The durable `turn_events` log is bounded by retention so it cannot grow forever.
A per-instance background pruner (`@side-chat/db` `pruneTurnEventsBefore`) deletes
the event rows of terminal turns whose `completed_at` is older than
`resumability.turnEventRetention`, on the `resumability.prunerInterval` cadence and
bounded per pass. The consolidated turn record and the assistant message are never
pruned — only the now-redundant event log — so a pruned turn still resolves.

Because a pruned turn can no longer replay, the stream route fails closed before
opening SSE: when a turn is terminal and the smallest retained sequence is past the
requested `after + 1` (a gap, or the whole log gone), it returns the transport-level
`replay_expired` JSON error with HTTP 404. The widget maps that 404 to
`replay_expired`, reads `GET /chat/conversations/:id` for history, and clears the
run. A running turn never returns `replay_expired` — its tail still delivers events.

## Resumable Lifecycle Observability

The service records the resumable transport lifecycle through the same
`ObservabilitySinkPort` the core turn workflow uses (no separate metrics
framework): subscriber attach/detach with the live per-instance subscriber count,
replay served vs `replay_expired`, reaper reaps with count and reason, cross-instance
cancel with its outcome, and run duration on terminal. These are best-effort
telemetry — a sink failure never faults a subscriber stream, a reap, or a cancel.

## Cross-Instance Cancel

Cancel is durable intent plus interruption, never an in-fiber race.
`POST /chat/turns/:assistantTurnId/cancel` is workspace-scoped (the id is not a
bearer capability): `requestTurnCancellation` sets `cancel_requested_at` CAS-guarded
to running turns and `pg_notify`s a cancel channel in one transaction, so a cancel
of a finished, unknown, or cross-workspace turn is a no-op ack. Persistence
(`@side-chat/db`) owns the dedicated cancel `LISTEN` connection; the service cancel
dispatcher reacts to a notify by interrupting the local generation fiber when this
instance owns the turn (`FiberMap.remove`), and non-owning instances no-op. The
owning instance's abnormal finalize then sees the interrupt plus the durable intent
and terminalizes as `user_aborted`. A cancel with no live owner leaves only the
durable intent, which the reaper later terminalizes. The cancel route also
interrupts the local fiber directly, so a single-instance (and the notify-less
memory) deployment cancels without waiting on the listener.

## Owner Lease and Recovery

Generation runs under an owner lease so a crashed or stalled instance cannot
strand a turn `running` forever. All lease state is compare-and-set on
`assistant_turns` (`owner_instance_id`, `lease_epoch`, `lease_expires_at`), owned
by `@side-chat/db`; the durations, batch size, and the per-process `instanceId` are
config-driven through `resumability` (`leaseTtl`, `heartbeatInterval`,
`reaperInterval`, `reaperBatchLimit`). Retention/pruning adds `turnEventRetention`
and `prunerInterval` to the same section. No durations or limits are hardcoded.

- **Acquire + heartbeat.** Inside `runTurnGeneration`'s `onExit`, the fiber claims
  the lease (bumping the epoch) before the drain and then renews it every
  `heartbeatInterval`, epoch-scoped. Because the lease logic sits inside that
  `onExit`, even an interrupt during acquisition still finalizes the turn. If a
  renew matches no row the owner has been **fenced** (a new owner or the reaper
  advanced the epoch), so the heartbeat self-interrupts the generation; the
  abnormal finalize records a non-user `provider_failed`/`timeout`.
- **Reaper.** Each instance runs one background sweep every `reaperInterval` that
  CAS-terminalizes running turns whose lease expired — `user_aborted` when a cancel
  was requested, else `provider_failed` (`timeout`) — bumping the epoch to fence
  the dead/slow owner, and appends exactly one synthetic terminal per reaped turn
  (partial-unique-terminal guarded). The running-guard CAS plus that index mean two
  concurrent passes never double-terminalize.
- **Clean shutdown.** Composition exposes one `shutdown()` that interrupts the
  generation runner (each turn finalizes via its `onExit`) and then tears down the
  reaper sweep, the pruner sweep, and the two `LISTEN` dispatchers; the Node server
  runs it on SIGTERM/SIGINT so no timer or DB connection is left dangling.

## Files To Open

- `packages/partner-ai-core/src/application/stream-chat/turn/prepare-stream-chat-turn.ts`
- `packages/partner-ai-core/src/application/stream-chat/turn/turn-policy-plan.ts`
- `packages/partner-ai-core/src/application/stream-chat/protocol/protocol-event-stream.ts`
- `packages/partner-ai-core/src/application/stream-chat/protocol/protocol-stream-state-machine.ts`
- `packages/partner-ai-core/src/application/stream-chat/protocol/run-turn-generation.ts`
- `packages/partner-ai-core/src/application/stream-chat/protocol/lease/turn-lease-heartbeat.ts`
- `packages/partner-ai-core/src/application/stream-chat/protocol/finalization/protocol-terminal-lifecycle.ts`
- `packages/partner-ai-core/src/application/stream-chat/protocol/finalization/finalize-turn-generation.ts`
- `apps/partner-ai-service/src/inbound/turn-runner/turn-runner.ts`
- `apps/partner-ai-service/src/inbound/turn-runner/maintenance/turn-reaper.ts`
- `apps/partner-ai-service/src/inbound/turn-runner/maintenance/turn-pruner.ts`
- `apps/partner-ai-service/src/inbound/turn-stream/turn-observability.ts`
- `packages/db/src/repositories/postgres-drizzle/records/turn-lease.ts`
- `apps/partner-ai-service/src/inbound/turn-stream/turn-event-dispatcher.ts`
- `apps/partner-ai-service/src/inbound/turn-stream/turn-cancel-dispatcher.ts`
- `apps/partner-ai-service/src/inbound/turn-stream/turn-subscription-stream.ts`
- `apps/partner-ai-service/src/inbound/http/routes/chat/turns/chat-turns.ts`
- `packages/db/src/repositories/notifications/turn-event-notifications.ts`
- `packages/db/src/repositories/notifications/turn-cancel-notifications.ts`
- `packages/db/src/repositories/notifications/turn-activity-notifications.ts`
- `packages/partner-ai-core/src/application/stream-chat/README.md`
