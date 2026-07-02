# Side Chat — Foundation Review

**Date:** 2026-07-01
**Scope:** the whole monorepo except `apps/docs` (out of scope by request). The widget is reviewed as production code.
**Method:** nine parallel deep-review passes (runtime+contract, core, service, db, protocol+host-bridge, widget state, widget UI+harness, streaming end-to-end, performance/scaling), one template/DX pass partially lost and re-verified by hand. Every finding below carries a file reference; the highest-impact claims (streaming pivot, broken quick start, no CI/LICENSE) were re-verified directly against git history and by executing the boot path.
**Framing:** the repo is adopted by **copying it as a template**. Future maintainers are ordinary web devs who don't know AI-agent internals and don't know Effect. Effect v4 is locked in — findings judge how it's used and where it leaks, not whether to keep it.

---

## Executive summary

**The per-layer engineering is genuinely strong — better than most production codebases.** Boundaries are real and machine-enforced, the event vocabularies are mapped once per boundary as promised, the exactly-one-terminal invariant is defended in multiple layers and tested on every exit path, comment quality is exceptional, and the fake provider + adapter-parity test harnesses are exemplary. The vertical performance story is excellent (see §8).

**The foundation risk is not code quality — it's that the repo currently disagrees with itself about what its architecture is.** On 2026-06-30, a deliberate refactor series ("connection-bound streaming", commits `b194451` → `8c0af7e` → `f2b5bb8` → `9961a6e` → `be8303f` → `349ba73`) deleted the durable `turn_events` table, the reaper, and the pruner, replacing the event transport with a per-instance in-memory registry. That pivot is a defensible product decision (claude.ai works the same way). But nothing else followed it:

- The root README, `docs/architecture/assistant-turn.md`, `system-map.md`, ADR-0009 (still "accepted"), the db package README, and dozens of code comments still teach the deleted design — including file paths that no longer exist.
- The safety mechanisms that the old design relied on (reaper) were removed without replacing the jobs they did, so **a crashed instance now strands turns as `running` forever**.
- Dead surface remains everywhere: lease heartbeats that protect against nothing, four config knobs that configure nothing, a `dist/` full of deleted modules, e2e tests asserting a deleted UI.

**The intended model** (confirmed by the owner during this review): one active tab holds the live stream; refresh/other tabs read the final message from the DB when the turn completes; **multi-instance must still work turn-independently** — any instance can serve the next turn because context comes from the DB. Section §2 evaluates the code against _that_ target and lists exactly what's missing. Short version: the model is achievable with small, targeted fixes — no re-architecture needed — but four gaps currently break it, one of which breaks it even for a single browser tab behind a load balancer.

**Bottom line:** fix the P0 list (§10) before building more features. All of it is days, not weeks, and none of it fights the architecture — it finishes the pivot that was started.

---

## 1. What is genuinely good (keep exactly as-is)

Confidence matters as much as fear. These were verified, not assumed:

- **Boundary discipline is real.** `hono` only in the service, `pg`/`drizzle` only in db, `ai`/`@ai-sdk/*` only in agent-runtime, widget Effect-free — all grep-verified and enforced by 14 custom gate scripts. Core imports nothing from db (two type surfaces bridged by thin service adapters — a defensible, teachable design).
- **Three event vocabularies, mapped once each.** Provider parts → `RuntimeEvent` (one mapper), `RuntimeEvent` → `sidechat.v1` (one file, compile-enforced total via `noImplicitReturns`). Internal error codes are laundered before reaching the browser; a provider 503 body provably never leaks (tested).
- **Exactly-one-terminal is defended in layers**: protocol state machine, accumulator, `Effect.onExit` finalization covering success/failure/defect/interrupt, and tests on all five exit paths (`finalize-turn-generation.test.ts`).
- **Idempotent turn start is atomic** — `INSERT ... ON CONFLICT (workspace_id, request_id) DO NOTHING` + fork-only-when-inserted. Not check-then-insert.
- **Abort genuinely aborts**: durable cancel intent + NOTIFY + fiber interrupt + `AbortController` threaded into `agent.stream()` — the provider fetch is actually cancelled, verified through all four packages.
- **Vertical performance is engineered, not accidental** (§8): 250 ms delta coalescing, zero DB writes per streamed delta, pull-based SSE with bounded dropping queues, per-message memoized rendering.
- **Testing craft**: the deterministic fake provider implements the real `LanguageModelV3` interface so the actual AI-SDK loop runs offline; provider tests assert real wire bodies via injected fetch; the db contract suite runs identically against Postgres (Testcontainers) and in-memory; the widget reducer is pure and thoroughly unit-tested.
- **Comment discipline** matches AGENTS.md: spine functions read top-down with stage comments; tricky SQL (lease CAS, `SKIP LOCKED`, notify-in-transaction) explains _why_.
- **The token/theming system delivers its promise**: 3-tier tokens, themes/accent/density/radius/typeface all flow through one root; portals and fonts correctly scoped inside the iframe.

