# Quality Parity Review: side-chat-service vs the Effect Wing

Read this when: reconstructing the quality review performed on 2026-07-16.
Source of truth for: the historical 2026-07-16 parity verdict and the evidence recorded at that time.
Not source of truth for: the normative architecture (plan/v7/ARCHITECTURE.md), program status (plan/v7/STATUS.md), or governance rules (ADR 0013).

> **Historical evidence:** Paths, counts, findings, and proposed actions below describe the repository as reviewed on 2026-07-16. Subsequent pre-alpha rewrites have repaired, replaced, or deleted parts of that design. Do not use this file as a current backlog or architecture guide; revalidate any historical finding against the current code, canonical docs, and executable gates.

## Scope and method

Four independent read-only audits (architecture conformance, code-level readability, test
discipline, docs and governance), each calibrated on legacy exemplars before judging the new
wing, plus a quantitative baseline. Compared surfaces: `apps/side-chat-service`,
`packages/stream-profile`, and the native-path widget code, against `apps/partner-ai-service`,
`packages/partner-ai-core`, `packages/agent-runtime`, and `packages/chat-protocol`.

## Verdict

**The new wing holds the Effect wing's bar.** This is not a fast rewrite that traded craft for
speed: comment discipline, naming, function shape, test colocation and naming, edge-case
culture, ADR quality, config readability, and gate enforcement all pass at or above the legacy
standard, and several practices exceed it. The shortfalls are narrow, enumerable, and
concentrated in four places:

1. **Two dependency-law rules exist on paper with no gate** (application→provider-SDK,
   adapters→workflows internals) — the folder-based law is enforced asymmetrically where
   legacy's package boundaries were total.
2. **Four workflow test files mock sibling internal modules** — the one test-discipline break
   in an otherwise mock-free repo (legacy: zero `vi.mock`).
3. **Descriptive docs and both glossaries are half-migrated** — three architecture docs
   actively teach deleted mechanisms; ADR quality itself is excellent.
4. **~10 code polish items** — magic strings bypassing constants the new wing itself defines,
   one duplicated utility, one untyped domain error.

Nothing requires re-architecture. Every finding has a small, mechanical fix.

## Numbers

| Metric                 | Legacy wing                                 | New wing                          |
| ---------------------- | ------------------------------------------- | --------------------------------- |
| Source lines (service) | 10,693 (+10,228 core/runtime/protocol pkgs) | 13,518 (+483 stream-profile)      |
| Comment density        | 18.6% service / 15.4% packages              | 5.7%                              |
| Test files             | 81                                          | 142                               |
| Test colocation        | 100%                                        | ~100%                             |
| `vi.mock` calls        | 0                                           | 9 (4 files, all `src/workflows/`) |
| Unconditional skips    | 0                                           | 0                                 |
| Vague test names       | 0                                           | 0                                 |

On comment density: the 3× drop is **not** a documentation regression. The readability audit
found role-explaining headers on nearly every file and zero bad comments; the delta reflects
tighter invariant-only prose (the stricter bar the repo itself adopted) plus legacy's fuller
`@param`-style blocks. Density is the wrong metric here; presence and quality pass.

## 1. Architecture conformance (vs plan/v7/ARCHITECTURE.md)

**Verdict: substantially conformant and genuinely well-built — not folder cosplay.** Layout
matches the normative doc; the turn pipeline (`prepare-turn` → durable shell →
`finalize-turn`) sits exactly where the worked example demands; every port in
`application/ports` is earned (two real implementations each: ModelProvider azure/openai vs
scripted, TurnExecution workflow vs deterministic, stores postgres vs in-memory, TelemetrySink
otlp/console vs collecting); engine imports and `'use workflow'`/`'use step'` directives are
confined to `workflows/`; the realm patch is one documented module with a tripwire.

Enforcement strengths beyond legacy: a transitive production-import-graph walk from
`index.ts`, compiled-bundle marker scans (`production-bundle-guard.ts`), and a fixtures
meta-gate proving each rule fails on crafted bad input, with orchestrator-coverage validation.

**Enforcement gaps (rules on paper, no gate):**

- **G1 — application layer is a denylist, not an allowlist.** `@ai-sdk/openai`, `@ai-sdk/azure`,
  `@ai-sdk/provider` pass into `application/` unchecked; `apps/side-chat-service` has no
  `forbiddenByArea` entry in `check-boundaries.mjs` and no closed allow-set. Legacy's core had
  both. The sanctioned `LanguageModelV4` import in `model-provider.ts:1` (ADR 0014/0016) proves
  the door is open and holds only by author discipline.
