# AI SDK 7 Rewrite Knowledge Base

Read this when: implementing any step or verifying an SDK API, limit, or behavior.

Source of truth for: verified AI SDK 7 facts, gotchas, and configuration obligations for this program.

Not source of truth for: the API of a future SDK release. Re-verify against installed declarations after every version bump and update this file.

## Verified baseline

- Research date: 2026-07-10. Versions on npm that day: `ai@7.0.20` (clone HEAD at 7.0.21), `@ai-sdk/openai@4.0.11`, `@ai-sdk/azure@4.0.11`, `@ai-sdk/provider@4.0.3` (protocol `LanguageModelV4`), `@ai-sdk/react@4.0.21`, `@ai-sdk/otel@1.0.20`, `@ai-sdk/workflow@1.0.21`, `workflow@4.6.0`, `@workflow/world-postgres@4.3.0`.
- Source clone: `.reference/ai-sdk-v7` (sparse: `packages/ai`, `packages/workflow`, `packages/provider`, `packages/provider-utils`, `packages/react`). Ignored reference material — re-pull when the pinned version changes. File:line references below are against this clone.
- Requirements: Node ≥22, ESM-only. Repo already ships Node 24 + ESM.
- Step 02a pins the exact versions; record them here when selected.

## The wire protocol

- UI message stream `v1`: documented SSE spec, versioned by required header `x-vercel-ai-ui-message-stream: v1`, terminated by `data: [DONE]`. Explicitly intended for custom backends/frontends. Spec: ai-sdk.dev/docs/ai-sdk-ui/stream-protocol.
- Part types include `text-*`, `reasoning-*`, `tool-input-*`, `tool-output-available/denied`, `tool-approval-request/response`, `source-*`, `file`, `data-*` (typed custom parts), `error`, `start-step/finish-step`, `finish`, `abort`.
- Server helpers are stateless top-level functions: `createUIMessageStream`, `createUIMessageStreamResponse`, `toUIMessageStream`, `readUIMessageStream`. Result-attached helpers are deprecated. `onFinish` → `onEnd` naming everywhere.
- A stream that ends without a `finish` chunk is treated as an error (this is also `WorkflowChatTransport`'s reconnect trigger).
- Client-facing stream errors default to a generic `"An error occurred."` (`create-ui-message-stream.ts:30`) — aligned with our scrubbing policy; override `onError` to add our error-code vocabulary, never raw messages.

## WorkflowAgent / Workflow DevKit facts

- `@ai-sdk/workflow` exports `WorkflowAgent`, `WorkflowChatTransport`, `createModelCallToUIChunkTransform`. Agent is `stream()`-only (`generate()` throws — `workflow-agent.ts:1307`). It writes `ModelCallStreamPart`s to a `getWritable()` from `workflow`; convert to UI chunks at the response boundary. This is a two-vocabulary design (engine parts ≠ wire chunks) — same shape as the old RuntimeEvent architecture.
- **One model call = one workflow step** (`do-stream-step.ts:114`). The journaled step result is deliberately compact — concatenated text + metadata, no per-chunk arrays (`do-stream-step.ts:86-94`). Each server tool execution is also a step.
- **Every stream part is written individually** to the writable (`do-stream-step.ts:246-248`) and the SSE path has zero batching (`json-to-sse-transform-stream.ts`). Postgres World batches inserts on its flush interval but retains one row per chunk; Step 02b measures the deployed shape and later capacity/pruning steps own tuning.
- Crash mid-model-call: the step re-runs → the model call is redone (re-billed; text may differ). The client-side `normalize-ui-message-stream.ts` repairs framing and drops replayed chunks for already-ended parts.
- Hooks (`createHook`/`resumeHook`, from `workflow`) suspend a run durably with a deterministic token; resume goes through Postgres, so any instance can accept the resume call. This is the native replacement for the host-command poll-and-notify relay.
- Approval code exists inside `WorkflowAgent`, but the pinned compiled Workflow end-to-end path is **not yet proven safe**: `workflow-agent-e2e.integration.test.ts:219-227` labels `needsApproval` a GAP and observes immediate execution. Step 12 must reproduce this against the exact pins before choosing its mechanism. Approved responses are re-validated by the core validator when that path is active; HMAC signing remains core/ToolLoopAgent-only.
- Self-hosting: `@workflow/world-postgres` (stable-labeled; graphile-worker job queue, NOTIFY/LISTEN realtime, `WORKFLOW_POSTGRES_URL`, bootstrap CLI). Hono is supported through the Nitro build wrapper. Known risk: vercel/workflow#611 reports stuck self-hosted jobs; Step 02b's permanent crash/cross-instance suite is the acceptance evidence.
- No self-hosted deploy-versioning story: a run suspended across a deploy replays its event log against new code. Replay compatibility across deploys is our discipline (keep workflow function bodies stable; version tool names).
- Serialization boundary: everything crossing a step boundary must be serializable. Tools are serialized (zod → JSON Schema, Ajv-reconstructed inside the step — `do-stream-step.ts:122-127`). No closures over live services; services reachable from module scope inside step code; contexts are plain data.
- `sendFinish: false` / `preventClose: true` compose multiple agents into one stream (sub-agent orchestration support).
- `WorkflowChatTransport`: auto-reconnect on missing `finish`, `startIndex` offsets, `maxConsecutiveErrors` (default 3), requires the POST response to return `x-workflow-run-id` and a `GET {api}/{runId}/stream` route.
- Telemetry on the workflow path is a bridge marked TODO(#12164) — "approximately compatible" with core telemetry types. Expect churn.

## Workflow DevKit source facts (verified in `.reference/workflow`, clone of vercel/workflow, 2026-07-10 HEAD)

- **License/governance**: Apache 2.0, DCO contributions, public monorepo. The compiler is a Rust SWC plugin (`swc-plugin-workflow`); adapters exist for next/nitro/nuxt/sveltekit/astro/vite/nest/vitest.
- **World abstraction**: `World = Queue + Streamer + Storage` (three interfaces in `packages/world/src/interfaces.ts`); official worlds: local, postgres, testing, vercel (`worlds-manifest.json` marks them `type: "official"`, implying third-party worlds are expected). `world-postgres` runs on plain `pg` + drizzle + graphile-worker; `world-vercel` is where the Vercel-hosting specials live (E2E encryption, deployment/skew resolution, their events API).
- **Chunk write batching EXISTS**: the core buffers stream writes with a flush interval—default **10ms**, override `WORKFLOW_STREAM_FLUSH_INTERVAL_MS` or `world.streamFlushIntervalMs` (`packages/core/src/serialization.ts:863-870`). A flush with >1 buffered chunk uses `writeMulti` → **one batched INSERT** (`world-postgres/src/streamer.ts:172-206`). Buffer clears only after successful write. Rows remain one per chunk/part, and `pg_notify` fires per chunk even inside a batch. Step 02b permanently measures rows/round trips; Step 07 owns any row-reducing delta coalescing.
- **Streamer design** mirrors the old Side Chat pattern: durable rows + one dedicated LISTEN connection per instance (topic `workflow_event_chunk`) + monotonic ULID chunk ids for order/dedup; replay (`get()`) loads the stream's chunks and tails live, supports negative `startIndex`; `getChunks` is cursor-paginated (default 100).
- Observed dependency note: `world-postgres` also depends on `@vercel/queue` (verify its role at pin time).

## Gotchas (each one bit someone; all source-verified)

1. **Gateway trap**: a string model id routes through Vercel AI Gateway (`do-stream-step.ts:117-120`; also `globalThis.AI_SDK_DEFAULT_PROVIDER`). Self-hosted must pass provider instances everywhere. Governance should reject string models.
2. **No default timeouts** (`request-options.ts` — all extractors return undefined). Core `streamText` supports `timeout: number | { totalMs, stepMs, chunkMs (idle watchdog, per-chunk reset), toolMs, tools: {<name>Ms} }`; `WorkflowAgent.stream()` accepts only a plain total number. Timeout aborts are `DOMException` name `TimeoutError`, never retried.
3. **No SSE heartbeat** in core (no `setInterval` anywhere; only a `keep-alive` header hint plus `x-accel-buffering: no`). Idle-timeout proxies drop quiet streams. We add keepalive at our edge.
4. **Retry stacking**: SDK `maxRetries` default 2 (2s→4s deterministic, no jitter; only `APICallError`/`GatewayError` with `isRetryable`; `Retry-After` honored capped 60s) × workflow step retries default ~3. Set SDK retries to 0 in workflow context.
5. **Step defaults differ**: `streamText` stops after 1 step (`isStepCount(1)`); `ToolLoopAgent` defaults to 20 with no ceiling. Always set `stopWhen`.
6. **Full response buffered in RAM per active stream** (`stream-text.ts` recordedContent) — fine at our scale; know it exists.
7. **Message array rebuilt per step** (O(K²) churn; reasoning re-sent in history each step) — inherent chat cost, watch long agentic turns.
8. **Process-level globals**: `AI_SDK_DEFAULT_PROVIDER`, `AI_SDK_LOG_WARNINGS`, `AI_SDK_TELEMETRY_INTEGRATIONS` — no per-request isolation. Register telemetry once at boot.
9. **`smoothStream` is not a batching tool** — it rate-limits (10ms/chunk) while re-chunking. Do not use it to reduce DB writes; use our own transform in front of the writable if measurement demands it.
10. **`experimental_` prefixes are load-bearing** (`experimental_transform`, `experimental_toolApprovalSecret`, sandbox, several callbacks). Pin exact versions; expect renames on bumps.
11. Instructions security: `instructions` replaces `system`; system-role messages in the array are rejected by default (`allowSystemInMessages: false` everywhere, including WorkflowAgent). Never enable the escape hatch.
12. **`run.cancel()` does not stop the underlying provider step.** Workflow's cancellation guide states both hard cancellation and a stop hook can leave the current model/HTTP step running. User-facing cancellation therefore needs the supported cross-process/distributed abort pattern to deliver an `AbortSignal` into `WorkflowAgent.stream`, plus a durable terminal transition. `run.cancel()` is only a forced-run fallback.

## Approvals

- `toolApproval` policies on core/ToolLoopAgent support fixed or per-input decisions. WorkflowAgent exposes `needsApproval`, but the pinned compiled E2E path currently documents it as ignored; treat it as unavailable until Step 12 proves otherwise.
- Approval state lives entirely in message parts — stateless server-side; a pending approval ends the loop naturally; resume is a new call with the `tool-approval-response` appended.
- HMAC: `crypto.subtle` HMAC-SHA256 over `approvalId\ntoolCallId\ntoolName\ninputDigest` (canonical SHA-256), opt-in via secret. Client cannot forge or retarget an approval.
- What stays ours: who may approve (auth context), audit record, expiry policy, the widget card UI.

## Client tools, MCP, sub-agents

- Client tools: tool without server `execute` → stream carries the call → browser `onToolCall` → `addToolOutput` → continuation. `dynamic-tool` parts support request-time tool catalogs (the per-request host capability list maps to this).
- On the workflow branch, a server-side waiting variant exists: tool `execute` creates a hook and races it against a durable `sleep(timeout)`; the browser result endpoint validates ownership then `resumeHook`. Survives restarts; any instance accepts the result.
- MCP: production-ready `createMCPClient()` (HTTP/streamable-HTTP; stdio dev-only), `mcpClient.tools()`, OAuth, elicitation handler, `fingerprintTools()`/`detectToolDrift()`. Drops into the same tool set.
- Sub-agents: no `agent.asTool()`; wrap a sub-agent call in a `tool({ execute })`, optionally streaming progress up via async-generator execute + `readUIMessageStream`.

## Widget integration

- `useChat` (React) + transport abstraction: `DefaultChatTransport` (api/headers/credentials/body as functions; `prepareSendMessagesRequest`, `prepareReconnectToStreamRequest`), `WorkflowChatTransport` on the workflow branch. Headless `AbstractChat` exists but is less contractually stable than the wire spec.
- `UIMessage` is both the stream shape and the recommended persistence shape (`validateUIMessages` on load; save in `onEnd`; server-side ids via `generateMessageId`). This collapses the old HistoryMessage/stream duality.
- Multi-tab: each tab holds its own SSE reader over the durable run stream (workflow branch); tab discovery of an active run is ours (store runId on the turn row; "active turn for conversation" query).

## Scale model (for capacity settings)

- The costly unit is a **concurrently generating turn**, not tabs/users. Browser tabs cost one Node SSE socket each; Postgres connections are per-instance pools (~10-15), constant regardless of tabs.
- Mid VM pair ≈ 100–200 comfortable concurrent generations ≈ 500–1,000 simultaneously chatting users at ~20% duty cycle. Provider rate limits/bill bind first — admission control is the knob that keeps load chosen rather than discovered.
- Chunk-log growth is bounded by pruning completed runs (replay for finished turns is disposable once the final message is persisted).

## Regulated-deployment notes (UBS direction, 2026-07-11)

User decisions/context: CID is pre-filtered by a small local model before anything reaches the AI provider (not our problem to solve); compliance posture is likely **retain-everything** (financial records), not delete-after-N-days.

Consequences for the architecture:

- **Two data classes, two fates.** The _business record_ (what the user saw and did) lives in OUR tables — messages (full `UIMessage` incl. tool inputs/outputs in parts), turns, approval audit. These are retained per the bank's schedule, potentially years. The _workflow journal/chunk log_ is an operational execution log duplicating content plus mechanics; its classification (record vs operational) is a compliance decision, not engineering. Safest default: make the product tables the complete record, treat workflow tables as operational.
- **Pruning becomes archive-then-prune** where the journal is classified a record: export completed runs' journals to the bank's immutable archive (WORM-style) before deleting from the hot operational tables. Never keep years of journal data in the runtime Postgres — it bloats the tables the worker queries.
- Retain-everything raises the stakes on encryption at rest + access control (a years-deep honeypot) and adds: legal-hold capability, tamper-evidence expectations (append-only/WORM archive), and partition/archive strategy for the messages tables at scale.
- The UIMessage-as-durable-format decision (Step 09) is what makes this cheap: one complete validated replayable record of everything shown to the user, including tool I/O, in one table family. Approval audit rows carry input digests that link to the full inputs already present in message parts.
- WorkflowAgent approval risk has two parts: no HMAC and a pinned compiled-path GAP where `needsApproval` may be ignored. Authenticated ownership checks and SDK re-validation address only the first. Step 12 must prove that execution cannot occur before a durable Side Chat decision; otherwise use a durable hook-based gate around tool execution rather than trusting `needsApproval`.

## What stays Side Chat's (no native equivalent)

Authentication, workspace/tenant ownership checks, approval policy + audit records, connected-client gating decisions for client tools, error-code vocabulary and scrubbing, conversation/message persistence and reads, run-id discovery for reattachment, admission control, the widget UI/design system, host-bridge page integration.

---

# Decision history and rationale — 2026-07-10 session record

This section preserves how and why this program came to exist, so nothing depends on chat history. It is a historical record, not implementation instructions; the steps and the sections above own those.

## 1. Where this started

The session began as a review of `plan/effect` (the 16-step Effect v4 ground-up rewrite). The review found the plan well-engineered but flagged: (a) a factual premise error — the plan treats the turn event log as "durable/PostgreSQL truth," but the actual event log is an in-memory per-instance registry (the `turn_events` table was deliberately deleted in the connection-bound streaming rework); (b) Step 08 is a big-bang cutover with the architecture checkpoint placed after deletion; (c) an unintegrated sibling plan, `.omx/plans/ai-sdk-v7-upgrade.md`, written against AI SDK 6 assumptions and overlapping the effect plan on four workstreams (behavior freeze, runtime/tool cycle, timeout ownership, observability).

The user then invoked the pre-alpha posture explicitly: the current architecture, protocols, and past decisions carry no authority; decisions made before AI SDK 7 existed (released 2026-06-25, after the original architecture was designed) must be re-derived; the custom stack must justify its existence against native features — not the reverse. The user reopened: `AiRuntimePort`, `RuntimeEvent`, the Effect-stream lifecycle, connection-bound SSE, lease/reaper, and widget recovery.

## 2. How the facts were established

Four parallel research agents against primary sources (ai-sdk.dev docs, vercel.com blog/changelog, github.com/vercel/ai and vercel/workflow docs, npm) plus one local inventory agent over this repo; then a direct source read of the v7.0.21 clone (`.reference/ai-sdk-v7`, sparse: ai, workflow, provider, provider-utils, react) including `workflow-agent.ts`, `do-stream-step.ts`, `stream-text-iterator.ts`, `normalize-ui-message-stream.ts`, plus an agent sweep of `packages/ai/src` internals. Verified facts live in the sections above with file:line citations. MCP and sub-agent support were verified by direct doc fetches. AI SDK 7 postdates the model's knowledge cutoff — nothing here is from memory.

## 3. The per-subsystem verdicts and their reasons

- **`sidechat.v1` (≈1,500 src lines) + the double mapping chain (≈2,850)**: demote from protocol to _profile_. ADR 0004's rejection of vendor stream shapes was correct when the SDK stream was an undocumented internal format; v7's stream is a versioned public spec with typed `data-*` extension parts. What survives is the product vocabulary (error codes, host dispatch metadata) and the scrub/narrowing policy (~200 lines); what dies is the transport engineering (codecs, validators, envelopes, the RuntimeEvent→wire hop). Accepted trade, recorded deliberately: version sovereignty — Vercel protocol bumps become our migration events, mitigated by exact pins and the profile doc.
- **`resumable-stream` package**: rejected outright — requires Redis, replays already-produced chunks only, does not recover a crashed generation. Functionally the deleted `turn_events` design with an extra infrastructure dependency.
- **WorkflowAgent + Workflow DevKit + Postgres World**: chosen as the default durable substrate, subject to a narrow permanent compatibility gate. For: crash-resumable turns, persisted multi-client streams with `startIndex`, hooks, and Postgres-coordinated multi-instance continuation. Against: Nitro compiler adoption, at-least-once steps and repeated model cost after a crash, no self-hosted deploy-versioning story, issue #611 risk, young telemetry, and an approval GAP in the pinned compiled E2E path. These feature/operations gaps are not reasons to rebuild an execution engine; only failure of the five load-bearing acceptance invariants selects ToolLoopAgent fallback.
- **Host commands**: recognized as client-executed tools wearing a custom protocol. The hard problem the old 1,600-line stack solved — "a result must find the waiting agent across instances" — dissolves natively two ways: on the plain path there is no waiting agent (state rides in messages; any instance continues on resubmission); on the workflow path the wait is a durable hook and `resumeHook` goes through Postgres. What survives is policy: ownership binding, connected-client decision, timeout, browser-side dispatch dedupe.
- **Lease/heartbeat/reaper (≈430 src + 643 test)**: deleted at cutover on either substrate. Workflow makes it unnecessary; fallback deliberately accepts request-bound single-instance semantics instead of carrying the old recovery subsystem into the new wing.
- **Connection-bound turn-stream + in-memory event log (≈800)**: deleted at cutover on either substrate. Workflow replaces it with persisted run streams; fallback uses the direct AI SDK request stream and documents that disconnect/crash recovery is unavailable.
- **Widget state layer (≈4,870 src non-UI)**: replaced by `useChat` + branch transport. Everything the reducer/subscription/recovery-ladder/markers do by hand (sequence dedup, terminal guards, watchdog+backoff+poll, reattach markers) is what the native client + `WorkflowChatTransport` do. Component library, themes, design system, host-bridge, and TanStack Query read paths are untouched. User explicitly chose this ("the rest can be thrown away and simplified with Vercel hooks... we need to do that").
- **Approvals (did not exist)**: adopt the AI SDK approval vocabulary and core validation, but do not assume Workflow durability from API shape alone. The pinned E2E GAP makes Step 12 responsible for proving or composing a safe durable wait before any gated tool can execute. Ours forever: who may approve, audit record, expiry, and card UI.

## 4. Effect-as-core vs AI-SDK-as-core

The user posed it directly: Effect raises complexity; the SDK is a hard dependency but lowers complexity/support/LOC. Verdict reached: **AI SDK as core; plain TypeScript composition; no Effect in the new wing.** Reasoning: (a) the effect plan's heart (supervision, host-command rebuild, retries, capacity, PubSub fan-out) builds infrastructure the SDK/Workflow now ships; (b) after native adoption, the residue—auth, policy, scrub, DB reads, shutdown, admission—is straightforward TypeScript; (c) Effect v4 beta churn would touch every signature while the SDK is already the unavoidable product dependency; (d) future contributors pay the Effect literacy cost on every feature, but the SDK migration cost mainly at version boundaries. The same conclusion applies to fallback: it is a clean ToolLoopAgent architecture, not an excuse to retain the existing Effect runtime. `plan/effect` remains untouched on disk and is superseded in fact if this program completes.

## 5. LangGraph comparison (user had rejected it earlier)

v6 lacked LangGraph's checkpointing/interrupts/multi-agent; the user resisted LangGraph anyway (Python-first, second runtime, weak embeddable-chat-UI story). v7 closes the feature gap in-process and in-language: WorkflowAgent ≈ checkpointing, native approvals ≈ interrupts, subagents pattern ≈ multi-agent, MCP ≈ tool ecosystem — with the UI/stream story LangGraph never had. LangGraph still wins for explicit complex DAGs, Python ML ecosystem, LangSmith maturity — not this product's shape. The user's earlier instinct is confirmed with better evidence.

## 6. Scale analysis (reasoning behind the numbers in "Scale model")

Two connection layers: browser tabs hold Node SSE sockets (thousands per instance, near-free); Postgres connections are per-instance pools (~10–15, constant regardless of tabs; one shared LISTEN connection per instance). Postgres connections scale with instances, not users. Cost ladder: tabs → no; connections → no; NOTIFY → no; chunk-write throughput → first real bound, scaling with _concurrently generating turns_; job queue → same order. Estimate: mid VM pair ≈ 100–200 comfortable concurrent generations ≈ 500–1,000 simultaneously chatting users at ~20% generation duty cycle—with provider limits/bill binding first. Source now confirms flush-interval batching reduces round trips but still stores one row per chunk. Step 02b measures the real app; Steps 07/10/17 own coalescing, pruning/archive, and capacity decisions.

## 7. Why validation is retained architecture, not a spike

Source inspection proves intended semantics but cannot prove Nitro/monorepo coexistence, hard-crash pickup, cross-instance continuation, reconnect output, or prompt provider cancellation in this deployment. Those are still mandatory validations. The corrected plan builds the real foundation first and keeps its compatibility tests permanently. This avoids two bad outcomes of a throwaway spike: proving a different composition than production and deleting the only executable evidence for future dependency upgrades.

## 8. Validation of the existing architecture (what the old code got right)

Reading both codebases side-by-side, the old app and v7 independently converged on: engine-vocabulary ≠ wire-vocabulary with one edge transform (RuntimeEvent chain ↔ ModelCallStreamPart→UIChunk); log-is-truth/signals-are-hints (in-memory event log + dispatcher + safety poll ↔ persisted chunk log + NOTIFY); replay-then-live with idempotent dedup (dense sequences ↔ part-framing repair — ours stronger); durable-state-over-in-memory-promises for cross-instance results (host-command rows ↔ message-borne approvals); hostile-browser hygiene (frame/payload cross-checks, turn-bound settle ↔ null-prototype maps, HMAC, system-in-messages rejected); scrub-at-the-edge error policy; single retry owner (`maxRetries: 0` ↔ "workflow steps own retries"); don't-persist-the-fat-stream. Places the old code is _more_ hardened than v7 core: SSE heartbeats (core has none), jittered retries (core deterministic), dense end-to-end sequences. Conclusion recorded for morale and for review judgment: the rewrite happens not because the design was wrong but because the vendor now maintains a converged version of it.

## 9. User decisions locked this session

1. AI SDK 7 is the core; SDK-native by default; custom must justify itself.
2. Greenfield wing, not in-place migration ("we don't care about drift... we build final version"); old app untouched until cutover deletion.
3. Plain TypeScript new wing; no Effect in new code.
4. Strict AI SDK naming for every concept the SDK has.
5. As-native-as-possible feature shape: cut or rethink features rather than invent/support custom equivalents ("don't want to invent and support what exists").
6. Multi-instance: native on the Workflow substrate; fallback is a clean new-wing ToolLoopAgent single-instance architecture. The current custom connection-bound runtime is reference code only and is deleted at cutover; no custom multi-instance build exists in either path.
7. Widget: adopt `useChat`/native hooks; only the component library and design system are sacred.
8. Tool approvals wanted as a product feature (SQL-approval-card style UX shown as the reference).
9. `plan/effect` stays byte-identical as historical research material; canonical docs and `plan/v7` record the superseding architecture.
10. Old data is disposable pre-alpha (schema reset, no migrations).

## 10. Future-feature compatibility checked during the session

- **RAG**: app-layer regardless (chunk/embed/retrieve; pgvector on existing Postgres); retrieval is just a tool; bulk ingestion fits the workflow runtime as durable batch jobs. No conflict.
- **MCP**: production-ready in v7 (`createMCPClient`, HTTP/streamable-HTTP, OAuth, elicitation, tool-drift detection) — drops into the same tool set whenever wanted.
- **Sub-agents**: documented pattern (agent wrapped in a `tool()` execute, streaming up via async-generator + `readUIMessageStream`); `sendFinish`/`preventClose` compose multiple agents into one stream. `HarnessAgent` exists (experimental) for prebuilt harnesses. No cross-service A2A protocol — MCP or custom if ever needed.
- **DB load control**: pruning/archive, schema/DB isolation, worker/pool/flush tunables, optional coalescing, and admission control; measured by permanent compatibility and lifecycle tests, then owned by Steps 07, 10, 17, and 19.
