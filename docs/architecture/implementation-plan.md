# Side Chat Harness Implementation Plan

Date: 2026-06-13

Status: active implementation plan for the target architecture in
`docs/architecture/production-system-design.md`.

## Requirements Summary

Side Chat is becoming an embeddable AI harness framework for ordinary web
applications. The implementation plan must move the repo from a current-message
chat scaffold toward a governed harness with:

- host capability manifests;
- server-side assistant profiles and policy decisions;
- durable conversation and turn lifecycle;
- authoritative context management;
- context budgets, manifests, hashes, and trust zones;
- history windows, summaries, and compaction;
- tool governance and tool-result lifecycle;
- retrieval and ingestion;
- memory extraction, supersession, and selection;
- multi-agent workflow orchestration;
- observability, evals, and Effect layer composition.

The main product invariant is:

```txt
partner-ai-core owns what the model sees and what the turn is allowed to do.
agent-runtime executes one prepared turn.
host apps register capabilities instead of bypassing the harness.
```

## Planning Principles

1. Repair the existing turn spine before adding RAG, memory, or multi-agent
   features.
2. Add deep modules with small interfaces: context manager, policy resolver,
   tool manager, workflow engine, memory manager, and retrieval manager.
3. Preserve package seams: product harness decisions live in
   `packages/partner-ai-core`; provider/tool-loop execution stays in
   `packages/agent-runtime`; adapters stay in app or package edges.
4. Every phase must add tests or evals that prove the behavior at the module
   interface.
5. Every model-visible input must eventually have a manifest entry, trust label,
   token cost, source id, and redaction policy.
6. Tools and host commands must fail closed. Registration is never permission.
7. Multi-agent work must have workflow state, isolated context, budgets,
   artifacts, cancellation, and audit. It is not just a tool call to another
   model.

## Current Anchors

These files are the main current anchors for the work:

- `docs/architecture/production-system-design.md`: target architecture.
- `docs/architecture/overview.md`: concise architecture orientation.
- `docs/architecture/partner-ai-core-boundaries.md`: core ownership rules.
- `packages/partner-ai-core/src/application/stream-chat/*`: current core turn
  workflow.
- `packages/partner-ai-core/src/ports/index.ts`: current core port shapes.
- `packages/partner-ai-core/src/services/effect-runtime.ts`: current Effect
  service/layer wiring.
- `packages/agent-runtime/src/runtime/contract/runtime-request.ts`: richer
  runtime request already exists.
- `packages/agent-runtime/src/runtime/turn/tool-selection.ts`: current runtime
  tool selection behavior.
- `apps/partner-ai-service/src/inbound/http/routes/chat-stream.ts`: HTTP to core
  stream entrypoint.
- `apps/partner-ai-service/src/adapters/persistence/service-persistence.ts`:
  current post-stream persistence path.
- `packages/db/src/schema-contract/repositories.ts`: current persistence
  contract.
- `packages/side-chat-widget/src/features/chat/model/use-widget-chat.ts`:
  widget stream state.
- `packages/side-chat-widget/src/entities/chat/model/widget-chat.ts`: widget
  request construction.

## Global Acceptance Criteria

The target architecture is achieved when:

1. Host apps can register tools, commands, retrieval sources, assistant profiles,
   workflows, approval rules, memory policies, and UI activity renderers through
   a validated capability manifest.
2. `partner-ai-core` produces a `TurnPolicyDecision` before runtime execution.
3. `partner-ai-core` produces a `PreparedTurnContext` before runtime execution.
4. The runtime request includes profile id, context board, prepared messages,
   and explicit tool allowlist.
5. Assistant turns start before provider execution and always complete, fail,
   abort, or time out durably.
6. The context manager owns candidate gathering, trust labels, token budgeting,
   rendering, snapshots, and manifests.
7. Conversation history is loaded server-side through authorized history ports
   and assembled into context through budget policy.
8. Long conversations compact into durable summaries with a preservation
   contract and checkpoint.
9. Retrieval uses ingestion, chunking, embeddings, hybrid search, source
   metadata, citations, and evals.
10. Memory uses extraction, provenance, supersession, selection, and user or
    workspace scope.
11. Tools are fail-closed, policy-exposed, audited, capped, summarized, and
    replay-safe.
12. Multi-agent workflows have durable workflow runs, node records, isolated
    context, budgets, artifacts, cancellation, and streamed progress events.