---

## 2. The streaming architecture: finish the pivot (P0)

Target model (owner-confirmed): live stream is connection-bound to the owning instance; final state lives in Postgres; any instance serves the next turn. Four gaps block it today.

### 2.1 The stream GET can land on a non-owner instance and hangs forever — breaks even one tab at 2 instances

`POST /chat/runs` and `GET /chat/turns/:id/stream` are separate HTTP requests. Behind a round-robin LB, ~(N−1)/N of stream GETs land on an instance that doesn't own the fiber. That instance finds the turn in the DB, sees it isn't terminal, opens SSE — then replays an **empty local registry** and tails a registry that will never receive events (`apps/partner-ai-service/src/inbound/http/routes/chat/turns/chat-turns.ts:97-104`, `turn-subscription-stream.ts:135-157`). The client hangs on "Thinking…" with no error, no terminal, no timeout. Subscribing also creates a permanent ghost entry in the registry (`in-memory-turn-event-log.ts:92-99` — the sweep only reclaims terminal turns), which additionally flips `hasSubscribers` true and misroutes host-command dispatch.

**Fix options (pick one, smallest first):**

1. **Fail fast + document affinity:** if the turn is `running` and `!dispatcher.hasTurn(id)`, return a JSON error (e.g. `wrong_instance` / 409) instead of opening SSE; require sticky routing (cookie or `assistantTurnId` hash) in the deployment doc. ~20 lines + docs.
2. **Stream from the POST response itself** (one HTTP call = connection IS the owner), keeping the GET as a same-instance resume nicety that fails fast. Bigger client change, strongest guarantee.
3. Restore a cross-instance transport (durable log or Redis relay) — **explicitly rejected** by the pivot; only revisit if requirements change.

Also: host-command result `POST /chat/turns/:id/host-commands/:commandId/result` 404s on non-owner instances — same affinity requirement, same fix.

### 2.2 Crashed instance strands turns `running` forever — breaks the turn-independent model

The reaper was deleted (`be8303f`) but nothing replaced its job. `reapExpiredTurns` still exists, fully implemented and race-tested (`packages/db/src/repositories/postgres-drizzle/records/turn-lease.ts:111-150`, CAS + `FOR UPDATE SKIP LOCKED`, fleet-safe) — **zero production callers**. Consequences of a hard crash (OOM, kill -9; clean shutdown is handled correctly):

- The turn row stays `status='running'` forever. The activity snapshot shows a "generating" dot permanently; `findActiveAssistantTurn` reports a ghost active turn on that conversation indefinitely.
- A `requestId` retry resolves to the zombie turn and never re-forks — the "any instance serves the next turn" property is poisoned.
- Reconnecting clients hang on the empty SSE (2.1).

Two additional traps found in the lease machinery:

- The reap predicate can't catch the window between turn-insert and lease-acquire: SQL `lease_expires_at < now` is never true for NULL (`turn-lease.ts:149`), and the memory adapter requires the field set (`memory/records/turn-lease.ts:131-133`). Extend the predicate: `running AND lease_expires_at IS NULL AND started_at < now - grace`.
- The lease heartbeat still runs every 10 s per turn — pure cost with no consumer — and a single transient DB error during `renewTurnLease` **interrupts a healthy generation** (`turn-lease-heartbeat.ts:76-87`, no retry). Add a small retry before treating it as fenced.

