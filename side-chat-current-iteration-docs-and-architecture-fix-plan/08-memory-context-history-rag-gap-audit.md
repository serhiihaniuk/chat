# Memory, Context, History, RAG Gap Audit

## 1. Purpose

This document records what is missing between the intended Side Chat
architecture and the app behavior observed while running the widget harness
against a real OpenAI model.

It is not a new canonical architecture document. It is a current-iteration
working audit for implementation planning.

The short version:

```txt
The repo has the extension seams for memory, RAG, research, context boards,
history persistence, and memory-write lifecycle hooks.

The default running app does not yet have real memory, real RAG, real research,
or prior conversation history admitted back into model context.
```

## 2. Scope Inspected

Canonical docs inspected:

```txt
docs/README.md
docs/domain/vocabulary.md
docs/architecture/system-map.md
docs/architecture/package-boundaries.md
docs/architecture/assistant-turn.md
docs/architecture/extension-seams.md
docs/architecture/runtime-and-protocol-events.md
docs/product/requirements.md
docs/operations/verification.md
```

Implementation areas inspected:

```txt
apps/partner-ai-service/src/composition
apps/partner-ai-service/src/adapters
apps/partner-ai-service/src/config
apps/partner-ai-service/src/inbound/http/routes/chat
packages/partner-ai-core/src/application/stream-chat
packages/partner-ai-core/src/ports/context
packages/agent-runtime/src/runtime/turn
packages/db/src/repositories
test-harness/adoption-harness
test-harness/widget-harness
```

Current-iteration planning docs inspected:

```txt
side-chat-current-iteration-docs-and-architecture-fix-plan/04-extension-seams-plan.md
side-chat-current-iteration-docs-and-architecture-fix-plan/05-core-runtime-context-protocol-plan.md
side-chat-current-iteration-docs-and-architecture-fix-plan/07-acceptance-criteria.md
```

## 3. What Is Implemented

### 3.1 Assistant turn lifecycle has the intended slots

The canonical lifecycle describes the intended order:

```txt
authorize
resolve profile/policy
run guards
persist user turn
prepare context
execute runtime
finalize
record memory write candidates
```

Relevant docs:

```txt
docs/architecture/assistant-turn.md
docs/architecture/extension-seams.md
```

The code also has named lifecycle pieces in `partner-ai-core`, including:

```txt
packages/partner-ai-core/src/application/stream-chat/turn/prepare-stream-chat-turn.ts
packages/partner-ai-core/src/application/stream-chat/protocol/protocol-event-stream.ts
packages/partner-ai-core/src/application/stream-chat/protocol/protocol-terminal-lifecycle.ts
```

This part is mostly architectural plumbing. It gives the product a place to run
memory recall, RAG retrieval, research, runtime execution, and post-answer
memory write candidate recording.

### 3.2 Core ports exist

The core owns provider-neutral ports for memory, RAG, and research:

```txt
packages/partner-ai-core/src/ports/context/memory-port.ts
packages/partner-ai-core/src/ports/context/rag-retriever.ts
packages/partner-ai-core/src/ports/context/research-agent.ts
```

These ports are the right shape for clean boundaries:

```txt
core defines policy-scoped input/output contracts
service adapters provide concrete implementations
runtime receives prepared context only
widget never sees provider, DB, RAG, or memory internals
```

### 3.3 Context board rendering reaches the model when populated

The context board is not dead data. `agent-runtime` renders the prepared context
board into a system message:

```txt
packages/agent-runtime/src/runtime/turn/prompt-rendering.ts
```

The runtime prompt shape is:

```txt
profile system message
trusted context board system message
runtime request messages
```

So if memory, RAG, research, or host context candidates are admitted into the
context board, the model can see them.

### 3.4 Persistence and history repositories exist

Conversation and message persistence exists through repository contracts and
memory/Postgres implementations:

```txt
packages/db/src/schema-contract/repositories.ts
packages/db/src/repositories/memory/records/conversations.ts
packages/db/src/repositories/postgres-drizzle/records/conversations.ts
```

The service exposes history endpoints:

```txt
apps/partner-ai-service/src/inbound/http/routes/chat/chat-history.ts
```

This supports reading and resetting conversation history through HTTP.

### 3.5 Tests prove the seams can work when adapters are injected

