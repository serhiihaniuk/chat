# Code Quality Review: Resumable Server-Owned Streaming

Status: review
Date: 2026-06-24
Scope: the resumable-streaming change (Steps 0–7 of `resumable-streaming-v4-plan.md`)
across `partner-ai-core`, `db`, `partner-ai-service`, and `side-chat-widget`.
Method: verified against the `.agents/skills` quality gates
(`side-chat-code-quality-gate`, `side-chat-documentation`,
`side-chat-testing-architecture`) plus the repo's static gates.

## Summary

The resumable-streaming change is **high quality and passes every hard gate**:
typecheck, oxlint, the full test suite, and the code-shape / source-governance /
boundary custom lints are all green. Functions are small, named-stage, and sit
within the quality-gate skill's _stricter-than-mechanical_ complexity targets.
The invariant discipline (exactly-one-terminal, exactly-one-status, epoch
fencing) is genuinely well built.

Worth fixing: **one real requirements gap** — the `request_fingerprint` / `409`
conflict path specified by the plan is not implemented, leaving a dead schema
column. A **manual readability pass** (not the static script — it can't judge
readability) finds the code readable but with a few `watch`-level hotspots and two
small, concrete nits (R1, R3) the script can't see. One **low-probability
correctness edge** in the reaper is worth a hardening note.

Overall verdict: **ship-quality**, with one documented contract to reconcile and
two small final-state cleanups.

## Resolution (applied 2026-06-24)

All findings were fixed in-session. The findings table below is retained as the
original review record; each row's disposition:

| Finding | Resolution                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **C1**  | Dropped the dead `request_fingerprint` column (`schema.ts`), regenerated the single fresh migration, removed its two test references, and amended the plan — idempotency is `requestId`-only, matching ADR 0009 and the docs.                                                                                                                                                                                                                    |
| **C2**  | Reaper now finalizes each reaped turn independently with a bounded retry, so one turn's terminal-append failure is isolated (`finalizeReapedTurn` in `turn-reaper.ts`) instead of aborting the rest of the batch. New test: _"isolates a terminal-append failure so the rest of the batch still closes."_ The residual (every retry fails for one turn) is documented in-code; the complete reconcile-sweep remains a possible future hardening. |
| **R1**  | Deleted the dead `createProtocolEventStream` wrapper (zero call sites; the plan `:208` already called for its removal), which removes the inside-out `Stream.unwrap(Effect.map(...))`. Its SSE-contract note was folded into `createStartedProtocolStream`; the index export and README/doc references were removed.                                                                                                                             |
| **R3**  | Extracted the duplicated drop-undefined step into a named `keepEmittedEvents` helper, used at both sites in `createObservedRuntimeEventStream`.                                                                                                                                                                                                                                                                                                  |
| **Q1**  | Rewrote the two stale `streamChatEffect` comments (`protocol-event-stream.ts`, `stream-chat-types.ts`) and the two `/chat/stream` scripts (`smoke-openai-provider.mjs`, `run-persistent-e2e.mjs`) to the two-call flow.                                                                                                                                                                                                                          |
| **R2**  | No change — heuristic; on manual read the comments pass the rubric.                                                                                                                                                                                                                                                                                                                                                                              |

**Verification of the fixes:** `npm run typecheck` ✓, `npm run lint:oxlint` ✓,
`npm test` ✓ (481 passing, including the new reaper test), and
`check-code-shape` / `check-source-governance` / `check-boundaries` /
`check-runtime-boundaries` / `check-package-exports` / `check-generated-artifacts`
✓.

**Not run / caveats (unchanged from below):** `npm run verify` and
`npm run lint:custom` as single commands fail at `check-runtime-pins` (off-pin
runtime). `format:check` is **pre-existing red repo-wide**: with no `printWidth` in
`.oxfmtrc.json`, oxfmt 0.51.0's default width exceeds the width the committed code
was formatted to, so ~60 untouched files (e.g. `turn-event-dispatcher.ts`) are
flagged; Windows `core.autocrlf=true` adds CRLF flags on top. New code therefore
matches the surrounding committed style rather than reformatting isolated files.
The two rewritten scripts need their live-provider / testcontainer lanes to run.

## Verification

### Ran (all green)

