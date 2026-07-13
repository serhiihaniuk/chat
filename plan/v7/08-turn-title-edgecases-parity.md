# Step 08: Turn Completion — Title, Remaining Edge Cases, Parity Audit

Read this when: finishing the turn feature set and auditing it against the old app.

Source of truth for: title generation, the residual edge cases, and the behavior-parity checklist execution.

Not source of truth for: core turn flow (Step 05) or the scrub rules (Step 06).

Tracking: status and owner are maintained only in [`STATUS.md`](./STATUS.md).

Depends on: Steps 05, 06. Unblocks: Step 13 (widget can rely on complete turn semantics).

## Outcome

The turn feature is complete and audited: titles generate without ever blocking a turn, the residual edge cases are tested, and every intentional behavior difference from the old app is recorded rather than silently shipped.

## Old-app reference

- Title isolation: `packages/partner-ai-core/src/application/stream-chat/conversation-title/**` — title failure never blocks/fails turn finalization; runs once per conversation on first completion (verify the exact trigger rule and keep it).
- The parity source: the old app running with its fake config is the executable reference.

## Target design

### Title generation

A plain-text side call on the configured title model, bounded by `settings.timeouts.titleMs`, is triggered after the first completed turn. The dedicated idempotent `generateConversationTitle` workflow normalizes the first returned line to the existing 2–6 word contract, then conditionally updates only an empty title so replay and races cannot retitle. A schema-bearing `Output.object` must not cross WorkflowAgent's internal workflow-to-step boundary: schema objects contain constructors and functions that are not durable values. Failure logs safely and never touches turn status.

### Residual edge cases (each a test)

1. empty model response (finish, no text) → completed terminal; persist one assistant `UIMessage` with stable id and `parts: []`;
2. step-limit reached (`stopWhen`) → length semantics through the Step 06 mapping; turn completes;
3. the configured turn timeout expires → aborted-with-timeout terminal (verify the abort-path error naming keeps the engine from retrying the step — Step 02 engine finding);
4. title model failure/timeout → turn unaffected, safe log, no title;
5. title success → conversation title persisted once; a second turn does not retitle (per the verified rule);
6. reasoning-only response (reasoning parts, minimal text) → streams and persists correctly.

### Parity audit

Execute the checklist against both apps with equivalent scripted providers where practical; record every delta in the handoff and, where user-visible, in the Step 01 cut list:

streamed text + reasoning; exactly one terminal; durable cancel and reconnect semantics; pre-stream vs mid-stream provider failure; content filter → blocked; step limit → length; usage per turn; abort → calm cancelled; title behavior; no provider DTO or raw error on the wire. Expected deltas are recorded explicitly.

## Verification

```powershell
npm test -- apps/side-chat-service
npm run typecheck
npm run lint:custom
```

## Completion checklist

- [x] Title generation isolated, tested, trigger rule preserved.
- [x] All six residual edge cases tested.
- [x] Parity checklist executed; deltas recorded here and in the Step 01-owned feature cut list where user-visible.

## Handoff record

### Audit baseline

The 2026-07-11 audit compared the legacy executable contracts with the current
`apps/side-chat-service` wing before Step 08 implementation. The focused baseline
suite passed: 25 tests across the new route, scrub, workflow adapter, and finalizer
plus the legacy title and terminal-semantics tests.

```powershell
npm test -- apps/side-chat-service/src/adapters/http/chat/chat-routes.test.ts apps/side-chat-service/src/application/turn/stream/scrub-filter.test.ts apps/side-chat-service/src/composition/turn/workflow-turn-execution.test.ts apps/side-chat-service/src/application/turn/finalization/finalize-turn.test.ts packages/partner-ai-core/src/application/stream-chat/conversation-title/prepare-conversation-title.test.ts packages/agent-runtime/src/runtime/runtime-terminal-semantics.test.ts
```

The table separates proven parity, intentional native-protocol changes, and gaps
that Step 08 or its declared dependency must still close.