Several tests inject fake or recording adapters to prove the extension seams:

```txt
apps/partner-ai-service/src/composition/context-manager/service-context-manager.test.ts
apps/partner-ai-service/src/inbound/http/app.persistence.test.ts
test-harness/adoption-harness/src/adoption-golden-path.test.ts
```

These tests are valuable. They show the architecture can carry memory, RAG, and
research through the context board.

They do not prove the default launched app has real implementations.

## 4. What Is Missing

### 4.1 The default running service has no real memory adapter

Current behavior:

```txt
apps/partner-ai-service/src/composition/service-composition.ts
```

falls back to:

```txt
apps/partner-ai-service/src/adapters/memory/noop-memory-port.ts
```

The no-op memory adapter:

```txt
recall -> []
proposeWriteCandidates -> []
writeCandidates -> undefined
```

What this means:

```txt
No stored user/workspace/conversation memory is recalled.
No assistant answer is converted into durable memory candidates.
No memory candidates are written anywhere.
```

Missing implementation:

```txt
real MemoryPort adapter
memory storage model
memory read/write repository or external store integration
memory extraction strategy
memory dedupe/update behavior
memory provenance and scope persistence
memory policy configuration in service composition
tests proving memory survives across turns and service restarts
```

Acceptance target:

```txt
[ ] A first turn can produce memory write candidates.
[ ] Approved candidates are persisted under explicit scope.
[ ] A later turn recalls relevant memory through MemoryPort.
[ ] Recalled memory appears in the prepared context manifest.
[ ] Recalled memory appears in the runtime context board.
[ ] Disabled memory policy recalls and writes nothing.
[ ] Memory write failures are observable and do not create a second terminal event.
```

### 4.2 The default running service has no real RAG adapter

Current behavior:

```txt
apps/partner-ai-service/src/composition/service-composition.ts
```

falls back to:

```txt
apps/partner-ai-service/src/adapters/rag/noop-rag-retriever.ts
```

The no-op RAG adapter:

```txt
retrieve -> []
```

What this means:

```txt
No documents, embeddings, search index, or external knowledge source are queried.
No retrieved chunks are added to the context board.
No RAG provenance is produced in real app usage.
```

Missing implementation:

```txt
real RagRetrieverPort adapter
source registration in service capability manifest
retrieval source configuration
document/index storage or external retriever connection
query construction from user turn and host context
source authorization and allowedSourceIds enforcement
chunk trust/redaction/token metadata
failure policy: fail turn, degrade, or return no context
tests with a non-noop retriever on the app path
```

Acceptance target:

```txt
[ ] Manifest declares at least one retrieval source when RAG is enabled.
[ ] Turn policy passes allowedSourceIds into retrieval.
[ ] Retriever receives auth/workspace/request scope.
[ ] Retrieved candidates include provenance, trust, redaction class, and token estimate.
[ ] Retrieved candidates appear in the context manifest.
[ ] Retrieved sections appear in the runtime context board.
[ ] Disabled retrieval policy does not call the retriever.
[ ] Retrieval failure behavior is explicit and tested.
```

### 4.3 The default running service has no real research agent

Current behavior:

```txt
apps/partner-ai-service/src/composition/service-composition.ts
```

falls back to:

```txt
apps/partner-ai-service/src/adapters/agents/noop-research-agent.ts
```

The no-op research agent:

```txt
runResearch -> { summary: "", sources: [] }
```

What this means:

```txt
No pre-answer research is performed.
No research artifact is produced.
No research result candidates are added to the context board.
```

Missing implementation:

```txt
real ResearchAgentPort adapter
research agent capability registration
policy/profile selection for research_context
research source selection rules
research output artifact persistence strategy
source provenance and manifest mapping
failure policy
tests proving research is visible to the main model only through prepared context
```

Acceptance target:

```txt
[ ] Research runs only when profile/policy allows it.
[ ] Research receives request, auth, workspace, and allowed source scope.
[ ] Research output becomes context candidates and artifacts.
[ ] Research artifacts are persisted or explicitly declared ephemeral.
[ ] Research sources appear in the context manifest.
[ ] Runtime receives prepared research context, not browser protocol DTOs.
[ ] Disabled research policy does not call the research agent.
[ ] Research failure behavior is explicit and tested.
```

### 4.4 Conversation history is persisted and fetchable, but not used as model context