13. Observability can reconstruct a turn or workflow from request to final
    answer, including context manifest, retrieval, memory, tools, usage, cost,
    and failures.
14. Evals cover context assembly, compaction, retrieval, memory, tool use,
    workflow results, and prompt-injection resistance.
15. Effect layers own typed config, scoped DB/provider resources, adapters, and
    runtime construction.

## Phase 0: Framework Substrate

Purpose: define the core interfaces before implementation details spread across
callers.

### Deliverables

- `HostCapabilityManifest`
- `AssistantProfile`
- `TurnPolicyDecision`
- `ContextCandidate`
- `PreparedTurnContext`
- `ContextManifest`
- `WorkflowRun`
- `WorkflowNode`
- `WorkflowArtifact`
- ADRs for any irreversible product choices

### Work

1. Add domain types under `packages/partner-ai-core/src/domain` or another
   existing core-owned domain location.
2. Add port shapes under `packages/partner-ai-core/src/ports`.
3. Extend docs in `docs/architecture/production-system-design.md` only when the
   implementation reveals a real design correction.
4. Add compile-time tests or focused unit tests for manifest and policy shape
   validation.
5. Add an ADR if host command approvals, workflow persistence, or retrieval
   source ownership requires a decision that should not be rediscovered.

### Acceptance Criteria

- Core has named types for host capabilities, policy decisions, context
  candidates, context manifests, and workflow nodes.
- Types compile without pulling Hono, Drizzle, React, provider SDKs, or
  `agent-runtime` implementation details into domain modules.
- Host capability manifest validation fails closed on unknown schema versions,
  duplicate tool names, duplicate workflow ids, or missing profile ids.
- A test can create a fake manifest, resolve a fake profile, and produce a fake
  policy decision without starting HTTP, DB, or model providers.

### Verification

- `npm run typecheck --workspace @side-chat/partner-ai-core`
- targeted partner-ai-core tests
- governance checks for package imports

## Phase 1: Honest Single-Turn Harness

Purpose: make the existing chat path durable and truthful before adding larger
features.

### Deliverables

- Stable conversation id round-trip from server to widget and back.
- Core runtime port carries the richer runtime request.
- Assistant profile id is resolved server-side and passed to runtime.
- Tool selection fails closed unless policy/profile explicitly allows tools.
- Assistant turns start before runtime execution and terminal states are durable.

### Work

1. Update widget request flow:
   - read `conversationId` from `sidechat.started`;
   - send it on subsequent turns;
   - keep reset behavior explicit.
2. Update `packages/partner-ai-core/src/ports/index.ts` so runtime requests can
   carry `profileId`, `contextBoard`, `availableToolNames`, request tools, and
   abort signal.
3. Update `protocol-event-stream.ts` so runtime receives a prepared request
   rather than only `[input.request.message]`.
4. Add server-side assistant profile resolution from protocol
   `assistantProfileId`.
5. Change runtime tool selection so no request/profile allowlist means no tools,
   except for an explicit development profile.
6. Move assistant turn start/fail/complete out of the post-stream completion
   callback and into the core turn workflow.

### Acceptance Criteria

- A widget test proves the second user message includes the server
  `conversationId`.
- A core test proves runtime receives profile id and explicit tool allowlist.
- A runtime test proves no allowlist exposes no tools.
- A core or service test proves a provider/runtime failure marks the assistant
  turn failed.
- A stream abort or error path does not leave an unclosed running turn.

### Verification

- `npm test --workspace @side-chat/side-chat-widget`
- `npm test --workspace @side-chat/partner-ai-core`
- `npm test --workspace @side-chat/agent-runtime`
- targeted service route tests

## Phase 2: Context Manager MVP

Purpose: create the authoritative module for "what the model sees."

### Deliverables

- `ContextManager` interface.
- Context candidate model.
- Minimal candidate gatherer for current message, recent history, host context,
  assistant profile, and tool capability metadata.
- Backend context budget with output reservation.
- Trust-zoned rendering into `RuntimeContextBoard` and runtime messages.
- Context manifest with canonical rendered hash.

### Work

1. Add context candidate gatherers in `partner-ai-core`.
2. Add history loading through a core port using the existing repository
   contract.
3. Add `ContextBudget` with model window, output reservation, fit target,
   priorities, and eviction rules.