- **G2 — adapter→`#workflows/` is never inspected.** `isAdapterBoundaryViolation` omits
  `#workflows/`. Live instance: `adapters/http/compatibility-app.ts:10-15` imports workflow
  testing internals (safe only because that file is excluded from the production graph).
- **G3 — adapter→adapter via relative path is unguarded** (alias form is caught; `../providers/y`
  is not; no live instance today).
- **G4 — testing detection is exact-path, not folder-based.**
  `composition/route/testing-harness/local-chat-fixture.ts` is production-reachable (benign
  dev-seed today; a real double added there would pass the gate).

**Drift (no hard violation):** `workflows/` root carries shared durable mechanics beyond the
diagrammed `production/`+`testing/` split, with two directive files under
`workflows/server-tools/`; `WorkflowAgent` is constructed in two places
(`chat-turn-agent.ts:32` sanctioned factory, `generate-conversation-title.ts:95` inline).

## 2. Code readability

**Verdict: meets the bar, in places exceeds it.** Comments are invariant-only with zero
mechanics-narration, change-log residue, or commented-out code in a ~35-file sample. Naming is
domain-precise with stable vocabulary (turn/run/epoch/admission/claim used deliberately). No
generic identifiers. Function shape is single-altitude; the two longest bodies
(`executeChatTurn` ~80 lines, `consumeNativeMessages` ~62) read as cohesive sagas.

**Findings (worst first):**

- `widget-transport-recovery.ts:125-140` — `classifyTransportError` matches raw strings
  (`"stream_unavailable"`, `"replay_expired"`, …) though `SIDE_CHAT_API_ERROR_CODES` exists in
  the same package and is used correctly elsewhere in the same file; `:205,228-230` also match
  bare server turn-status literals with no named widget-side mirror.
- `isRecord` reimplemented ~6× (`chat-routes.ts:251`, `host-context-schema.ts:100`,
  `client-tool-schema.ts:204`, `resolve-config-environment.ts:74`,
  `workflow-chat-client.ts:235`, `compiled-compatibility-fixture.ts:208`) despite the
  `@side-chat/shared` export being imported elsewhere.
- `content-filter` spelled three ways: canonical `SIDE_CHAT_FINISH_REASONS.CONTENT_FILTER`
  (`finish-reasons.ts:17`, whose header mandates its use), local re-declaration
  (`chat-turn-outcome.ts:32`), bare inline (`workflow-widget-chat-transitions.ts:250`).
- `chat-turn-agent.ts:44-48` — duplicate-tool-name conflict throws plain `Error`; the legacy
  twin throws typed `AiRuntimeError(RUNTIME_ERROR_CODES.TOOL_CONFLICT)`.
- Minor: `native-message-projection.ts:161` magic `type.slice(5)` and inline fallback labels
  (`"Tool"`, `"Source"`, `"Document"`); `chat-routes.ts:227-229` inline `"failed"` status;
  `widget-run-state.ts:44-57` bare destination literals; 5×-repeated request-id expression in
  `chat-routes.ts`.

**Better than legacy:** compile-time-exhaustive `SIDE_CHAT_ERROR_VOCABULARY`
(`Record<SideChatErrorCode, Profile>` totality), contract-grade doc headers with `@param` and
ADR citations, tuning constants carrying their arithmetic (`DEFAULT_INACTIVITY_TIMEOUT_MS`
does the heartbeat math), and cross-package contracts that document their own consumers.

## 3. Test discipline