| Gate                                                                              | Result                                               |
| --------------------------------------------------------------------------------- | ---------------------------------------------------- |
| `npm run typecheck` (tsc, whole monorepo)                                         | **exit 0**                                           |
| `npm run lint:oxlint` (`--deny-warnings`)                                         | **exit 0**                                           |
| `npm test` (vitest)                                                               | **exit 0** — 480 passed / 4 skipped across 105 files |
| `node scripts/check-code-shape.mjs` (cognitive complexity ≤ 12, file/dir budgets) | **exit 0**                                           |
| `node scripts/check-source-governance.mjs`                                        | **exit 0**                                           |
| `node scripts/check-boundaries.mjs`                                               | **exit 0**                                           |
| `node scripts/check-runtime-boundaries.mjs`                                       | **exit 0**                                           |
| `node scripts/check-undefined-optional-contracts.mjs`                             | **exit 0**                                           |
| `node scripts/check-human-readability.mjs`                                        | exit 0, **with warnings** (see R1 / R2)              |

### Not run (honest disclosure)

- `npm run verify` and `npm run lint:custom` as single commands. This shell is
  **Node 24.15.0 / npm 11.12.1**, but `check-runtime-pins.mjs` enforces the exact
  pins **24.16.0 / 11.15.0**, so those orchestrators fail at step 1. The
  underlying gates were run individually instead. For final sign-off, switch to
  Node 24.16.0 and run `npm run verify`.
- `check-version-pins`, `check-dependency-policy`, `check-unused-dependencies`,
  `check-package-exports`, `check-outbound-rules`, `check-generated-artifacts`,
  `check-governance-fixtures` — not central to this change's code quality.
- No live Postgres `LISTEN/NOTIFY` cluster or DB-container lane
  (`npm run test:db:local`) was exercised.

## Findings

| #   | Severity       | Category                                  | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Why it matters                                                                                                                                                                                                                                                                                                                                           | Suggested fix                                                                                                                                                                                                          | Confidence |
| --- | -------------- | ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| C1  | **Medium**     | requirements-gap / correctness-risk       | `packages/db/src/repositories/postgres-drizzle/records/turns.ts:117-159` inserts with `onConflictDoNothing` on `(workspace_id, request_id)` and **never sets or compares `requestFingerprint`**; column `packages/db/src/drizzle/schema.ts:137` is always null. Plan requires "compare `request_fingerprint` — equal → return existing, different → `409`" (`resumable-streaming-v4-plan.md:299-300`) and a "request-fingerprint conflict" test (`:349`). | A client reusing a requestId with a **different body** silently gets the old turn instead of a `409`. The contract is documented but absent, and the column is dead schema.                                                                                                                                                                              | Implement the fingerprint compare + `409`, **or** delete the column and amend the plan to state idempotency is requestId-only. Docs already match the simpler behavior, so deleting is the smaller final-state change. | High       |
| C2  | **Low–Med**    | async-effect-resource / correctness-risk  | Reaper reap-CAS (`packages/db/src/repositories/postgres-drizzle/records/turn-lease.ts:111-129`, txn 1) and synthetic-terminal append (`apps/partner-ai-service/src/inbound/turn-runner/maintenance/turn-reaper.ts:119-146`, txn 2) are **not atomic**; the sweep swallows append failures (`turn-reaper.ts:89-92`) and the next pass won't re-select the turn (`status` no longer `running`, `turn-lease.ts:148`).                                        | On a transient DB failure between the two transactions, the turn is correctly **terminal in status** but has **no terminal event**, and nothing re-appends it. A live subscriber's `takeUntil(isTerminal)` never fires, so its SSE hangs until the client disconnects.                                                                                   | Reconcile turns that are terminal-by-status but lack a terminal event (re-drive the append on a later sweep), or append the synthetic terminal inside the reap transaction.                                            | Medium     |
| R1  | **Low**        | readability-context-gap / cleverness-debt | `packages/partner-ai-core/src/application/stream-chat/protocol/protocol-event-stream.ts:86-88` `createProtocolEventStream` = `Stream.unwrap(Effect.map(createProtocolStreamRefs(...), createStartedProtocolStream))`.                                                                                                                                                                                                                                     | This is the **exact "problem shape" in the skill's own `assets/readability-refactor-examples.md` Example 1** (inline `Stream.unwrap(Effect.map(...))`), and the repo gate independently flags it. Milder here because the callback is a named function, not an anonymous one.                                                                            | Name the intermediate per Example 1: `const refsEffect = createProtocolStreamRefs(...); const startedStream = Effect.map(refsEffect, createStartedProtocolStream); return Stream.unwrap(startedStream);`               | Medium     |
| R3  | **Low**        | readability-context-gap                   | `protocol-event-stream.ts:135-146` `createObservedRuntimeEventStream` inlines the same anonymous "drop the undefined" step **twice**: `Stream.flatMap((event) => (event ? Stream.succeed(event) : Stream.empty))` (once after mapping, once inside `Stream.catch`).                                                                                                                                                                                       | An unnamed domain operation repeated inline — the skill's "anonymous domain callback" smell. A reader re-parses the empties-filter at both sites, and the catch branch nests a second `.pipe`.                                                                                                                                                           | Extract one named helper, e.g. `keepEmittedEvents(stream)` / `compactEventStream`, and use it at both sites.                                                                                                           | Medium     |
| R2  | **Low / info** | comment-quality                           | `check-human-readability` warns on ~12 new files (e.g. `turn-lease-heartbeat.ts`, `turn-reaper.ts`, `finalize-turn-generation.ts`, `protocol-event-stream.ts` ×3): _"dense architecture comment names N hard terms without source/target/invariant grounding."_                                                                                                                                                                                           | **On manual read the comments pass the skill's rubric** — they name role, boundary, and invariant in prose. This is heuristic noise, _but_ the comment-to-code ratio is high in the lease/finalize area (e.g. an ~18-line doc over a 6-line `drainUnderOwnerLease`), which signals the _code_ leans on comments to carry cross-file interrupt semantics. | No change required; that comment load is the legitimate cost of Effect interruption semantics (see Readability §).                                                                                                     | Low        |
| Q1  | **Low**        | quality-gate (final-state rule)           | Stale `streamChatEffect` comments (`protocol-event-stream.ts:78`, `packages/partner-ai-core/src/application/stream-chat/stream-chat-types.ts:43`) and two dead scripts still POSTing the removed `/chat/stream` (`scripts/smoke-openai-provider.mjs:22`, `scripts/run-persistent-e2e.mjs:135`).                                                                                                                                                           | AGENTS.md requires deleting replaced comments/scripts in the same patch.                                                                                                                                                                                                                                                                                 | Update the two comments to the server-owned runner; fix or delete the two scripts.                                                                                                                                     | High       |