4. Add renderer that separates trusted host context, profile/system policy,
   conversation history, current user request, and tool capability hints.
5. Add SHA-256 canonical context hashing.
6. Persist the context manifest before runtime execution.
7. Keep `agent-runtime` responsible only for final runtime message rendering.

### Acceptance Criteria

- Deterministic test: same inputs produce same manifest and hash.
- Budget test: lower budgets drop lower-priority candidates before required
  candidates.
- Trust test: user text and retrieved/untrusted text are not rendered as trusted
  instructions.
- Snapshot test: rendered context changes are visible in review.
- Core runtime request includes the produced context board.

### Verification

- partner-ai-core context manager tests
- DB context snapshot contract tests
- `npm run typecheck`

## Phase 3: Turn Ledger, Observability, and Eval Foundations

Purpose: make the harness inspectable before adding memory/retrieval/workflows.

### Deliverables

- Turn ledger flow in core.
- Runtime event persistence during stream execution.
- Tool invocation persistence from runtime activity events.
- Basic telemetry spans around turn, context assembly, runtime, provider, tools,
  and persistence.
- Initial eval runner skeleton.

### Work

1. Add a core-owned turn ledger port if the current conversation repository port
   is too narrow.
2. Persist runtime events or normalized event summaries as they occur.
3. Record tool invocation rows from tool activity events.
4. Record usage as soon as provider terminal usage is available.
5. Add initial `packages/evals` or `apps/eval-runner` skeleton.
6. Add the first eval fixtures for context assembly and rendered context
   snapshots.

### Acceptance Criteria

- One completed assistant turn can be reconstructed from persisted turn,
  message, context snapshot, usage, tool, and audit records.
- One failed assistant turn is reconstructable with failure code and context
  hash.
- Tool activity in the stream creates or updates a durable tool invocation row.
- Eval runner can execute deterministic fixture cases without a live provider.

### Verification

- repository contract tests
- service persistent e2e tests
- eval runner fixture tests
- observability redaction tests

## Phase 4: Host Capability and Tool Governance

Purpose: make arbitrary host-app capabilities safe to expose.

### Deliverables

- Capability manifest adapters in service composition.
- Policy resolver uses manifest, auth, profile, and workspace state.
- Tool manager controls exposure, result caps, summaries, and replay references.
- Host command approval decision model.

### Work

1. Add service composition for host capability manifests.
2. Resolve `TurnPolicyDecision` in core before context assembly.
3. Expose only policy-allowed tools to runtime.
4. Add tool result caps and redaction/hashing before persistence or protocol
   mapping.
5. Add tool-result summary/reference shape for future context reuse.
6. Add approval policy interfaces for host commands, but do not enable durable
   write actions until an ADR accepts the behavior.

### Acceptance Criteria

- Unknown or duplicate tool names fail manifest validation.
- A profile with no allowed tools exposes no tools.
- A development profile can explicitly expose `mock_web_search`.
- Tool results larger than policy are summarized or referenced, not dumped into
  context.
- Host commands requiring approval do not auto-run.

### Verification

- policy resolver tests
- runtime tool-selection tests
- service composition tests
- protocol tool activity tests

## Phase 5: History Compaction and Internal Workflow v0

Purpose: support long conversations and introduce workflow substrate through a
real internal use case.

### Deliverables

- Conversation summary records and checkpoint.
- Compaction policy with high/low water marks and verbatim tail.
- Internal compaction workflow or compaction agent.
- Minimal workflow run/node ledger.
- Workflow cancellation and terminal state handling.

### Work

1. Add summary schema/contracts.
2. Add context budget trigger for compaction.
3. Add deterministic compaction tests using fake summarizer first.
4. Add optional model-backed compaction behind an approved adapter.
5. Add workflow run/node records for the compaction job.
6. Add workflow event mapping only for internal/admin visibility at first.

### Acceptance Criteria

- Long history over high-water threshold compacts into summary plus verbatim
  tail.
- Summary includes source message range and checkpoint.
- Future turns include summary plus recent tail through context manager.
- Failed compaction does not block the current assistant turn unless the turn
  cannot fit safely.
- Workflow node records show started/completed/failed status.

### Verification

- compaction unit tests
- context manager integration tests
- repository contract tests for summaries/workflow records
- eval fixture for summary preservation

## Phase 6: Retrieval and Ingestion

Purpose: ground answers in host and project knowledge through the context
manager.

### Deliverables