**Fix:** a ~40-line periodic sweep calling `reapExpiredTurns` (all instances may run it concurrently — it's already `SKIP LOCKED`), with the widened predicate. Or, if crash recovery is explicitly out of scope, delete the lease writes and knobs so the code stops promising it.

### 2.3 The widget gives up permanently on any transport blip — the "refresh shows the final answer" path is half-built

- **Any mid-stream transport failure is terminal.** A dropped connection throws `missing_terminal` (`side-chat-sse-reader.ts:50-52`) → run status FAILED → `isResumableRun` excludes FAILED (`widget-run-resume.ts:33-36`) → the persisted marker is cleared (`widget-subscription-lifecycle.ts:161-169`). Nothing retries; the reducer comment claiming "reconnect can retry" is false. The Retry button then submits a **new** turn while the server still generates the old one → duplicate answers. The controller test passes only because its fake stream ends cleanly instead of throwing. **Fix:** treat transport errors as retryable (bounded backoff resubscribe from `lastSeenSequence`), confirm real failure via `GET /chat/turns/:id` before surfacing FAILED.
- **The live→history handoff never happens.** A terminal run shadows refetched history until full page reload (`use-widget-chat.ts:71,88-94` — no status check; nothing evicts a completed run). The header Refresh button invalidates a _disabled_ query (no-op), and a turn started in another tab for the same conversation never displays. **Fix:** on terminal status, refetch that conversation's history and clear the run when fresh data lands — this is the exact claude.ai-style behavior the model calls for.
- **A zombie (half-open) connection locks the composer forever** — no inactivity watchdog, and the same-turn guard blocks every reconnect (`widget-subscription-lifecycle.ts:56-64`). `fetch` streaming doesn't auto-recover like `EventSource`. **Fix:** no-event-for-N-seconds watchdog → abort + resubscribe from cursor.
- **Slow-consumer hole:** the per-subscriber dropping queue plus the max-based dedupe gate can skip a dropped event permanently even though the buffer still holds it (`turn-subscription-stream.ts:166-172` advances past holes; the reader checks monotonic, not dense). A stalled tab silently loses a mid-answer chunk. **Fix:** emit only `maxEmitted+1`; on a gap, re-read the log from `maxEmitted`.
- **A stream that ends with no terminal leaves subscribers hanging**: the synthetic terminal is only appended on abnormal exits (`finalize-turn-generation.ts:67-69`); a success-path exit with no terminal writes a failed _status_ but no terminal _event_. **Fix:** append the synthetic terminal on that path too.

### 2.4 Docs, ADR, and dead surface still teach the old design

- Root `README.md` ("survives multi-instance deploys", "durable turn_events log", "LISTEN/NOTIFY, no Redis"), `docs/architecture/assistant-turn.md` (cites deleted files by line), `system-map.md`, `docs/adr/0009` (still **accepted**, and it explicitly rejects sticky routing — the one thing the new model needs), `packages/db/README.md:11-24` (describes six deleted APIs).
- Code comments justify lossy choices by a deleted safety net ("the reaper later terminalizes": `turn-cancel-notification-source.ts:22-23`, `schema-contract/lifecycle.ts:56-58`, others).
- Dead config: `reaperInterval`, `reaperBatchLimit`, `turnEventRetention`, `prunerInterval` in `sidechat.config.ts:208-225` resolve into a struct nothing reads; `docs/operations/configuration.md` documents them as live.
- Stale `dist/` in db and widget still contains compiled deleted modules.

**Fix:** write **ADR-0010 (connection-bound streaming)** superseding 0009; rewrite the streaming sections of the three architecture docs + two package READMEs in the same patch; delete the dead knobs and comments. Until this lands, every new reader of the repo — human or AI agent following the mandatory reading path — is being actively misled at the most load-bearing spot.

---

## 3. First-run and template experience (P0)

These were verified by execution, not just reading:

- **The advertised no-API-key quick start crashes at boot.** README: "`node scripts/run-local-fake.mjs --yes` … no Docker, in-memory persistence, seeded demo chats." Reality: the launcher sets `SIDECHAT_PROVIDER=fake`, but the config-first boot ignores that env var — `readProviderKindForConfig` derives the provider from the models declared in `sidechat.config.ts`, which are OpenAI-only. Reproduced: `BOOT FAILS: SIDECHAT_OPENAI_API_KEY is required when sidechat.config.ts enables OpenAI models.` The legacy env parser that understands `fake` is only reached if the config _import_ fails (`config-selection.ts:41-58`). A team's literal first command with this template dies. **Fix:** either ship a fake-mode config (registry entry in `SIDECHAT_CONFIGS`) that the launcher selects via `SIDECHAT_CONFIG`, or honor `SIDECHAT_PROVIDER=fake` in the config path for non-production profiles.
- **The config loader falls back silently.** Any import error in `sidechat.config.ts` (a typo!) silently boots the _legacy env parser_ — different defaults, different policy semantics, no Azure — with the reason discarded (`server.ts:62-79`). **Fix:** log the reason loudly at boot; consider making fallback opt-in.
- **There is no CI.** No `.github` directory exists. `npm run verify`, the db container tests, and the Playwright e2e run only when someone remembers. Multiple confirmed gaps (stale generated schema, e2e testing a deleted UI) are invisible precisely because of this. **Fix:** a minimal workflow running `npm run verify` + `test:db:container` is the single highest-leverage governance addition — the repo's own gate scripts are excellent and just need to be executed.
- **No LICENSE file**, while the README's first sentence says "open-source framework". Blocking for any real adopter's legal review.
- **Naming**: the product is "Side Chat"/`sidechat.*` but the deployable is `partner-ai-service`/`partner-ai-core`. Grep for either term finds half the system. A rename or a one-line glossary in the README is needed; for a template, the rename is worth it while the repo is young.
- **Two parallel config systems** with subtly different semantics (`config/sidechat-config/*` vs the 279-line legacy `service-config.ts`; e.g. `CONFIGURED`→`ALLOW_ALL` mapping in dev on one path, rejected on the other). The legacy parser is documented as "slated for removal" — remove it, or the fallback (above) keeps booting a different universe.
- `npm run dev` (real model) is well-built: `.env` guidance, Docker Postgres bootstrap, health-checked startup order (`scripts/dev.mjs`). Its API-key error message is exemplary. This is what the fake path should feel like.

---

## 4. Adopter seams: the advertised extension points vs reality (P1)

The extension story is the product's pitch. Today four of the six seams an adopter reaches for first are missing or dead-end:

| Seam                             | State                     | Detail                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| -------------------------------- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Auth (bring your own users)**  | **Missing**               | `ServiceAuthVerifier` is the right interface but not injectable — options accept only static-token configs; "production" auth maps every caller to **one shared synthetic subject** (`service-auth.ts:93-112`): all users share one conversation list. `extension-seams.md` has no auth row. Fix: accept `authVerifier?` in `PartnerAiServiceOptions` + write the doc section. Also make token comparison timing-safe.                                                                                                          |
| **Add a tool via config**        | **Fiction**               | `tools.availableTools` validation rejects everything but `mock_web_search` (`validation.ts:182-184`), and the adapter maps **every** entry to the mock registration (`options-adapter.ts:158-174`). The documented recipe dead-ends. Fix: a service-owned name→registration map; document it as _the_ place to add a tool.                                                                                                                                                                                                      |
| **Add a tool (code)**            | Works, Effect-heavy       | The bundled declaration+executable registration is genuinely good, but `RuntimeTool.execute` demands `Effect.gen`/`yield*`/`mapError` — the most Effect-fluent seam in the repo, aimed at the least Effect-fluent audience. Fix: a ~20-line `createRuntimeToolFromPromise({ name, inputSchema, run: async … })` helper; show both flavors in the Jira example.                                                                                                                                                                  |
| **Custom tool-result rendering** | **No seam**               | Tool results, sources, images, and host-command results are carried by the protocol and the widget model — then rendered as **nothing** (`widget-message-view.tsx:93-109` reduces to `{name, state}`; `tool-row.tsx` is a glyph+name). No renderer prop/registry exists. For an AI-assistant template this is the core customization; add `renderActivityItem?` falling through to defaults.                                                                                                                                    |
| **Model parameters**             | **No seam**               | `temperature`, `maxOutputTokens`, `topP`, stop sequences, and the tool-loop step cap have no path — the runner hardcodes its agent settings (`tool-loop-agent-runner.ts:148-157`); the 20-step loop cap is an invisible AI SDK default. Add a provider-neutral call-settings bag on `AiRuntimeRequest`.                                                                                                                                                                                                                         |
| **Context sources**              | Undocumented, closed      | Adding "feed our CRM record into context" crosses a closed union + a `{history}`-only budget type across 5+ files in two packages (`contracts/capabilities.ts:39-46`, `contracts/context.ts:103-105`); `extension-seams.md` has no context row. Redaction is classification-only (drop, no masking) — fine, but say so.                                                                                                                                                                                                         |
| Provider adapter                 | **Good**                  | 3 files, trivial Effect, Azure adapter is an excellent worked example.                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Host commands                    | **Good code, wrong docs** | The full model-driven loop works and is tested end-to-end (core relays descriptors → runtime exposes model-callable tools → browser dispatch → result round-trips). But `host-commands.md:206-211`, `runtime-and-protocol-events.md:26-27,108-109`, and `extension-seams.md:28` still say it's unbuilt and cite a field that no longer exists. Adopters will build workarounds for a working feature. Highest doc-fix ROI in the repo.                                                                                          |
| Persistence adapter              | Good with a caveat        | The contract test kit is exactly right. But the port contracts don't state the invariants correctness depends on (idempotent `startAssistantTurn` on `(workspace,requestId)`, idempotent `appendUserMessage`, first-transition-wins on complete/fail) — a custom adapter learns them by folklore. Write them into the port docs and point at the contract kit. Also: passing `repositories` without `persistence` silently selects NOOP notification sources even on Postgres (`create-service-persistence-bundle.ts:103-107`). |

Two more cross-cutting adopter traps:

- **Security when real auth arrives:** turn stream/status/cancel are workspace-scoped but not subject-scoped (`chat-turns.ts:234-242`) — user B can tail and cancel user A's turns by id. Moot with today's single-subject auth; fix **before** the auth seam ships, or the seam is a trap. Similarly, host-command result settle is keyed by global `commandId` alone — bind it to the turn.
- **The composition story is split:** core ships 178 lines of Effect `Layer` machinery that the README calls canonical (`packages/partner-ai-core/src/services/effect-runtime.ts`) — and **nothing uses it**; the real service passes a plain ports object. Delete the Layer path (the plain object is the better story for this audience) and fix `README.md:13`.

---

## 5. Protocol completeness (P1)

The known "blocked-terminal rollout gap" is still open, and the pattern behind it is the risk:

- `sidechat.blocked` is a legal terminal that the protocol's own sequence validator rejects (`chat-protocol/src/sidechat-v1/ordering/sequence.ts:42-47`), the "generated" schema omits, and `@side-chat/testing`'s `assertTerminalStream` doesn't know about (third divergent copy of terminal logic, `packages/testing/src/index.ts:66-73`).
- The schema is **generated in name only** — no generator exists anywhere; the gate (`check-generated-artifacts.mjs`) checks only that the file exists and has a header. Meanwhile the published OpenAPI doc references it, so external consumers see a contract missing a terminal state.
- Adding one event today touches ~6 places; TypeScript exhaustiveness covers the switches but nothing covers the schema, the sequence validator, or `EVENT_PAYLOAD_VALIDATORS` (typed `Record<string,…>` — a missing key compiles, `validation.ts:118-126`).

**Fix (one small PR):** delete the terminal-type restriction in `sequence.ts` (`isTerminalEvent` already owns terminality); add `BlockedEvent` to the schema; add a **completeness test** asserting (a) `SIDECHAT_EVENT_TYPES` ⊆ schema `oneOf`, (b) every `TerminalEvent` passes the sequence validator; tighten the validator map to `Record<SidechatEventType,…>`; fix or delete `@side-chat/testing` (zero consumers today — dogfood it or drop it). Then either write a real generator or rename the schema `handwritten`.

Downstream semantic fixes in the same theme:

- The widget maps `sidechat.error(code=aborted)` to FAILED with a Retry button — a cancel from another tab renders as a red error; blocked gets a Retry that resubmits filtered content (`widget-run-reducer.ts:107-110`). Map aborted → CANCELLED; give blocked its own status, no retry.
- Core persists a blocked turn as `provider_failed` status — safety stops are indistinguishable from outages in the DB (`protocol-event-accumulator.ts:96-103`).
- Host commands re-execute on reload replay (`maybeDispatchHostCommand` ignores `status`/existing `result` — a reload mid-turn re-navigates the host, `widget-run-subscription.ts:65-82`).
- Comment-only SSE frames (`: keepalive`) **crash both protocol decoders** (`sse-codec.ts:15,28`; `activity-sse-codec.ts:36`) — the moment an adopter's proxy sends standard keepalives, every client hard-fails mid-turn. Skip dataless frames; and since the service sends no heartbeats itself (see §8), adopters _will_ add them.

---

## 6. Robustness details (P1, mostly small)

Server/db:

- **No `error` handlers on any long-lived pg connection** — the pool (`postgres-drizzle/index.ts:28`) and both LISTEN clients. A dropped idle connection = unhandled `'error'` event = **process crash**; a dropped LISTEN connection = silently dead cancel/activity until restart (no reconnect loop). This is the cheapest critical fix in the repo.
- `appendMessage` sequence race: `max+1` read-then-insert at READ COMMITTED; concurrent appends throw a raw `23505` (500 to the caller). Worse at completion: the assistant-message append runs in the `onExit` finalizer; if it throws, **nobody observes it** (`awaitTurn` ignores outcomes) — the turn strands `running` with its finished answer lost. Fix: `SELECT … FOR UPDATE` on the conversation row (one line) + log/observe generation-fiber exits.
- A retried "first message of a new conversation" mints an orphan conversation and returns the **orphan's** id to the widget (`service-conversation-persistence.ts:23-29`, `turn-runner.ts:160-165`). Derive the conversation key from `requestId`.
- No guard against two concurrent runs in one conversation (two tabs interleave freely; combined with the append race above this is the realistic trigger). Decide: reject, or serialize.
- 500s leak raw `Error.message` (driver details) to the browser (`chat-runs.ts:100`, `protocol-errors.ts:41-42`).
- `after=` (empty) parses as 0 and silently skips seq 0; terminal turn + `after ≥ max` opens an SSE that never closes (`chat-turns.ts:265-269`, replay filters everything, no tail ever comes).

Runtime:

- **Caller-aborted turn ends with no terminal event**: the AI SDK's `abort` stream part is silently dropped, and the `"abort"` finish-reason branch is dead code — no such finish reason exists in the pinned SDK (`stream-part-mapper.ts:16,128,140`). The main app is shielded by accident (fiber interruption). Map `abort` → `completed(aborted)`.
- A mid-stream provider error can yield **two terminals** (`runtime.error` then `completed(stop)` — finish reason `error` maps to STOP, `stream-part-mapper.ts:138-142`). End the runner stream at the first terminal (`Stream.takeUntil(isRuntimeTerminalEvent)` — the helper already exists).
- Silent name collision: a host command named like a runtime tool silently replaces it (`mergeToolSets`, `tool-loop-agent-runner.ts:115-122`) — and host-command names arrive from the browser. Fail on collision.
- OpenAI adapter always sends a reasoning effort (Azure correctly omits it for non-reasoning models) — pointing at a non-reasoning model 400s with no hint (`openai-model-provider.ts:90-97`).
- Dropped stream parts have no exhaustiveness backstop — a future SDK part type vanishes with zero signal. Add an explicit ignore-set + log-once default.

Core:

- **Telemetry is fail-closed**: an observability-sink failure rejects the user's request at pre-start and aborts healthy mid-stream generations into `sidechat.error` (`stream-chat-observability.ts:16-20` — runs on _every_ runtime event). Observability is an advertised seam; a flaky sink must degrade telemetry, not answers. (Title generation already does this correctly.)
- The approval subsystem validates but never enforces — `approvalMode: "always"` gates nothing (`validation.ts:104`; requirements consumed by nothing). Mark it loudly or fail composition when a manifest demands approvals nothing honors. There is also zero approval UI in the widget.
- Five distinct config/validation failures all surface as `runtime_failed/internal_error` — a typo'd tool name in config is indistinguishable from a provider crash (`turn-policy-plan.ts:126-144`). Add `configuration_invalid`.

Widget (state):

- Two-instance isolation half-wired: run-store keying promises `baseUrl` separation but every caller passes `undefined` — two widgets on one page silently share/clobber one run store (`widget-run-store.ts:70-78`, `use-widget-chat.ts:65`).
- Unmount never aborts the live subscription; a remount (StrictMode!) opens a second concurrent SSE to the same turn (`widget-run-controller.ts:73,126-130`).
- Synchronous `localStorage` write per streamed event, for a marker field the resume path never reads (`widget-run-subscription.ts:58`). Write once at start, clear at terminal.
- Activity stream: fixed 1 s reconnect (no backoff — hammers a down server); every tab-focus aborts a healthy connection; the client captured at mount ignores prop changes (token rotation) (`use-activity-stream.ts:7,46,55-57,109`).
- CRLF split across chunk boundaries corrupts SSE framing (`side-chat-sse-reader.ts:76-77`) — hold back a trailing `\r`.

---

## 7. Widget UI (P1/P2)

- **The Playwright e2e suite asserts a UI that no longer exists** (tool detail cards, "Dismiss error" button, context-ring hover — `e2e/widget-harness.spec.ts:66,189-229,253,294-306`) and nothing runs it (no CI). A red-if-ever-run suite certifies behavior that isn't there — reconcile it with the shipped UI and put it in CI; the harness itself (iframe postMessage host, health-checked orchestration, fail-on-page-error) is genuinely good.
- **Protocol content renders nothing** (see §4 — tool results/sources/images/host-command results). The mock stream emits them; they vanish.
- **The context ring is fabricated** — `characters/48`, `aria-hidden`, no tooltip — while real `usage` from completed events sits unused (`widget-footer.tsx:135-139`, `widget-run-reducer.ts:106`). Use real usage or remove the ring.
- **Dark-mode remnants contradict the no-dark policy**: a full `.dark` token block, `dark:` utilities in two components, a docs-app Dark toggle, and a unit test _enforcing_ graphite-tracks-host-dark. Decide and align (policy says: no dark).
- **Mobile bottom sheet is not implemented** (design record says floating panel → bottom sheet on mobile; it's a fixed card at every viewport).
- **Dead pile:** ~8 unreachable shadcn components (carrying the banned idioms), the broken `./showcase` export (iframe src points at a nonexistent file, would poll forever), dead public props (`initialState`, `onMinimize`, `resolveRun` required-but-unused), dead tokens, stale `dist/`. In a template, dead code reads as endorsed style — purge it.
- **Copy/theming drift already happening**: theme names duplicated in two files, theme-id unions in three, appearance tables duplicated verbatim in two (`use-widget-appearance.ts:62-125` vs `widget-appearance-style.ts:1-64`). Single-source in `entities/theme` + write the "add a theme" checklist (currently 5 undocumented touch points).
- **Composer correctness**: Enter ignores IME composition (CJK users send mid-composition); the textarea is disabled during streaming and drops focus; the "Send with Ctrl+Enter" setting is a placebo wired to nothing (`composer.tsx:114,202-214`, `settings.tsx:121`).
- **Isolation claims**: root README says "shadow-DOM-isolated widget" — false; isolation is the iframe (shadow DOM exists only in the docs app). The stylesheet is page-global outside the iframe (Tailwind Preflight + bare `[data-slot=…]` selectors that will restyle a shadcn host). Fix the claim; add a loud "iframe-only, or scope it yourself" warning.
- Fixture data leaks the developer's private session names into shipped demo components (`conversation-grouping.tsx:70-92`); fonts ship as 240 KB raw TTFs beside the 27 KB woff2; hardcoded copy ("I can see the page you're viewing" — shown even with no host bridge) blocks rebranding/localization — `SideChatWidgetLabels` covers exactly three strings.

---

## 8. Performance & scaling — the direct answer

**Vertical: no, you didn't mess up.** Quantified by review: the 250 ms coalescer caps event rate at ~4/s per turn regardless of provider token rate; **zero DB writes per streamed delta**; ~10-15 short queries at pre-start + ~5-7 at finalization + 1 lease update/10 s; SSE is pull-based, holds no pooled connections, and bounds a stuck client at a 256-event dropping queue; one active turn holds ~3× the answer text in memory; the widget re-renders only the streaming message per delta (memo + identity-preserving projection), history capped at 100 messages. Realistic ceilings: ~10k SSE connections per Node instance, thousands of concurrent turns per small Postgres. No event-loop hazards, no hot-path logging.

**Horizontal: broken at 2 instances today** — the gaps in §2 (stream affinity, host-command affinity, orphan recovery). The turn-independent model you want is compatible with the current design once §2.1/§2.2 land; the cancel and activity channels already work cross-instance correctly (poke-don't-payload NOTIFY, ~200-byte payloads, 2-3 per turn — nowhere near limits).

**Cheap wins before ~10⁶ rows:**

- Partial index `assistant_turns(workspace_id, subject_id) WHERE status='running'` — the activity snapshot currently **seq-scans on every widget mount/tab-refocus** (`turn-lookups.ts:80-95`).
- Index `usage_records(workspace_id)` — `/usage` is a full-table scan+aggregate growing forever (`usage.ts:56-76`).
- Drop `messages_conversation_sequence_desc_idx` (exact duplicate of the unique index; pure write overhead).
- **SSE heartbeat comments every ~20 s** — idle activity streams send zero bytes, so LB idle timeouts (ALB default 60 s) kill them; each reconnect fires the unindexed snapshot scan plus a list refetch. (Fix the decoder crash from §5 first.)
- Expose pg `Pool` `max` (and TLS) through `sidechat.config.ts` — currently hardcoded defaults, contradicting the config-driven rule (`postgres-drizzle/index.ts:15-28`).
- No retention policy exists for `assistant_turns`/`usage_records`/`audit_events` (~3.6 M rows/yr at 10 k turns/day) — fine for years, but the (currently dead) retention knobs suggest otherwise; document reality.
- No load test or benchmark exists in the repo; one autocannon script + one "N concurrent streaming turns" harness test would anchor regressions.

---

## 9. Readability & onboarding

Strong overall — naming tracks the vocabulary doc, spine functions read top-down, file sizes respect the budgets, per-folder READMEs genuinely help. Specific friction:

- `partner-ai-core`: 71 files / 36 directories for 8.2k lines (~2 files per folder) — the tree communicates a system 4× the size. Collapse single-file folders; merge the twin observability files; rename the `domain/capabilities.ts` / `domain/capabilities/` twins.
- `HostCommandCapability` is two different types in two packages, and the docs link one each (`host-bridge/src/commands/capability.ts:18-23` vs core `contracts/capabilities.ts:170-175`). Rename one.
- Two `toRuntimeError` functions with different semantics; two `readString` families with different signatures; `ToolCatalog` aliasing `ToolRegistry` — cheap renames.
- The dual error channel (Effect failure vs streamed `runtime.error`) is the one concept no README teaches — a short "before the stream opens you get a failure; after, an event" table.
- Sequence semantics doc says "+1 per event" while validators accept gaps (deliberate, for resume) — specify "strictly increasing; server stream additionally gap-free by construction".
- Dead vocabulary: `sidechat.history` (never emitted, explicitly ignored), `event_log_conflict` error code (no thrower), `PROGRESS` activity kind and `images` details (no producer), `StreamChatInput.abortSignal` (deliberately never set in production but threaded through the title path — an adopter copying that pattern reintroduces the coupling the runner removed).

---

## 10. Prioritized action plan

**P0 — before anything else (all small except the affinity decision):**

1. Decide and implement the stream-affinity story (§2.1: fail-fast + sticky docs, or stream-from-POST) — and write **ADR-0010** superseding 0009.
2. Reinstate the orphan sweep calling `reapExpiredTurns` with the widened predicate (§2.2); make heartbeat renewal retry once.
3. Docs truth pass (§2.4): rewrite streaming sections of README / assistant-turn / system-map / db README; purge "reaper backstops it" comments; delete dead reaper/pruner/retention config knobs.
4. Fix the fake-provider quick start (§3) and log the silent config fallback.
5. Add `pool.on("error")` / `client.on("error")` + LISTEN reconnect loops (§6 — prevents process crashes).
6. Add minimal CI (`npm run verify` + `test:db:container`) and a LICENSE.

**P1 — the template promise (each independent, small-to-medium):** 7. Widget resilience set (§2.3): retryable transport errors, run→history handoff on terminal, inactivity watchdog, dense-gap fix in the subscription stream, synthetic terminal on the success path. 8. Terminal semantics set (§5): blocked through sequence validator + schema + completeness test; aborted → CANCELLED in the reducer; no Retry for blocked; skip resolved host commands on replay; decoders skip comment frames. 9. Seams set (§4): injectable `authVerifier` + subject-scoped turn routes; real tool-registration map; `createRuntimeToolFromPromise`; `renderActivityItem` prop; call-settings bag; delete the dead Effect Layer machinery; port-contract invariants written down. 10. Correctness set (§6): `FOR UPDATE` on appendMessage + observe fiber exits; conversation key from requestId; abort part → terminal; single-terminal enforcement in the runner; fail-open telemetry. 11. The two DB indexes + SSE heartbeats + Pool config (§8).

**P2 — polish while it's cheap:** 12. Widget UI pass (§7): e2e reconciliation, render-or-cut tool results/sources, dark-mode cleanup, theme single-sourcing + recipe, composer IME/focus fixes, dead-code purge, isolation claims. 13. Core folder flattening + naming de-collisions (§9); "add a table" and "graduating from day-one migrations" runbooks; rename `partner-ai-*` or add the glossary.

---

## 11. Per-area verdicts

| Area                                    | Verdict                                                                                                                                                |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `ai-runtime-contract` + `agent-runtime` | Solid foundation. Small contract, excellent fake provider, real isolation. Fix abort/terminal mapping, add param seam + promise tool factory.          |
| `partner-ai-core`                       | Strong core, better than most production code. Delete the dead Layer path, fail-open telemetry, document port invariants, flatten the tree.            |
| `apps/partner-ai-service`               | Best-crafted code in the repo, but the composition sells seams (auth, tools) that aren't pluggable and the boot path can silently swap config systems. |
| `packages/db`                           | Excellent patterns (parity suite, lease CAS) — but the README/comments describe a deleted design, and the connection layer can crash the process.      |
| `chat-protocol` / `host-bridge`         | Strong contract discipline; the blocked/schema/completeness gap is the one structural risk; host-bridge is clean and transport-agnostic.               |
| `side-chat-widget` (state)              | Good architecture (pure reducer, minimal public API); resilience half-built — resumability breaks exactly where it matters.                            |
| `side-chat-widget` (UI)                 | Token/theming system is the real thing; protocol content unrendered, stale e2e, dead code pile — mid-molt, fixable in days.                            |
| Template/DX                             | Governance tooling is genuinely impressive, but there's no CI to run it, no LICENSE, and the first documented command crashes.                         |
| Performance                             | Vertical: excellent, quantified. Horizontal: blocked by §2; two missing indexes; otherwise clean.                                                      |

---

_Method note: findings marked with file:line were reported by area reviewers reading the code directly; the streaming pivot (git `9961a6e`/`be8303f`/`349ba73`), the quick-start boot failure, the absence of `.github` and `LICENSE`, and the memory-vs-code status of the widget and host-command seams were additionally re-verified by hand during synthesis. One reviewer pass (template/DX) lost its final report to a usage limit after 79 tool calls; its critical checks (first-run, CI, LICENSE, docs accuracy) were re-run manually and are included above._