## By dimension

### Correctness

Strong. The core invariants hold across every path:

- **Exactly one terminal event** is enforced three ways: the partial unique index
  (`schema.ts:163-165`), the pre-check `rejectSecondTerminal`
  (`turn-events.ts:146-169`), and `ON CONFLICT DO NOTHING` on the synthetic-terminal
  append.
- **Exactly one status transition** rides the `WHERE status='running'` guard.
- **Owner fencing** bumps `lease_epoch + 1` under `FOR UPDATE SKIP LOCKED`
  (`turn-lease.ts:146-150`), so concurrent reaper passes and stale owners can't
  double-terminalize.
- The **subscription stream** (`turn-subscription-stream.ts`) is a clean, correct
  realization of the replay-then-tail contract: register-first via
  `acquireRelease`, a single atomic `Ref.modify` high-water gate
  (`emitIfNew`, `:166-172`) deduping replay / fan-out / poll, and
  `takeUntil(isTerminalEvent)`.

The two dents are C1 (fingerprint) and C2 (reaper append atomicity), both narrow.

### Readability

A static script cannot judge readability — `check-code-shape` exit 0 only proves
nothing breaches cognitive complexity 12; it says nothing about whether a human
can hold the local story in working memory. So this section is a **manual pass**
applying the skill's readability gate (`references/ai-readability-gate.md`,
`human-cognitive-load-budget.md`, `ai-sdk-effect-readability.md`): the
out-of-context-reader test and the 4-way `acceptable / watch / refactor-needed /
gate-failure` classification, function by function.

**Headline:** readable, but not uniformly "clean." Most files are `acceptable`;
a handful are `watch` (cohesive and correct, but high concept count carried
largely by comments rather than structure). **No `refactor-needed`, no
`gate-failure`.** The two concrete, script-invisible nits are R1 and R3.