- Source registry.
- Ingestion pipeline.
- Chunking with stable hashes.
- Embedding adapter.
- Vector and lexical search.
- Hybrid rank and optional rerank.
- Retrieval result candidates and citation manifest entries.
- Retrieval evals.

### Work

1. Define retrieval source capability in the host manifest.
2. Add document/source tables and repository contracts.
3. Implement chunking with deterministic tests.
4. Add embedding provider port and adapter.
5. Add vector search and lexical search adapters.
6. Add hybrid ranking with deterministic tie-breaking.
7. Feed retrieval results into context manager as untrusted candidates.
8. Add citation metadata to context manifest and activity sources.

### Acceptance Criteria

- Reingesting unchanged content is idempotent.
- Permission filters prevent cross-workspace retrieval.
- Hybrid search produces deterministic ordering for fixture queries.
- Retrieved chunks render as untrusted, cited context.
- Retrieval evals catch at least relevance, permission, and citation failures.

### Verification

- ingestion tests
- repository tests with Postgres adapter
- retrieval eval runner
- context rendering tests

## Phase 7: Memory

Purpose: support durable user/workspace learning without unsafe prompt stuffing.

### Deliverables

- Memory schema and repository contract.
- Memory extraction workflow.
- Supersession model.
- Memory selection into context manager.
- User/workspace privacy and deletion controls.
- Memory evals.

### Work

1. Define memory categories and scope rules.
2. Add memory extraction after completed turns.
3. Add supersession instead of overwriting.
4. Add selection against the current turn intent.
5. Add memory candidates to context manager with provenance and confidence.
6. Add UI/admin path for showing and deleting memory if product scope requires
   it.

### Acceptance Criteria

- Extracted memories include provenance and confidence.
- Newer contradictory memory supersedes older memory.
- Memory selection respects workspace/subject scope.
- Stale or superseded memory is not injected.
- Memory evals catch false memory, stale memory, and privacy-scope violations.

### Verification

- memory unit tests
- repository contract tests
- context manager integration tests
- memory eval runner

## Phase 8: Multi-Agent Workflow Engine

Purpose: let host apps build complex AI workflows without bypassing the harness.

### Deliverables

- Public workflow registration in host capability manifest.
- Workflow engine interface.
- Workflow run/node persistence.
- Node-specific context preparation.
- Sequential workflow runner.
- Parallel branch runner.
- Handoff artifacts.
- Workflow protocol events.
- Workflow evals.

### Work

1. Define workflow capability registration.
2. Add workflow execution policy to `TurnPolicyDecision`.
3. Implement node-specific `PreparedTurnContext`.
4. Execute each node through `agent-runtime` with isolated profile/tools/context.
5. Persist node inputs, context hashes, outputs, failures, retries, and artifacts.
6. Add protocol events for workflow run and node progress.
7. Add first product workflows:
   - retrieval researcher -> final assistant;
   - planner -> executor -> verifier;
   - document analyst -> answer writer.

### Acceptance Criteria

- One sequential workflow runs through two agent nodes with separate context
  manifests.
- One parallel workflow runs two branches and reduces artifacts into a final
  answer.
- Cancelling the workflow cancels active nodes and tools.
- Node failures are durable and visible through protocol activity.
- Workflow artifacts are auditable and can become future context candidates.

### Verification

- workflow engine unit tests
- runtime integration tests with fake provider
- protocol event sequence tests
- widget activity tests for workflow progress
- workflow eval fixtures

## Phase 9: Production Operations and Effect Layer Graph

Purpose: harden the framework for real deployments.

### Deliverables

- Effect `Config`/config provider usage.
- Scoped DB pool layer.
- Scoped provider/client layers.
- Telemetry adapter layer.
- Retrieval and embedding provider layers.
- Memory and workflow layers.
- Cost and usage accounting.
- Delivery guarantees for stream retry/resume if needed.
- CI eval gates.

### Work

1. Move DB pool construction behind scoped Effect layers.
2. Move provider clients behind layers.
3. Move environment config to typed config descriptions.
4. Add telemetry export adapter.
5. Add metrics for context tokens, retrieval quality, memory injection, tool
   calls, workflow duration, usage, cost, and terminal failures.
6. Add stream event ids and resume semantics if product requirements demand it.
7. Add eval lanes to CI or release gates.

### Acceptance Criteria