| Behavior                                      | Legacy executable contract                                                                                                               | New-wing evidence                                                                                                                                                                                                                                           | Audit result                                                                                                                                                            |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Streamed text and reasoning                   | Text becomes `sidechat.delta`; reasoning is normalized as activity.                                                                      | Scripted and workflow-outcome tests cover reasoning-only output; finalization persists the native assistant `UIMessage` parts rather than a text projection.                                                                                                | **Parity proven with native parts:** reasoning remains a first-class UI message part.                                                                                   |
| Exactly one terminal                          | Runtime and protocol state-machine tests reject a second terminal.                                                                       | `scrub-filter.test.ts` drops duplicate `finish` and treats `finish`, `error`, and `abort` as terminal; the happy route asserts one `finish`; terminal persistence is idempotent.                                                                            | **Parity proven.**                                                                                                                                                      |
| Durable cancel and reconnect                  | Cancel records `user_aborted`; a reconnecting subscriber replays one aborted terminal. Replay is owner-instance buffered and can expire. | The compiled compatibility suite proves durable provider abort. Step 07 adds tenant-hidden `GET /api/chat/:runId/stream?startIndex=N`, exact public-UI-cursor translation over the raw Workflow journal, terminal replay, and independent live subscribers. | **Parity proven with a stronger durable replay boundary.** Cursor translation scans the bounded raw prefix, so reconnect cost remains proportional to retained history. |
| Provider failure before output and mid-stream | A started turn ends with one safe protocol error; raw provider failures stay internal.                                                   | Compiled tests cover both positions inside an opened `200` SSE response; route and scrub tests reduce the terminal to one `error(provider_failed)`.                                                                                                         | **Parity proven with native framing:** “before output” is post-open SSE, while request/auth/admission failures remain pre-stream JSON.                                  |
| Content filter / blocked                      | A distinct `sidechat.blocked` terminal records `blocked` and does not persist filtered assistant output.                                 | Workflow mapping records `blocked`, retains native `finish(content-filter)` on the wire, and drops filtered assistant output before persistence.                                                                                                            | **Parity proven with an intentional native wire delta.**                                                                                                                |
| Step limit / length                           | The old tool-loop cap completes with `tool_step_limit`.                                                                                  | Workflow outcome and scripted-provider tests map the configured step cap to native `finish(length)` and a completed durable turn.                                                                                                                           | **Parity proven with an intentional vocabulary delta.**                                                                                                                 |
| Usage per turn                                | The old usage record keeps input, output, reasoning, cached-input, and total counts.                                                     | Workflow serialization, terminal folding, and PostgreSQL mapping preserve input, output, reasoning, cached-input, and total counts when the provider supplies them.                                                                                         | **Parity proven.**                                                                                                                                                      |
| Calm cancellation                             | Cancellation is an `error(aborted)` wire terminal even though the durable status is user-aborted.                                        | The new wire uses native `abort`; persistence uses `cancelled`; pre-output cancellation stores no assistant message and mid-stream partial content remains stream-only.                                                                                     | **Intentional improvement:** the widget should render a calm stopped state, not an error card.                                                                          |
| Conversation title                            | Only the initial exchange is eligible; the write is conditional; generation failure never changes the completed turn.                    | A dedicated WorkflowAgent job uses normalized plain text, configured model/timeout, initial-exchange eligibility, and a conditional write; run completion does not await title completion.                                                                  | **Parity proven.**                                                                                                                                                      |
| No provider DTO or raw error on the wire      | Provider DTOs stop at runtime mapping; public errors use stable codes.                                                                   | The scrub boundary has negative sentinels for raw `errorText` and `providerMetadata`; persisted assistant messages contain only product-owned UI parts. Unknown native/data chunks remain forward-compatible.                                               | **Parity proven at the outbound boundary.**                                                                                                                             |

### Title workflow/background-task evidence

Implemented in `apps/side-chat-service`:

- `generate-conversation-title.ts` checks the empty-title and initial-user-message rule before submitting work;
- the production workflow uses a dedicated `WorkflowAgent`, normalized plain-text output, `models.titleModelId`, and `timeouts.titleMs`, with no tools or non-serializable schema crossing;
- `run-turn.ts` starts enrichment only after terminal persistence and never awaits the model result;
- PostgreSQL title writes run inside the durable workflow before its result resolves; local in-memory development uses a process-local fallback because its state is process-local by definition;
- both persistence adapters treat only `NULL`/`undefined` as untitled and conditionally prepare the title, so replay, later turns, and racing writers cannot retitle;
- title rejection, model failure, timeout, and conditional-write loss emit content-free telemetry and never alter turn status.

### Completion evidence

- `npm test -- apps/side-chat-service`: 38 files passed, 134 tests passed, 1 file / 6 container-gated tests skipped after Step 07 integration and the durable-title repair.
- `npm run test:service:compatibility`: 9 compiled-service tests passed, including testing/production bundle separation.
- `npm run test:db:container`: 3 files and 23 tests passed against disposable PostgreSQL, including the service persistence adapter.
- focused title workflow/application suite: 2 files and 6 tests passed, including proof that persistent workflow completion waits for the title write.
- the service package typecheck, `npm run lint:custom`, `npx oxlint --deny-warnings apps/side-chat-service/src`, and `npm run format:check` passed.
- repository `npm run typecheck` remains blocked only by the Step 09-approved legacy `apps/partner-ai-service` database-contract cutover errors; no `apps/side-chat-service` diagnostic is present.

### Parity deltas

The deliberate user-visible deltas are native `abort` for calm cancellation,
native `finish(content-filter)` for blocked turns, native `finish(length)` for the
step cap, and Workflow run replay instead of the legacy owner-instance sequence
handshake. These are dispositions, not regressions; the safety and durability
invariants in the audit table still apply.

### New cuts discovered

The canonical Step 01 cut list is the
[ADR 0015 feature-disposition table](../../docs/adr/0015-native-ui-stream-tools-and-approval-profile.md#feature-disposition).
This audit added explicit dispositions for titles, content filtering,
cancellation, step-limit semantics, per-turn usage details, and native replay.