| File                                                                                       | Class      | Note                                                                                                                                                                                                                                                                                                                                                              |
| ------------------------------------------------------------------------------------------ | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `finalize-turn-generation.ts`                                                              | acceptable | Ternary spine + guard-claused `classifyAbnormalTerminal`; reads top-down. A model for the skill's preferred style.                                                                                                                                                                                                                                                |
| `run-turn-generation.ts`                                                                   | acceptable | 8-line `onExit` spine; long doc comment is a _durable architectural decision_ (allowed).                                                                                                                                                                                                                                                                          |
| `turn-subscription-stream.ts`                                                              | acceptable | Exemplary: named stages, atomic `Ref.modify` gate, one screen each.                                                                                                                                                                                                                                                                                               |
| `widget-run-reducer.ts`                                                                    | acceptable | Pure reducer, per-action helpers, idempotent-by-sequence; very clear.                                                                                                                                                                                                                                                                                             |
| `widget-subscription-lifecycle.ts`                                                         | acceptable | Small lifecycle helpers; only nit is the inline marker-write callbacks in `driveSubscription:144-155`.                                                                                                                                                                                                                                                            |
| `turn-reaper.ts`, `turn-pruner.ts`, `chat-turns.ts`, db `turn-lease.ts` / `turn-events.ts` | acceptable | Small functions, linear guard-claused flow.                                                                                                                                                                                                                                                                                                                       |
| `turn-runner.ts`                                                                           | **watch**  | `Effect.runSync`/`runPromise` + `Scope`/`FiberMap` juggling at the Promise edge. Reading it requires knowing `FiberMap.run` _forks_ (so `runSync` is correct) vs `start` awaiting pre-start. Well-commented, but Effect-runtime fluency is a real budget cost.                                                                                                    |
| `turn-lease-heartbeat.ts`                                                                  | **watch**  | Highest concept density. Understanding "fenced ⇒ stop" means holding `Effect.raceFirst` semantics + `Effect.interrupt` + the _finalizer's_ interrupt classification — a causal chain that spans into `finalize-turn-generation.ts`. Only the comments make it followable; the code alone fails the "explain the flow without evaluating nested combinators" test. |
| `protocol-event-stream.ts`                                                                 | **watch**  | 261-line file assembling started-event, runtime mapping, error mapping, abort wiring, state-machine gating, and accumulator — cohesive but at the size/concept edge, and home to R1 + R3.                                                                                                                                                                         |
| `turn-event-dispatcher.ts`                                                                 | **watch**  | Mutable `Map`/`Set` fan-out state mutated inside Effect (`reconcileTurn` advances `highWaterMark`); fine and commented, but imperative-in-Effect adds load.                                                                                                                                                                                                       |

**Out-of-context-reader test** (the skill's 5 questions) passes for every file on
product boundary, entities-in/out, expected-failure-vs-defect, and
downstream-stability. It only _partially_ fails on "explain the local flow without
mentally evaluating nested combinators" for `drainUnderOwnerLease` and the two
R1/R3 expressions — which is exactly why those are `watch`, not `acceptable`.

**Domain-term traceability:** the change's coined terms — _fence / lease epoch_,
_high-water mark_, _synthetic terminal_, _abnormal exit_ — are each introduced
locally by a name or comment where they first matter, so a reader is not forced
into the architecture docs. This is done well.

**Honest conclusion:** the code is readable _because_ it spends comment budget
generously, especially around Effect interruption. Per the skill that is a
legitimate use of comments (durable design knowledge the code genuinely cannot
carry), so R2 is not a defect. The only changes I'd actually make are R1 and R3 —
both small, both the kind of "named step beats nested expression" fix the skill's
own examples prescribe.

### Requirements

All 8 plan steps are implemented and tested. Config is fully env-driven with no
hardcoded durations (`resumability-config-types.ts`), and package boundaries pass.
The single unmet requirement is the **fingerprint / 409 conflict** (C1).

Notably, the architecture docs (`docs/architecture/assistant-turn.md`, ADR 0009,
`docs/domain/vocabulary.md`) describe idempotency _without_ the 409 branch — so the
docs are self-consistent with the code; only the **plan** over-specifies. That
makes "delete the dead column + reconcile the plan" the cleaner resolution for C1.

## What's strong (worth keeping)

- Finalization correctly lives only in `Effect.onExit` with honest exit
  classification (`finalize-turn-generation.ts:116-127`); abnormal terminals are
  synthetic-at-`maxSeq+1` and idempotent.
- Lease / heartbeat / reaper is a textbook CAS-fencing design; shutdown ordering
  (`service-composition.ts:236-245`) interrupts generation first so each turn
  finalizes via its own `onExit`, then tears down reaper, pruner, and the LISTEN
  dispatchers.
- Observability is threaded through the existing `ObservabilitySinkPort` (no new
  framework) and is best-effort everywhere (`Effect.ignore`), so telemetry can
  never fault a stream, a reap, or a cancel.

## Uncertainty

- The reaper-atomicity edge (C2) is reasoned from the code paths, not reproduced
  with a fault-injection test; the trigger window is narrow.
- Readability warning counts come from the repo's heuristic; manual reading judges
  most flagged comments acceptable, so R2 may be safely ignored.
- Verification was by reading + running gates, not by exercising a live Postgres
  `LISTEN/NOTIFY` cluster.

## Follow-ups

1. **C1** — Resolve the dead `request_fingerprint` column / `409` gap (implement,
   or drop + amend the plan).
2. **Q1** — Remove stale `streamChatEffect` comments and fix/delete the two
   `/chat/stream` scripts.
3. **R1 / R3** — Two small readability fixes in `protocol-event-stream.ts`: name
   the `Stream.unwrap(Effect.map(...))` intermediate, and extract the duplicated
   drop-undefined step into one named helper.
4. **C2** (optional hardening) — Make reaper terminalization atomic or
   self-reconciling.