Current implemented path:

```txt
apps/partner-ai-service/src/inbound/http/routes/chat/chat-history.ts
packages/db/src/repositories/memory/records/conversations.ts
packages/db/src/repositories/postgres-drizzle/records/conversations.ts
```

Current context path:

```txt
apps/partner-ai-service/src/composition/context-manager/candidates/context-candidate-creation.ts
apps/partner-ai-service/src/composition/context-manager/rendering/runtime-message-rendering.ts
```

The context manager creates candidates from:

```txt
current user message
host context
memory records
RAG candidates
research candidates
tool declarations/context
```

It does not create candidates from prior conversation messages.

The runtime messages renderer sends only the current user message as a runtime
message. Prior turns are not added there either.

What this means:

```txt
The UI/API can read history.
The database can persist history.
The model does not automatically see prior turns on the next request.
```

This is likely the biggest user-visible gap if a user expects "chat history" to
mean conversational continuity.

Missing implementation:

```txt
conversation history retrieval during context preparation
policy/profile control over how much history is admitted
history summarization or windowing strategy
history redaction and token budgeting
history candidate type or runtime message policy
tests proving turn N+1 can use turn N context
tests proving reset removes future context
```

Design choice still needed:

```txt
Option A: render recent history as runtime messages
Option B: render summarized/history candidates into the context board
Option C: use both, with recent turns as messages and older turns as summary
```

The architecture currently leans toward prepared context boards, but ordinary
chat continuity often benefits from rendering recent turns as actual runtime
messages. The team should make that choice explicitly.

Acceptance target:

```txt
[ ] A second turn in the same conversation can see the first turn.
[ ] Reset conversation prevents old turns from influencing future answers.
[ ] History inclusion is visible in prepared context snapshot or runtime request.
[ ] History admission is token-budgeted.
[ ] History respects auth/workspace/subject/conversation boundaries.
[ ] History behavior is covered by service-level tests and widget harness smoke.
```

### 4.5 Context admission is simple include-all, not real context management

Current behavior:

```txt
apps/partner-ai-service/src/composition/context-manager/candidates/context-candidate-selection.ts
```

The implementation says it is temporary:

```txt
include every gathered candidate
record estimated token use
no trimming
no sorting
hard-coded maxInputTokens
hard-coded reservedOutputTokens
```

What this means:

```txt
There is a context board.
There is a context manifest.
There are included/dropped fields.
There is no real admission algorithm yet.
```

This is honest in code naming if treated as "simple admission." It is not enough
for docs or product claims that imply robust squashing, redaction,
authorization, or budget management.

Missing implementation:

```txt
budget profile resolution
candidate priority normalization
token budget accounting
candidate sorting and dropping
source-specific limits
history windowing or summarization
oversized candidate handling
redaction/admission metadata
manifest explanation for dropped candidates
tests for budget pressure and deterministic admission
```

Acceptance target:

```txt
[ ] Admission policy has an explicit name and contract.
[ ] Token budget comes from profile/config, not a hidden constant.
[ ] Candidates can be dropped under budget pressure.
[ ] Dropped candidates are recorded in the manifest.
[ ] High-priority safety/profile context cannot be displaced by low-priority RAG.
[ ] Tests cover simple no-pressure and budget-pressure cases.
```

### 4.6 Service configuration cannot enable memory, RAG, or research

Current config keys:

```txt
apps/partner-ai-service/src/config/service-config.ts
```

cover:

```txt
allowed models
auth token
database URL
OpenAI credentials/base URL/reasoning
policy mode
profile
provider
dev tools
tenant/workspace ids
```

They do not cover:

```txt
memory backend
memory policy
RAG sources
retriever backend
research agent enablement
research source config
context budget
history window size
```

What this means:

```txt
Even if a real adapter exists, the app has no ordinary env/config path to enable
it in local development or deployment.
```

Missing implementation:

```txt
config schema for memory/RAG/research/history/context budgets
composition wiring from config to concrete adapters
manifest construction from configured capabilities
production validation for required backing services
local development defaults that are explicit, not surprising
health endpoint visibility into enabled/disabled capabilities
```

Acceptance target:

```txt
[ ] Service config can enable a concrete memory adapter.
[ ] Service config can register retrieval sources.
[ ] Service config can enable a concrete research agent.
[ ] Service config controls context budget/history window.
[ ] Health or diagnostics report capability status without leaking secrets.
[ ] Production profile rejects partially configured enabled capabilities.
```

### 4.7 Tests are currently seam tests, not real app-behavior tests

Current tests often inject fake adapters:

```txt
apps/partner-ai-service/src/composition/context-manager/service-context-manager.test.ts
apps/partner-ai-service/src/inbound/http/app.persistence.test.ts
test-harness/adoption-harness/src/adoption-golden-path.test.ts
```

These tests are valuable but can mislead review:

```txt
They prove the extension points can carry data.
They do not prove the default app has any concrete source of that data.
```

Missing test coverage:

```txt
default service reports memory/RAG/research disabled or no-op
configured service wires real/non-noop adapters
history affects a follow-up model request
context budget drops lower-priority candidates
real Postgres-backed local path persists history across restart
widget harness demonstrates real conversation continuity
```

Acceptance target:

```txt
[ ] A test fails if default production config silently uses no-op memory.
[ ] A test fails if enabled RAG has no retrieval source.
[ ] A test fails if enabled research has no concrete agent.
[ ] A test proves history is included in a follow-up turn.
[ ] A test proves memory recall/write survives through configured persistence.
```

### 4.8 Real-model local run can hide persistence gaps

During the real-model run, the service could call OpenAI successfully. However,
the Postgres path failed on insert, so the service was run with
`SIDECHAT_DATABASE_URL` cleared to use the in-memory repository.

What this means:

```txt
The model call was real.
The persistence path was not the real Postgres path.
History in that local run was process-local and would not survive restart.
```

This should not be confused with production-ready durable history or durable
memory.

Missing implementation or verification:

```txt
fix local Postgres insert/migration/runtime mismatch
run persistent e2e against Postgres with the real service path
verify history survives service restart
verify context snapshots are persisted on real DB path
verify memory write candidates, when implemented, persist on real DB path
```

Acceptance target:

```txt
[ ] Real-model service can run with Postgres enabled.
[ ] User and assistant turns persist without insert errors.
[ ] History endpoint returns persisted messages after restart.
[ ] Context snapshot persistence works on the same path.
```

### 4.9 Docs and implementation are out of sync

Canonical docs describe the intended architecture:

```txt
docs/architecture/assistant-turn.md
docs/architecture/extension-seams.md
docs/product/requirements.md
```

Current-iteration plan docs still have unchecked acceptance criteria:

```txt
side-chat-current-iteration-docs-and-architecture-fix-plan/04-extension-seams-plan.md
side-chat-current-iteration-docs-and-architecture-fix-plan/05-core-runtime-context-protocol-plan.md
side-chat-current-iteration-docs-and-architecture-fix-plan/07-acceptance-criteria.md
```

The mismatch:

```txt
Canonical docs read like final architecture.
Implementation is still partly ports, no-ops, and fake-injected tests.
Plan docs correctly say the work is unfinished.
```

Missing docs work:

```txt
mark concrete adapter status honestly
distinguish "seam exists" from "feature is implemented"
add capability status to service README or extension seams
avoid implying memory/RAG/research are production-ready
close or update unchecked current-iteration criteria as implementation lands
```

Acceptance target:

```txt
[ ] Docs state which capabilities are concrete and which are extension seams.
[ ] Extension seam docs include "default app behavior" notes.
[ ] Service README lists enabled default capabilities.
[ ] Current iteration acceptance criteria are updated or closed when complete.
```

## 5. Gap Matrix