**Verdict: parity on every axis but one.** 142 colocated files, behavior-stating sentence
names repo-wide, zero unconditional skips (the "12 skipped" are two documented
`describe.skipIf(!database)` guards that run green under `test:db:container`), fake timers
everywhere unit-level time matters, and a serde-compatible scripted provider
(`testing/scripted-language-model.ts`, used across 13 service test files) as the model fake —
the direct heir of legacy's fake-model-provider pattern. Edge-case culture is arguably richer
than legacy: named race tests ("closes the decision-before-hook-registration race and executes
once"), replay-cursor semantics, restart-resume proofs.

**The one deviation:** 4 files in `src/workflows/` use `vi.mock` on sibling internal modules
(`../execution-claim.js`, `../chat-turn-agent.js`, `../production/approvals/tool-approval.js`,
`../production/client-tool-dispatch.js`) — the internal-module mocking legacy categorically
avoided. Contained and backstopped by the real-substrate integration suites, but the backstop
(`service-compatibility.integration.test.ts`) holds only 3 tests.

**Fixes:** inject those dependencies through seams instead of `vi.mock` (the scripted provider
already models the pattern); add a shared clock/timer seam replacing per-file `sleep` stubs;
de-flake the one real-`setTimeout` guard (`workflow-turn-replay.test.ts:207`); verify
stream-profile's single test file still carries all six mandated edge cases; broaden the
compiled compatibility suite with a server-tool approval round-trip.

## 4. Docs and governance

**Verdict: decision records excellent; descriptive docs half-migrated.** ADRs 0014-0018 match
or exceed legacy quality (0016 records both verdicts of the reversed substrate decision with
evidence); the new-wing architecture gate is wired as gate #15 inside `lint:custom`/`verify`
with meta-gate fixtures; config variants honor ADR 0010 (minor: `readEnv` omits the
`{description}` field). Docs carrying the header contract were kept honest — the rot is
exactly in the unguarded corners ADR 0013 warned about.

**Actively misleading (no two-wing acknowledgment):**

- `docs/architecture/host-commands.md` — teaches the mechanism the new wing deleted.
- `docs/architecture/extension-seams.md` — all eight seams point at legacy composition only.
- `docs/architecture/runtime-port.md` — presents `AiRuntimePort` as _the_ engine seam; ADR 0014
  deletes it at cutover.
- `docs/architecture/effect.md` — omits that `apps/side-chat-service` is Effect-free by ADR 0014.
- `docs/domain/vocabulary.md` + `apps/docs/app/data/glossary.ts` — legacy-only dictionaries;
  the glossary has additionally drifted from the vocabulary it claims to mirror ("The only
  app" is false; conversation-title paths disagree).
- Gate count: ADR index and 0002/0013 say 14; actual is 15.

Correctly updated (the boundary held): `system-map.md`, `assistant-turn.md`,
`runtime-and-protocol-events.md`, `package-boundaries.md`, `widget-and-host-integration.md`.

**Missing:** standalone header-contract docs for the workflow substrate/turn lifecycle, client
tools, and approvals (today ADR-only plus scattered sections).

## Consolidated actions, ranked

### Tier 1 — close the enforcement gaps

1. Convert the application-layer rule to an allowlist (`ai`, `@side-chat/stream-profile`,
   `#application`, `#domain`, relative) with a sanctioned-exception list for
   `model-provider.ts`'s `LanguageModelV4`; add fixtures.
2. Add `#workflows/` to `isAdapterBoundaryViolation`, narrowing http to START/RESUME entries;
   move `compatibility-app.ts`'s probe imports behind a sanctioned path; add fixtures.
3. Treat `testing-harness/` folders as testing-only in the production-graph walk; catch
   relative-path adapter→adapter imports.

### Tier 2 — test-seam repair

4. Replace sibling-module `vi.mock` in the 4 workflow test files with injected dependencies.
5. Broaden the compiled compatibility suite (server-tool approval round-trip) so the backstop
   matches the weight it carries.

### Tier 3 — code polish batch

6. The 10 readability fixes (§2), led by `widget-transport-recovery.ts` constants, `isRecord`
   consolidation, `content-filter` unification, and the typed tool-conflict error.

### Tier 4 — docs

7. Two-wing banners or rewrites for `host-commands.md`, `extension-seams.md`,
   `runtime-port.md`, `effect.md` — noting Step 20's legacy deletion resolves parts of these
   by removing their subject; what survives cutover needs rewriting, not banners.
8. Vocabulary/glossary migration (add run/journal/client-tool/stream-profile/approval terms,
   label legacy-only terms, re-sync the mirror) and the 14→15 gate-count correction.
9. Standalone docs for workflow substrate, client tools, approvals.

## Bottom line

The Effect wing's quality was never the syntax — it was the discipline: earned boundaries,
executable governance, invariant prose, evidence-gated completion. The rewrite carried the
discipline across the substrate change. The gaps found are the kind this repo's own machinery
is designed to close: two lint rules, four test files, one docs pass.
