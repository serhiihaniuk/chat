# AI SDK 7 Rewrite Status Board

Read this when: choosing work, resuming a step, or reporting program status.

Source of truth for: milestone state, ownership, the execution-substrate verdict, and evidence links.

## State vocabulary

`not_started` · `in_progress` (one owner) · `in_review` · `blocked` (named blocker) · `complete` (exit criteria and evidence recorded).

If a milestone is too large, split it before implementation, add suffix files/rows, and update dependencies.

## Execution-substrate verdict

AI SDK 7 core: `decided`

Status: `decided` — **Workflow substrate, adopted with the pinned patch** (user decision 2026-07-11, after the re-examination reversed the original rejection's conclusion)

Target: WorkflowAgent + Workflow DevKit + `@workflow/world-postgres`, pinned versions, with the one-line realm patch isolated in one documented module, guarded by the permanent compatibility suite. **Patch removal criterion**: the suite re-runs on every dependency bump; when either one-line upstream fix ships (vercel/workflow `workflow.ts:383` or vercel/ai `merge-abort-signals.ts:17`), the patch is deleted in the same change. Rationale: the paths converge — adopting with the patch is identical to waiting, minus the idle time; durability features (crash-resume, multi-instance, durable waits, replay) are product-owner-required.

Running substrate: **Workflow — implemented 2026-07-11** (`npm run test:service:compatibility` 3/3 green on the compiled Nitro output: native WorkflowAgent stream; provider-observed signal-based cancellation with exactly one provider attempt and no late content; unpatched-path tripwire guarding the patch-removal criterion). The interim `ToolLoopAgent` fallback code has been deleted per the one-substrate rule.

Evidence: [`evidence/02-workflow-cancellation-reexamination.md`](./evidence/02-workflow-cancellation-reexamination.md) — OOB WorkflowAgent cancellation hard-fails on newest versions (instanceof realm bug, exact source locations recorded); DevKit v5 cancellation semantics proven correct; the patch delivers abort to the provider in ~2 ms with reason intact. ADR 0016 has been revised to this outcome (adopted-with-patch, including the rebuild's implementation findings).

## Board

| Step                                                                                    | State         | Owner      | Depends on     | Required completion evidence                                                   |
| --------------------------------------------------------------------------------------- | ------------- | ---------- | -------------- | ------------------------------------------------------------------------------ |
| [01 Architecture decisions + acceptance](./01-architecture-decisions-and-acceptance.md) | `complete`    | Codex      | none           | ADRs 0014–0016; product inventories; permanent acceptance contract             |
| [02 AI SDK service foundation](./02-ai-sdk-service-foundation.md)                       | `complete`    | Claude     | 01             | permanent compatibility suite 3/3; ADR 0016 (revised); re-examination evidence |
| [03 Configuration + composition](./03-scaffold-app-and-config.md)                       | `not_started` | unassigned | 02             | settings pipeline validated; production composition boots safely               |
| [04 Providers, auth, telemetry](./04-scaffold-providers-auth-telemetry.md)              | `not_started` | unassigned | 03             | provider instances/guards; auth; readiness; harness                            |
| [05 Turn execution + stream core](./05-turn-workflow-and-stream.md)                     | `not_started` | unassigned | 04             | streamed turn + prompt cancellation; eight edge cases; seams named             |
| [06 Stream profile + scrub](./06-stream-profile-and-scrub.md)                           | `not_started` | unassigned | 05             | small filter; exhaustive vocabulary; profile doc                               |
| [07 Reconnect + replay](./07-reconnect-and-replay.md)                                   | `not_started` | unassigned | 05, 06, 10     | GET route; startIndex semantics; multi-subscriber proof                        |
| [08 Title, edge cases, parity](./08-turn-title-edgecases-parity.md)                     | `not_started` | unassigned | 05, 06         | title isolated; residual cases; parity decisions                               |
| [09 Persistence writes](./09-persistence-schema-write.md)                               | `not_started` | unassigned | 05             | UIMessage schema; idempotent writes; race-safe busy constraint                 |
| [10 Reads, discovery, pruning](./10-persistence-reads-discovery-pruning.md)             | `not_started` | unassigned | 09             | validated history; run discovery; archive/prune                                |
| [11 Client tools + hooks](./11-client-tools-and-hooks.md)                               | `not_started` | unassigned | 05, 06, 09     | exactly-once settle; restart/cross-instance survival where durable             |
| [12 Tool approvals](./12-tool-approvals.md)                                             | `not_started` | unassigned | 05, 06, 09     | server-enforced approval; audit; pinned-path gap resolved/tested               |
| [13 Widget transport + state](./13-widget-transport-state.md)                           | `not_started` | unassigned | 07, 10         | useChat transport; no duplicate bubbles; bundle hygiene                        |
| [14 Widget timeline](./14-widget-timeline-rendering.md)                                 | `not_started` | unassigned | 06, 13         | native-part mapping; invariants; theme audit                                   |
| [15 Widget interactions](./15-widget-interactions.md)                                   | `not_started` | unassigned | 11, 12, 13, 14 | tool/approval round trips; dedupe; browser evidence                            |
| [16 Recovery + multi-tab](./16-widget-recovery-multitab.md)                             | `not_started` | unassigned | 07, 10, 13, 15 | refresh/drop/two-tab cases; old recovery consumer-free                         |
| [17 Admission + capacity](./17-admission-capacity.md)                                   | `not_started` | unassigned | 05, 11         | bounded admission; no-residue rejection; suspension policy; stress             |
| [18 Telemetry completion](./18-telemetry-completion.md)                                 | `not_started` | unassigned | 08, 11, 12, 17 | inventory; bounded labels; privacy sentinels; stuck-run alarm                  |
| [19 Shutdown + lifecycle smoke](./19-shutdown-lifecycle-smoke.md)                       | `not_started` | unassigned | 16, 17, 18     | bounded shutdown; compatibility suite rerun; lifecycle smoke                   |
| [20 Cutover + deletion](./20-cutover-and-deletion.md)                                   | `not_started` | unassigned | 19             | consumers cut over; inventory deleted; searches clean                          |
| [21 Governance, docs, final gate](./21-governance-docs-final-gate.md)                   | `not_started` | unassigned | 20             | rules/fixtures; docs current; full pinned gate                                 |

## Execution log

Newest first.

| Date       | Step         | Owner  | Update                                                                                                                                                                                                                                                                                                                                                                                                          | Evidence or blocker                                                                                                                                                                      |
| ---------- | ------------ | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-07-11 | 02 (rebuild) | Claude | **Rebuild landed, all green**: WorkflowAgent + Nitro foundation, patch module, serde scripted model, hook-raced signal cancellation; compatibility suite 3/3 (stream, provider-observed abort, unpatched tripwire); fallback code deleted; pins/governance updated; engine findings (AbortError naming, pending hooks safe) recorded in ADR 0016 + KNOWLEDGE; full repo suite 148/734 green, old app untouched. | `npm run test:service:compatibility`; ADR 0016 §Implementation findings; KNOWLEDGE §rebuild facts                                                                                        |
| 2026-07-11 | 02 (rebuild) | Claude | Substrate decided: Workflow with pinned patch (user). ADR 0016 revised to the adopted outcome. Foundation rebuild (WorkflowAgent + Nitro + patch module + load-bearing patch test + signal-based cancel E2E) launched as implementation task; plan-doc cleanup queued behind it.                                                                                                                                | ADR 0016; STATUS verdict section; agent in flight                                                                                                                                        |
| 2026-07-11 | 02 (re-exam) | Claude | Rebuilt the lost cancellation evidence from scratch on newest versions (`workflow@5.0.0-beta.30`, `ai@7.0.22`): OOB still broken (instanceof realm bug, exact lines found); DevKit v5 cancellation semantics proven correct; one-line patch makes docs pattern work end-to-end. Verdict reopened for user decision; repro preserved.                                                                            | `evidence/02-workflow-cancellation-reexamination.md`; `.reference/workflow-cancel-repro{,-v4}`                                                                                           |
| 2026-07-11 | 02b          | Codex  | Selected the request-bound ToolLoopAgent fallback and deleted Workflow, Postgres World, worker, serialization, and compatibility-only code.                                                                                                                                                                                                                                                                     | `evidence/02b-workflow-compatibility-verdict.md`; `npm run test:service:compatibility` passes native stream and directly observed provider abort.                                        |
| 2026-07-11 | 02a          | Codex  | Retained the new Nitro/Hono service, Postgres World lifecycle, serializable scripted provider, native UI stream, and permanent foundation test.                                                                                                                                                                                                                                                                 | Native turn passes without timeout; numeric timeout fails on Workflow 4.6 because `AbortSignal` is absent; Workflow 5 beta durable signal fails AI SDK's `instanceof AbortSignal` check. |
| 2026-07-11 | 01           | Codex  | Recorded AI SDK 7 core, native stream/tool profile, Workflow acceptance contract, approval policy, error vocabulary, and feature cuts in immutable replacement ADRs.                                                                                                                                                                                                                                            | `docs/adr/0014-ai-sdk-7-native-core.md`; `0015-native-ui-stream-tools-and-approval-profile.md`; `0016-workflow-durable-execution-substrate.md`                                           |
| 2026-07-11 | program      | Codex  | Replaced the disposable spike with documentation-first decisions, retained foundation code, and permanent compatibility tests; narrowed fallback to AI SDK 7 ToolLoopAgent.                                                                                                                                                                                                                                     | `01-architecture-decisions-and-acceptance.md`; `02a-retained-workflow-foundation.md`; `02b-workflow-compatibility-gate.md`                                                               |
| 2026-07-10 | program      | Claude | Re-split the original program into agent-sized milestones.                                                                                                                                                                                                                                                                                                                                                      | `plan/v7/*.md`                                                                                                                                                                           |
| 2026-07-10 | program      | Claude | Created the program from AI SDK 7 and repository research.                                                                                                                                                                                                                                                                                                                                                      | `plan/v7/KNOWLEDGE.md`; `.reference/ai-sdk-v7`; `.reference/workflow`                                                                                                                    |

## Blockers

None. Step 03 is unblocked.

## Program completion evidence

Populate after Step 21: pinned versions · substrate verdict · permanent compatibility result · lifecycle smoke · deletion searches · docs audit · full gate · remaining risks.