| Capability                     | Current state                           | User-visible result                         | Missing work                          | Severity    |
| ------------------------------ | --------------------------------------- | ------------------------------------------- | ------------------------------------- | ----------- |
| Real model                     | Implemented for OpenAI provider path    | Model can answer                            | Keep configured model/profile aligned | Low         |
| Memory recall                  | Port and tests only, default no-op      | Model does not remember durable facts       | Concrete MemoryPort and store         | High        |
| Memory write                   | Lifecycle hook exists, default no-op    | No facts are saved after answers            | Extraction and persistence            | High        |
| RAG                            | Port and tests only, default no-op      | No docs/knowledge retrieval                 | Retriever, sources, config            | High        |
| Research                       | Port and tests only, default no-op      | No pre-answer research                      | Agent adapter, policy/config          | Medium-high |
| Conversation history API       | Implemented                             | UI/API can fetch history                    | Persisted DB path verification        | Medium      |
| Conversation history in prompt | Missing                                 | Follow-up turns lack prior-turn context     | History admission strategy            | High        |
| Context board                  | Implemented                             | Populated context can reach model           | Real data sources                     | Medium      |
| Context admission              | Simple include-all                      | No real budget/squash behavior              | Budgeted selection                    | Medium-high |
| Service config                 | Provider/persistence focused            | Cannot enable memory/RAG/research normally  | Capability config                     | High        |
| Tests                          | Seam tests with fakes                   | Tests pass while app has no real capability | App-path tests                        | High        |
| Docs                           | Intended architecture mostly documented | Docs can overpromise implementation         | Status notes and acceptance updates   | Medium      |

## 6. Recommended Implementation Order

### Phase 1: Make current behavior explicit

Goal: stop the app and docs from implying finished capabilities.

Tasks:

```txt
[ ] Add capability status to service health or diagnostics.
[ ] Document default memory/RAG/research as disabled/no-op.
[ ] Add tests that assert default service behavior is explicit.
[ ] Fix docs language that implies concrete memory/RAG/research already exists.
```

Why first:

```txt
This prevents future refactors from mistaking scaffolding for complete behavior.
```

### Phase 2: Add conversation history to model context

Goal: make normal chat continuity work.

Tasks:

```txt
[ ] Decide recent-message vs context-board history strategy.
[ ] Retrieve history during context preparation.
[ ] Add history admission limits.
[ ] Include history in runtime messages or context board.
[ ] Add second-turn tests.
[ ] Add reset tests proving old context is removed.
```

Why second:

```txt
History is the most visible missing behavior during ordinary chat usage.
```

### Phase 3: Fix durable Postgres local path

Goal: make the real-model local app run with real persistence.

Tasks:

```txt
[ ] Reproduce current Postgres insert failure.
[ ] Fix migration/schema/config mismatch.
[ ] Run service with SIDECHAT_DATABASE_URL enabled.
[ ] Verify history after restart.
[ ] Run persistent e2e on the real service path.
```

Why third:

```txt
Memory and history work should not be built on a broken persistence path.
```

### Phase 4: Implement real memory

Goal: support durable user/workspace/conversation knowledge.

Tasks:

```txt
[ ] Define memory records table/store or external memory backend.
[ ] Implement MemoryPort recall.
[ ] Implement write candidate proposal.
[ ] Implement candidate write/update/dedupe.
[ ] Wire memory policy/config into service composition.
[ ] Add recall/write persistence tests.
```

Why fourth:

```txt
Memory needs reliable persistence and clear policy boundaries.
```

### Phase 5: Implement real RAG

Goal: retrieve authorized project/domain context before the model call.

Tasks:

```txt
[ ] Choose initial retriever backend.
[ ] Register retrieval source capabilities.
[ ] Implement RagRetrieverPort.
[ ] Add provenance/trust/redaction/token metadata.
[ ] Wire config to manifest.
[ ] Add retrieval success, empty, disabled, and failure tests.
```

Why fifth:

```txt
RAG is valuable, but it needs source configuration and context admission to avoid
becoming unbounded prompt stuffing.
```

### Phase 6: Implement context admission beyond include-all

Goal: prevent context from growing without budget control.

Tasks:

```txt
[ ] Define context budget profile.
[ ] Implement deterministic candidate ordering.
[ ] Implement include/drop behavior.
[ ] Add source-specific caps.
[ ] Record dropped candidates in manifest.
[ ] Test budget pressure.
```

Why sixth:

```txt
Real memory, history, and RAG will make include-all unsafe quickly.
```

### Phase 7: Implement research agent only if product needs it now

Goal: add pre-answer synthesis when RAG alone is not enough.

Tasks:

```txt
[ ] Decide what research agent does that RAG does not.
[ ] Implement ResearchAgentPort adapter.
[ ] Register research_context capability.
[ ] Persist or intentionally discard research artifacts.
[ ] Add failure and disable tests.
```

Why later:

```txt
Research is more workflow-like than basic chat continuity, memory, and RAG. It
should not block those fundamentals unless it is a current product requirement.
```

## 7. Concrete Definition Of Done