- App startup validates config through typed config.
- DB/provider resources are acquired and released through scoped layers.
- One local run can export turn/workflow telemetry through the configured
  adapter.
- Cost and usage records include real provider usage where available.
- CI or local verify can run deterministic eval fixtures.

### Verification

- startup/config tests
- layer startup/shutdown tests
- telemetry adapter tests
- `npm run verify`
- container parity tests

## Parallel Workstreams

The phases are ordered by dependency, but implementation can be staffed in
parallel once interfaces are stable:

| Workstream      | Owns                                                    | Can start after |
| --------------- | ------------------------------------------------------- | --------------- |
| Core harness    | policy, turn lifecycle, context manager                 | Phase 0         |
| Runtime         | request shape, tool fail-closed, stream event mapping   | Phase 0         |
| Persistence     | ledger records, summaries, memory, retrieval, workflows | Phase 0         |
| Widget/protocol | conversation id, activity/workflow events               | Phase 1         |
| Evals           | context fixtures, retrieval/memory/workflow evals       | Phase 2         |
| Ops/Effect      | config, layers, telemetry                               | Phase 1         |

## First Ten Implementation Issues

1. Define `HostCapabilityManifest`, `AssistantProfile`, `TurnPolicyDecision`,
   `ContextCandidate`, and `ContextManifest` in `partner-ai-core`.
2. Wire widget `conversationId` from `sidechat.started` into subsequent chat
   requests.
3. Expand `AgentRuntimePort` request shape in `partner-ai-core`.
4. Pass protocol `assistantProfileId` through server-side profile resolution to
   runtime.
5. Change runtime tool selection to fail closed.
6. Move assistant turn start/fail/complete into the core workflow.
7. Add `ContextManager` MVP with current message, host context, recent history,
   profile, and tool metadata candidates.
8. Add context budget and deterministic manifest/hash tests.
9. Persist context manifest before runtime execution.
10. Add initial eval runner with golden context assembly fixtures.

## Risks and Mitigations

| Risk                                                                   | Mitigation                                                                             |
| ---------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Adding retrieval/memory before context manager creates prompt stuffing | Gate retrieval and memory behind context manager candidates and manifests              |
| Workflow engine becomes too abstract                                   | Start with compaction workflow, then one customer-facing two-node workflow             |
| Tool exposure becomes unsafe as real tools arrive                      | Fail closed by default and expose only policy-derived allowlists                       |
| Persistence migrations sprawl                                          | Add records phase by phase with repository contract tests                              |
| Evals become flaky or expensive                                        | Start deterministic; add live model lanes only behind explicit opt-in                  |
| Effect layer migration blocks feature work                             | Introduce scoped layers around new resources first, then migrate existing adapters     |
| Widget promises features backend does not honor                        | Add protocol tests and e2e flows for profile, context, conversation, workflow activity |

## Verification Strategy

Each phase should finish with:

1. Unit tests at the module interface.
2. Integration tests where the module crosses a real adapter seam.
3. Protocol tests if the public stream or request shape changes.
4. Repository contract tests if persistence changes.
5. Evals if model-visible context, retrieval, memory, tools, or workflows change.
6. Updated docs when interface meaning changes.

Minimum local gate for implementation PRs:

```sh
npm run typecheck
npm test
npm run lint:custom
```

Full local/release gate:

```sh
npm run verify
npm run test:db:container
npm run test:e2e:persistent
npm run test:evals
```

Use the pinned runtime when needed:

```sh
npx -p node@24.16.0 -p npm@11.15.0 npm run verify
```

## Stop Conditions

Stop and revisit the plan when:

- a phase requires moving product policy into `agent-runtime`;
- a host app needs to bypass the capability manifest to expose tools or context;
- context cannot be reconstructed from manifest and durable records;
- tool or workflow execution cannot be cancelled or audited;
- evals show retrieval, memory, or compaction is harming answer quality;
- an ADR contradicts the implementation path.

## Plan Handoff

For execution, use this plan with the target architecture:

- `docs/architecture/production-system-design.md`
- `docs/architecture/implementation-plan.md`
- `docs/CONTEXT.md`

Recommended delivery mode:

1. Use one leader to own the phase gate and docs.
2. Use parallel workers only after Phase 0 interfaces are stable.
3. Keep core/runtime/persistence/widget/evals as separate implementation lanes.
4. End every phase with a verifier pass against the phase acceptance criteria.
