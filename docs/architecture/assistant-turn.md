# Assistant Turn

Read this when: you need the order, durability, recovery, or failure rules of one assistant turn.
Source of truth for: admission, durable Workflow execution, replay, cancellation, and terminal projection.
Not source of truth for: package ownership ([system-map.md](system-map.md)) or public stream details ([runtime-and-protocol-events.md](runtime-and-protocol-events.md)).

## Core invariants

- Authentication and tenant, workspace, subject, and conversation ownership checks happen before execution.
- Model, reasoning, tool, and host-context policy is resolved before admission or durable mutation.
- A new turn acquires per-process admission before writing the user message or turn row.
- Workflow DevKit owns durable execution and the replayable journal. PostgreSQL owns the durable product snapshot.
- An exact `requestId` replay reuses the existing turn and Workflow run. It does not reserve capacity or start another run.
- Every admitted turn reaches one durable terminal state: `completed`, `blocked`, `failed`, or `cancelled`. Provider timeout is a `failed` turn with the safe error code `provider_timeout`; `timed_out` is the turn telemetry outcome label, not a turn status.
- Raw client-tool capability secrets remain in the originating browser tab. Only their digest enters durable execution.
- Provider errors, prompts, private context, tool payloads, and capability secrets never become public error detail.

## HTTP surface

| Request                                          | Purpose                                                                                  |
| ------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| `POST /api/chat`                                 | Validate, admit, start or reuse a turn, then return its native AI SDK UI-message stream. |
| `GET /api/chat/:runId/stream?startIndex=N`       | Prove ownership, replay from the public chunk cursor, and tail the same Workflow run.    |
| `POST /api/chat/:runId/cancel`                   | Record cancellation intent and resume the run's durable abort hook.                      |
| `POST /api/chat/:runId/tools/:toolCallId/output` | Authorize and submit an originating-tab client-tool result.                              |
| `POST /api/chat/:runId/approvals/:approvalId`    | Submit a durable server-tool approval decision.                                          |

Conversation history, model and capability catalogs, and activity routes are described in [system-map.md](system-map.md).

## New-turn lifecycle

1. **Authenticate and validate.** The route validates the bearer identity, JSON body, tenant/workspace/conversation scope, and request identifiers.
2. **Resolve policy.** Application policy selects the configured model, reasoning effort, enabled server and client tools, host-context limits, and execution settings. Unsupported choices fail without durable residue.
3. **Preflight the request.** `assertCanBegin` proves conversation authority and detects an exact request replay before capacity is reserved.
4. **Acquire admission.** A per-process FIFO gate reserves one service slot. A full or expired queue returns `503` with `Retry-After: 5` before any durable turn write.
5. **Begin the product turn.** One transaction appends the accepted user message and creates the open turn row under the request idempotency key.
6. **Start and bind Workflow.** The service starts the chat Workflow and binds its `runId` to the product turn. Workflow input contains only validated, durable-safe values.
7. **Claim provider execution.** The Workflow claim gate reconciles cancellation and terminal state before the first provider call, preventing stale or already-terminal work from spending provider capacity.
8. **Run the agent loop.** AI SDK 7 streams native UI chunks while server tools execute in the service and client tools or approvals suspend on durable Workflow hooks.
9. **Publish the journal.** Workflow stores the execution journal. The service exposes a scrubbed, cursor-addressable UI-message projection to each subscriber.
10. **Finalize atomically.** The service folds provider terminal metadata together with the closed visible journal, then transactionally writes the optional assistant message, terminal turn row, conversation timestamp, and identity-only activity notification.
11. **Release admission.** The route terminal handle releases the per-process reservation exactly once after terminal projection. Workflow separately owns durable queue and worker-slot lifecycle while the run is suspended.

The accepted user message remains the product-history value. Optional host context is rendered only into the execution copy of the latest user message, under explicit size/depth limits and as untrusted page reference—not as identity, authority, or system instructions.

## Exact replay and reconnect

`requestId` is the turn idempotency key. Preflight resolves an existing request before admission:

- A bound run is reused; the route returns or resumes that run's stream.
- No second user message, turn row, admission reservation, Workflow run, or provider call is created.
- A turn whose product row exists but whose run binding is not yet visible returns `409` with `Retry-After: 1`; callers retry the same request id.
- `GET /api/chat/:runId/stream?startIndex=N` translates the public UI-chunk index over the Workflow journal, replays the suffix, and then tails the same run. Multiple subscribers receive independent readers.

The widget stores only a validated active-turn cursor and reconciles it against the authoritative conversation snapshot. Product status `open` alone is not proof of live execution: the snapshot exposes an active `runId` only while Workflow reports the run as pending or running.

## Terminal projection

The durable Workflow outcome race owns terminal status and the safe error code, including cancellation and provider timeout. Provider output contributes finish reason and usage when available. The closed Workflow journal owns visible assistant text and reasoning because it is the exact content subscribers saw. Finalization uses the provider aggregate only as a fallback when the journal has no visible deltas.

| Outcome                     | Durable result                                                                                                      |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Normal completion           | Assistant projection, usage, finish reason, and `completed` turn state commit together.                             |
| Content-filtered completion | Visible safe projection, usage, finish reason, and `blocked` turn state commit together.                            |
| Provider or service failure | Safe terminal metadata and `failed` state commit; private cause remains server-side.                                |
| User cancellation           | Durable cancel intent aborts provider work or a suspended hook; final state is `cancelled`.                         |
| Provider timeout            | The durable timeout path aborts execution and commits `failed` with safe error code `provider_timeout`.             |
| Process crash               | Workflow recovers execution; admission-time reconciliation repairs stale product projection before new work begins. |

The post-commit notification contains identity and lifecycle information only. The widget keeps the live session in `settling` until the refreshed conversation snapshot contains the committed terminal projection, preventing a completed answer from disappearing between stream close and history refresh.

## Cancellation and suspended work

Cancellation is durable intent, not a socket interruption. The cancel route proves ownership, records intent, and signals the Workflow abort hook. The running provider call observes the abort signal; client-tool and approval waits race the same durable abort path. Repeated cancel requests are idempotent.

Client-tool output and approval decisions are accepted only while their durable wait is active and owned by the authenticated subject. Late, duplicate, cross-tenant, or mismatched submissions fail closed and cannot reopen a terminal run.

## Maintenance and recovery

Workflow journal maintenance is a boot-and-interval service lifecycle. It validates the pinned Workflow schema and prunes only eligible terminal journals, skipping active runs and legal holds. Product terminal reconciliation is documented in [turn-terminal-reconciliation.md](turn-terminal-reconciliation.md); Workflow storage ownership is documented in [workflow-substrate.md](workflow-substrate.md).

## Primary implementation anchors

- `apps/side-chat-service/src/adapters/http/` — authenticated routes, stream transport, and public error mapping.
- `apps/side-chat-service/src/application/turn/` — policy, admission orchestration, execution, and terminal reconciliation.
- `apps/side-chat-service/src/workflows/` — durable chat execution, claim, timeout, tools, approvals, and abort waits.
- `packages/db/src/` — product repositories, notifications, and Workflow journal maintenance adapters.
- `packages/side-chat-widget/src/features/workflow-chat/` — live session, replay, terminal projection, and recovery behavior.

## Related decisions

- [ADR 0008 — Workflow DevKit as durable execution substrate](../adr/0008-workflow-durable-execution-substrate.md)
- [ADR 0009 — native conversation reconciliation](../adr/0009-native-conversation-reconciliation.md)
- [ADR 0010 — terminal projection reconciliation](../adr/0010-terminal-projection-reconciliation.md)