The memory/context/history/RAG work should not be considered done until these
are true:

```txt
[ ] Running the widget harness against a real model can maintain conversation continuity.
[ ] Running with Postgres enabled persists turns without insert errors.
[ ] Restarting the service does not lose persisted history.
[ ] A follow-up turn includes prior conversation context according to an explicit policy.
[ ] Memory can be enabled by config.
[ ] Enabled memory recalls and writes through a concrete adapter.
[ ] RAG can be enabled by config.
[ ] Enabled RAG retrieves from at least one concrete source.
[ ] Context admission is either real budgeted selection or explicitly documented simple include-all.
[ ] Health/diagnostics reveal whether memory/RAG/research/history are enabled.
[ ] Tests fail if a production-like config silently falls back to no-op memory/RAG/research.
[ ] Docs distinguish extension seams from implemented capabilities.
```

## 8. Files That Need Follow-up

Likely implementation files:

```txt
apps/partner-ai-service/src/composition/service-composition.ts
apps/partner-ai-service/src/composition/manifest/service-capability-manifest.ts
apps/partner-ai-service/src/composition/context-manager/service-context-manager.ts
apps/partner-ai-service/src/composition/context-manager/sources/context-source-gathering.ts
apps/partner-ai-service/src/composition/context-manager/candidates/context-candidate-creation.ts
apps/partner-ai-service/src/composition/context-manager/candidates/context-candidate-selection.ts
apps/partner-ai-service/src/composition/context-manager/rendering/runtime-message-rendering.ts
apps/partner-ai-service/src/config/service-config.ts
apps/partner-ai-service/src/adapters/memory
apps/partner-ai-service/src/adapters/rag
apps/partner-ai-service/src/adapters/agents
packages/db/src/schema-contract/repositories.ts
packages/db/src/repositories/postgres-drizzle
packages/db/src/repositories/memory
```

Likely test files:

```txt
apps/partner-ai-service/src/composition/context-manager/service-context-manager.test.ts
apps/partner-ai-service/src/inbound/http/app.persistence.test.ts
apps/partner-ai-service/src/config/service-config.test.ts
test-harness/adoption-harness/src/adoption-golden-path.test.ts
test-harness/widget-harness/e2e/persistent.spec.ts
test-harness/widget-harness/e2e/widget-harness.spec.ts
```

Likely docs:

```txt
docs/architecture/extension-seams.md
docs/architecture/assistant-turn.md
docs/product/requirements.md
docs/operations/verification.md
apps/partner-ai-service/README.md
apps/partner-ai-service/src/adapters/README.md
packages/partner-ai-core/src/application/stream-chat/README.md
side-chat-current-iteration-docs-and-architecture-fix-plan/07-acceptance-criteria.md
```

## 9. Risk Notes

### 9.1 Do not confuse memory with history

Conversation history is prior turns in one conversation. Memory is durable
knowledge extracted from turns and scoped to user, workspace, or conversation.

They need different policies:

```txt
history: continuity and transcript replay
memory: durable facts/preferences/knowledge
RAG: external or indexed knowledge
research: pre-answer synthesis or gathering
```

### 9.2 Do not solve history only through memory

Memory extraction is lossy by design. Normal chat continuity should not depend
on a memory extractor deciding that the previous assistant answer was worth
storing.

### 9.3 Do not solve RAG as a model-callable tool by default

The docs currently define RAG as pre-model prepared context. Keeping it there
preserves policy control, source authorization, and context manifests.

Runtime tools can still exist, but they should not be the default RAG path.

### 9.4 Do not leave no-op fallbacks invisible in production-like config

No-op adapters are useful for local bootstrap and tests. They are dangerous when
the app appears to have memory/RAG/research enabled.

Production-like config should fail closed if a capability is enabled but no
concrete adapter is wired.

## 10. Bottom Line

The architecture moved in the right direction, but it is not feature-complete.

The next implementation should prioritize:

```txt
1. Make default capability status explicit.
2. Add conversation history to model context.
3. Fix the real Postgres local path.
4. Implement concrete memory.
5. Implement concrete RAG.
6. Replace include-all context admission with real budgeted admission.
7. Add research only when the product needs pre-answer synthesis.
```

Until those land, a real model run proves provider integration, not memory,
RAG, research, durable history, or mature context management.
