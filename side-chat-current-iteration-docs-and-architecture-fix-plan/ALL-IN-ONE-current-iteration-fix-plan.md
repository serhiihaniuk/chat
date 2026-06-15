# All-in-One: Current Iteration Docs + Architecture Fix Plan

---

# File: `00-orchestrator-brief.md`

# Current Iteration Orchestrator Brief

## 1. Correction to previous review

The previous current-result plan underweighted architecture. It reviewed the documentation problem correctly, but the current iteration must also include the architectural rewrite plan already introduced for the adoptable assistant foundation.

The current iteration is not:

```txt
docs first, architecture later
```

It is:

```txt
make docs smaller and more usable while finishing the architecture seams that the docs describe
```

Documentation and architecture must converge. A smaller doc set that describes incomplete or leaky architecture is not enough. A better architecture with huge duplicated docs is also not enough.

## 2. Product framing for this iteration

Use this product framing consistently:

```txt
Side Chat is an adoptable enterprise assistant foundation.
```

Meaning:

```txt
An enterprise team can take this codebase, deploy it inside or next to its web app, own the code, and keep extending it.

They mainly add tools, connectors, agents, prompt/security guards, RAG sources, memory stores, host-app UI actions, and occasionally deeper core behavior.
```

Do not describe the project as a throwaway demo app. `apps/partner-ai-service` is the real deployable service composition. Demo/mock behavior should stay isolated as fixtures or examples.

Do not overcorrect into a heavy public SDK framework either. The codebase should be adoptable and extendable, not prematurely generic and backwards-compatible.

## 3. Current iteration goal

Raise the repo from the current improved-but-not-done state to a coherent target state:

| Area                           | Current estimate | Target for this iteration |
| ------------------------------ | ---------------: | ------------------------: |
| Documentation usability        |         5.5 / 10 |                8.5-9 / 10 |
| Architecture extension clarity |         6.5 / 10 |                8.5-9 / 10 |
| Boundary integrity             |           6 / 10 |                8.5-9 / 10 |
| Human code readability         |           7 / 10 |                8.5-9 / 10 |
| AI-code resistance             |           7 / 10 |                8.5-9 / 10 |

Assume tests/lints/typecheck pass for review purposes. Do not use passing checks as evidence that the repo is readable or architecturally done.

## 4. What changed since the old state

The repo clearly improved:

```txt
- agent-runtime now has an executor seam.
- partner-ai-core has ports for memory, RAG, turn guards, and research agents.
- service has concrete adapter folders for tools, RAG, memory, guards, agents, host commands, and observability.
- shared/ai is quarantined as copied UI code.
- the runtime streamEffect shape is much more readable.
- a human-readability gate exists.
```

This means the next work should not repeat the old readability plan. It should finish the newly introduced architecture and make the docs match the final shape.

## 5. Main remaining problems

The current result has five major remaining problem clusters.

### 5.1 Documentation is still too large and duplicated

The docs are better organized, but still too many files explain overlapping parts of the same system. Current docs include multiple architecture pages that compete with each other: foundation overview, system overview, package map, boundaries, capability model, adoption/extension map, lifecycle docs, requirements docs, and many package/local READMEs.

The target is not “more docs.” The target is fewer, sharper docs.

### 5.2 `harness` naming now harms architecture clarity

The repo uses `harness` for real domain capability contracts and also has actual test harnesses. That makes the reader ask whether a file is product architecture or test/dev scaffolding.

Reserve `harness` for test/dev harnesses. Rename domain code toward `capabilities` or `host-capabilities`.

### 5.3 Runtime/protocol boundary still leaks shared protocol types inward

`agent-runtime` and `db` import browser protocol types such as `JsonObject`, `ActivityKind`, `ActivityStatus`, and `ActivityDetails`. This weakens the intended boundary:

```txt
chat-protocol = browser/server public contract
agent-runtime = provider-neutral internal execution contract
partner-ai-core = mapper between runtime and protocol
shared = neutral primitives
```

The architecture target needs this cleaned up.

### 5.4 Extension seams exist but are not complete

The seams are present, but some are not selected or scoped properly:

```txt
- Runtime supports executorId, but core policy/profile does not clearly select it.
- Turn guards are global, not policy-selected.
- Tools do not receive enough enterprise execution scope.
- Runtime profile instructions and core profile systemPromptId are not clearly connected.
- Generic workflow vocabulary exists before the current behavior needs a generic workflow engine.
```

### 5.5 Core spine files are improved but still too dense

Important files still require too much context:

```txt
packages/partner-ai-core/src/application/stream-chat/turn/prepare-stream-chat-turn.ts
apps/partner-ai-service/src/composition/context-manager/service-context-manager.ts
packages/partner-ai-core/src/application/stream-chat/protocol/protocol-terminal-lifecycle.ts
packages/partner-ai-core/src/application/stream-chat/protocol/protocol-event-stream.ts
packages/partner-ai-core/src/ports/index.ts
```

These are not failures because tests/lints pass. They are remaining readability and architecture debt.

## 6. Combined implementation order

Use this order unless the orchestrator has a better branch split:

```txt
Phase 1: Compress documentation around the final architecture.
Phase 2: Fix naming and ownership boundaries.
Phase 3: Complete extension seams for tools, guards, executors, RAG, memory, and research.
Phase 4: Refactor core/runtime/context/protocol spine files.
Phase 5: Clean service, widget, testing, and governance around the new architecture.
Phase 6: Final acceptance review.
```

This is not “docs only.” Phase 1 is docs-heavy because the current docs are a cognitive-load problem, but every phase updates docs and code together when needed.

## 7. Orchestrator rule

For each implementation task, the agent must answer:

```txt
Which canonical doc describes this concept?
Which package owns this concept?
Which extension seam should an enterprise team use?
Which details must not leak across the boundary?
Can a lower-context maintainer understand the changed flow locally?
```

If any answer is unclear, the task is not done.

---

# File: `01-current-state-review.md`

# Current State Review

## 1. Review assumptions

This review did not run tests, lints, typecheck, build, or custom gates. Treat all static checks and tests as passing.

The review focuses on:

```txt
documentation usability
architecture completion
boundary ownership
extension readiness
human cognitive-load readability
```

## 2. Summary verdict

The repo is in a better state than the original readability review. It now has meaningful architecture seams and better human-readability rules. But the current iteration is not done because the new architecture is only partially settled and the documentation still consumes too much reader context.

Current estimate:

| Area                           | Estimate | Why                                                                                   |
| ------------------------------ | -------: | ------------------------------------------------------------------------------------- |
| Human code readability         |   7 / 10 | Better stage names and seams, but several spine files are still dense.                |
| Documentation usability        | 5.5 / 10 | More organized than before, still too many overlapping docs and local READMEs.        |
| Architecture extension clarity | 6.5 / 10 | Good seams exist, but key selections/scopes are missing or unclear.                   |
| Boundary integrity             |   6 / 10 | Protocol types still leak into runtime/db/internal contracts.                         |
| AI-code resistance             |   7 / 10 | Skill/gate exists, but docs and concepts still encourage broad AI-style abstractions. |

## 3. What is good and should be preserved

### 3.1 Runtime execution seam exists

`agent-runtime` now has an executor seam:

```txt
packages/agent-runtime/src/runtime/executors/agent-executor.ts
packages/agent-runtime/src/runtime/executors/ai-sdk-tool-loop-executor.ts
packages/agent-runtime/src/runtime/executors/executor-selection.ts
```

This is the right direction. AI SDK execution can be one executor. A future LangGraph executor can be another executor. The rest of the system should see only provider-neutral runtime events.

### 3.2 Extension ports exist in core

`partner-ai-core` has first-class ports for important extension areas:

```txt
packages/partner-ai-core/src/ports/turn-guard.ts
packages/partner-ai-core/src/ports/rag-retriever.ts
packages/partner-ai-core/src/ports/memory-port.ts
packages/partner-ai-core/src/ports/research-agent.ts
```

This is good. The current work should finish selection, scoping, naming, and lifecycle integration, not delete these seams.

### 3.3 Service adapter folders now match the adoption story

The service has folders for enterprise-owned implementations:

```txt
apps/partner-ai-service/src/adapters/tools/**
apps/partner-ai-service/src/adapters/rag/**
apps/partner-ai-service/src/adapters/memory/**
apps/partner-ai-service/src/adapters/guards/**
apps/partner-ai-service/src/adapters/agents/**
apps/partner-ai-service/src/adapters/host-commands/**
apps/partner-ai-service/src/adapters/observability/**
```

This makes the “take the codebase and connect your services” story concrete. Keep this direction.

### 3.4 Copied `shared/ai/**` quarantine exists

The copied UI folder is documented as vendor-style code. Keep treating it as a quarantine, not a project style source.

## 4. What is still wrong

### 4.1 The docs are still a cognitive-load problem

Current docs include 24 Markdown files under `docs/`, around 1500 lines total, plus many package and adapter READMEs. The issue is not raw line count alone. The issue is overlapping purpose.

Examples of overlapping docs:

```txt
foundation-overview.md
system-overview.md
package-map.md
boundaries.md
capability-model.md
adoption-extension-map.md
assistant-turn-lifecycle.md
stream-chat-flow.md
domain/lifecycle.md
functional-requirements.md
non-functional-requirements.md
```

A reader does not know which one is canonical. AI agents will over-read, merge concepts incorrectly, or produce more wall-of-text documentation.

### 4.2 Domain `harness` conflicts with test harnesses

Current files include real product/domain code under:

```txt
packages/partner-ai-core/src/domain/harness/**
packages/partner-ai-core/src/domain/harness.ts
apps/partner-ai-service/src/composition/manifest/service-harness.ts
```

The repo also has:

```txt
test-harness/**
```

This overloads `harness`. It makes product capability manifests sound like test fixtures. Rename product/domain harness code toward `capabilities` or `host-capabilities`.

### 4.3 Runtime depends on public protocol types

Examples:

```txt
packages/agent-runtime/src/tools/runtime-tool.ts
  imports ActivitySource and JsonObject from @side-chat/chat-protocol

packages/agent-runtime/src/runtime/contract/runtime-event.ts
  imports ActivityDetails, ActivityKind, ActivityStatus from @side-chat/chat-protocol
```

This makes the runtime contract partially browser-protocol-shaped. It is convenient, but it weakens the boundary.

Target:

```txt
@side-chat/shared owns JsonObject and neutral JSON helpers.
agent-runtime owns RuntimeActivityKind/Status/Details or imports neutral shared primitives.
partner-ai-core maps runtime activity to protocol activity.
chat-protocol remains browser/server public sidechat.v1 contract.
```

### 4.4 DB depends on protocol primitives

If `db` imports protocol only for `JsonObject`, move `JsonObject` to `shared` and import it from there. Persistence should not depend on browser protocol just to store JSON.

If DB intentionally stores protocol snapshots, name that explicitly and keep it isolated.

### 4.5 `prepareStreamChatTurn` is still too much local context

Current file:

```txt
packages/partner-ai-core/src/application/stream-chat/turn/prepare-stream-chat-turn.ts
226 lines
```

The top-level function improved with step comments, but it still contains too many stages inline:

```txt
authority
correlation
received observation
policy plan
guards
conversation ensure
authority check
append user message
start assistant turn
prepare context
record context snapshot
record started observation
return prepared turn
```

The desired shape is a readable spine with named helpers. The comments should describe each lifecycle step, not compensate for a large function body.

### 4.6 `service-context-manager` is the new density hotspot

Current file:

```txt
apps/partner-ai-service/src/composition/context-manager/service-context-manager.ts
276 lines
```

It mixes:

```txt
profile resolution
RAG retrieval
memory recall
research agent run
candidate conversion
candidate inclusion/drop decisions
context section rendering
manifest hashing
runtime message creation
error mapping
```

This file is now one of the main places where architecture got better but readability lagged behind.

### 4.7 Context admission is not honest enough

The current context manager appears to describe included/dropped candidates and token budgets, but the implementation currently behaves like a simple include-all packer.

That is acceptable only if explicitly named as a simple/default admission policy. Otherwise the docs/code imply a smarter context board than exists.

Target:

```txt
selectContextCandidates
createContextAdmissionDecision
createContextSections
createContextManifest
createRuntimeMessages
```

If there is no real ranking/budgeting yet, say so in code and docs. Do not pretend.

### 4.8 Turn guards are global, not policy-selected

`TurnGuardRegistryPort` exposes a list of guards and the current flow runs them. That is a good first seam, but enterprise adoption needs policy-aware selection.

Target:

```txt
safety policy / profile decides selected guards
runTurnGuards executes only selected guards
blocked guard returns public reason + internal reason
pre-context guards run before memory/RAG/tool exposure
```

### 4.9 Runtime executor selection is not wired from core policy

Runtime can select an executor by `executorId`, but core policy/profile does not clearly decide which executor to use for a turn.

Target:

```txt
AssistantProfile or TurnPolicyDecision includes executorId / agentExecutionPolicy.
partner-ai-core passes executorId to AgentRuntimeRequest.
agent-runtime fail-closes unknown executorId before stream starts.
```

### 4.10 Runtime profile instructions and core profile prompt IDs are not aligned

Core profile uses `systemPromptId`. Runtime profile uses `systemInstructions`. The plan must decide how these connect.

Recommended target:

```txt
Host manifest/profile declares systemPromptId or inline systemInstructions.
Service composition resolves systemPromptId to actual instructions.
Core TurnPolicyDecision carries resolved system instructions or a resolved runtime profile reference.
Runtime receives model-ready instructions and does not fetch prompt content itself.
```

### 4.11 Tools need enterprise execution scope

`RuntimeToolContext` currently gives runtime/request/tool metadata. Real enterprise tools need safe scope information:

```txt
hostAppId
workspaceId
subjectId
conversationId
assistantTurnId
profileId
allowed host command names / approvals if relevant
```

Do not pass core auth objects directly into runtime tools. Pass a small runtime-owned `RuntimeToolScope` with primitive fields.

### 4.12 Generic workflow vocabulary is ahead of current behavior

The repo has workflow capability types. If this is not a real generic workflow engine yet, this term may add cognitive load.

Preferred current shape:

```txt
ResearchAgent / ResearchWorkflow = pre-answer context producer
AgentExecutor = final answer executor
TurnGuard = pre-context security/policy check
RuntimeTool = model-callable capability
```

Only use generic workflow terminology when there is actual generic workflow behavior.

### 4.13 Protocol terminal lifecycle stores/scans all events

`protocol-terminal-lifecycle.ts` currently receives a `Ref<SidechatStreamEvent[]>`. This makes finalization depend on the full emitted event list.

Target:

```txt
ProtocolStreamState accumulator
  seenStarted
  terminalEventType/code
  assistantContentBuffer
  usage
  eventCount
```

A small accumulator is easier to understand and safer for long streams than appending/scanning all events.

### 4.14 Ports index is too large

`packages/partner-ai-core/src/ports/index.ts` is about 278 lines and mixes many port definitions plus imports. Split it into focused port files and re-export from `index.ts`.

## 5. Current iteration conclusion

The current implementation should not be judged as “only documentation cleanup.” It is a partly complete architecture rewrite with docs debt. The next plan must include both:

```txt
- compress and canonicalize docs
- finish architecture ownership, boundaries, extension seams, and dense spine refactors
```

---

# File: `02-documentation-compression-plan.md`

# Documentation Compression Plan

## 1. Goal

Make documentation scannable, canonical, and smaller. Documentation should reduce context load for humans and AI agents. It must not become another architecture wall.

The target is not to document every detail. The target is to create a small set of canonical docs that answer:

```txt
What is this project?
What are the main terms?
What is the assistant turn lifecycle?
Where do I add tools, guards, RAG, memory, agents, host commands?
Which package owns which concept?
What must not cross boundaries?
```

## 2. Current docs problem

Current `docs/` contains too many overlapping architecture files:

```txt
docs/architecture/foundation-overview.md
docs/architecture/system-overview.md
docs/architecture/package-map.md
docs/architecture/boundaries.md
docs/architecture/capability-model.md
docs/architecture/adoption-extension-map.md
docs/architecture/assistant-turn-lifecycle.md
docs/architecture/stream-chat-flow.md
docs/domain/lifecycle.md
docs/domain/vocabulary.md
docs/product/functional-requirements.md
docs/product/non-functional-requirements.md
```

The problem is not that any one file is useless. The problem is that a reader must open many files to understand one system.

## 3. Target docs structure

Replace the current shape with this smaller canonical set:

```txt
docs/
├── README.md
├── domain/
│   └── vocabulary.md
├── architecture/
│   ├── system-map.md
│   ├── assistant-turn.md
│   ├── extension-seams.md
│   ├── package-boundaries.md
│   ├── runtime-and-protocol-events.md
│   └── widget-and-host-integration.md
├── product/
│   └── requirements.md
├── operations/
│   └── verification.md
└── adr/
    └── *.md
```

Optional docs can exist only if they are short and have a unique purpose.

## 4. Merge/delete map

### 4.1 Merge overview docs

Replace these:

```txt
docs/architecture/foundation-overview.md
docs/architecture/system-overview.md
docs/architecture/package-map.md
```

with:

```txt
docs/architecture/system-map.md
```

Target content:

```txt
- one paragraph product identity
- one diagram-style package map
- one table: package -> owns -> must not own -> first files to open
- one note: apps/partner-ai-service is deployable service composition, not demo app
```

Hard limit: 120 lines.

### 4.2 Merge boundary docs

Replace or merge:

```txt
docs/architecture/boundaries.md
package README boundary sections
```

into:

```txt
docs/architecture/package-boundaries.md
```

Target content:

```txt
- public protocol boundary
- runtime boundary
- core workflow boundary
- service adapter boundary
- widget/UI boundary
- persistence boundary
- shared primitives boundary
```

Each boundary should answer:

```txt
owns
may import
must not import
common mistakes
```

Hard limit: 160 lines.

### 4.3 Merge lifecycle docs

Replace these:

```txt
docs/architecture/assistant-turn-lifecycle.md
docs/architecture/stream-chat-flow.md
docs/domain/lifecycle.md
```

with:

```txt
docs/architecture/assistant-turn.md
```

Target content:

```txt
- request-to-stream lifecycle
- where guards run
- where memory/RAG/research run
- where executor is selected
- where runtime events become protocol events
- pre-start vs post-start failure semantics
- where memory write candidates happen
```

Hard limit: 160 lines.

### 4.4 Merge capability/extension docs

Replace these:

```txt
docs/architecture/capability-model.md
docs/architecture/adoption-extension-map.md
```

with:

```txt
docs/architecture/extension-seams.md
```

Target sections:

```txt
Tool
Host command
Turn guard
RAG retriever
Memory port
Research agent
Agent executor
Policy resolver
Observability adapter
```

Each seam should answer:

```txt
what it is
when it runs
what it receives
what it returns
where implementation lives
where contract lives
common mistake
```

Hard limit: 220 lines.

### 4.5 Keep but shrink vocabulary

Keep:

```txt
docs/domain/vocabulary.md
```

But rewrite it as a lookup, not an essay or architecture document.

Target format:

```md
# Vocabulary

## Core lifecycle

### Assistant turn

One user request plus the assistant execution and streamed result.
Used in: partner-ai-core, db, protocol events.
Do not confuse with: one model call.

### Turn plan

Per-turn decision that selects profile, tools, guards, RAG, memory, executor.
Used in: partner-ai-core.
Do not confuse with: the manifest declaring all possible capabilities.
```

Rules:

```txt
- No huge tables if they become unreadable.
- Each term max 4-6 lines.
- Link to architecture docs only when needed.
- Do not redefine package boundaries here.
- Do not define implementation details here.
```

Hard limit: 160 lines.

### 4.6 Merge requirements

Replace:

```txt
docs/product/functional-requirements.md
docs/product/non-functional-requirements.md
```

with:

```txt
docs/product/requirements.md
```

Target sections:

```txt
Functional requirements
Quality requirements
Security/privacy requirements
Adoption/extension requirements
Documentation/readability requirements
```

Hard limit: 180 lines.

### 4.7 Keep ADRs but stop duplicating ADR content elsewhere

Keep ADRs as decision history. Do not duplicate ADR explanations in every architecture doc.

Shorten or leave ADRs as-is depending on value. ADRs can be less frequently read than canonical docs.

### 4.8 Delete adapter-folder README spam

Current service adapter folders contain many tiny README files. They may be well-intentioned, but they fragment context.

Prefer one concise doc:

```txt
docs/architecture/extension-seams.md
```

and maybe one service adapter index:

```txt
apps/partner-ai-service/src/adapters/README.md
```

Delete tiny per-folder READMEs unless they contain unique operational information.

## 5. Package README rules

Package READMEs should be local orientation cards, not architecture chapters.

Target shape:

```md
# package-name

## Owns

3-5 bullets.

## Does not own

3-5 bullets.

## First files to open

3-7 file paths.

## Verify

1-3 commands or link to verification doc.

## Canonical docs

Links only. Do not repeat long architecture.
```

Hard limit: 50-70 lines per package README.

## 6. Documentation acceptance criteria

Documentation compression is done when:

```txt
[ ] docs/architecture has at most 6 core docs plus ADRs.
[ ] docs/domain/vocabulary.md is a lookup, not a wall of text.
[ ] package READMEs are local cards.
[ ] tiny adapter READMEs are merged or deleted.
[ ] no concept is explained in three different places.
[ ] every remaining doc has a unique purpose.
[ ] docs use the final architecture terms from the code.
[ ] docs do not mention old transitional names after code is renamed.
[ ] a new enterprise adopter can find where to add a tool, guard, RAG, memory, agent executor, or host command in under two minutes.
```

## 7. Anti-patterns to reject

Reject docs that look like this:

```txt
- giant term tables that no one scans
- repeated package descriptions across multiple docs
- AI-style prose that sounds correct but does not tell where to edit code
- historical notes in main architecture docs
- “current vs target” docs after the target is implemented
- README files that repeat the same vocabulary locally
```

---

# File: `03-architecture-ownership-and-boundaries-plan.md`

# Architecture Ownership and Boundary Fix Plan

## 1. Goal

Finish the architecture ownership cleanup so future enterprise teams and AI agents know exactly where to add behavior and what must not leak across packages.

The target architecture is:

```txt
chat-protocol
  browser/server public contract only

chat-client
  browser transport and protocol stream decoding

side-chat-widget
  embeddable UI and protocol-event-to-widget-state rendering

partner-ai-core
  assistant turn lifecycle, policy, guards, memory/RAG orchestration, runtime/protocol mapping

agent-runtime
  provider-neutral execution boundary, AI SDK/LangGraph executor adapters, runtime events, runtime tools

partner-ai-service
  deployable service composition, HTTP/SSE adapters, concrete enterprise adapters

db
  persistence schema/repositories, not browser protocol convenience imports

shared
  neutral primitives and utilities only
```

## 2. Rename domain `harness` to capabilities

### Problem

Current product/domain code uses `harness`:

```txt
packages/partner-ai-core/src/domain/harness/**
packages/partner-ai-core/src/domain/harness.ts
apps/partner-ai-service/src/composition/manifest/service-harness.ts
```

But the repo also has real test harnesses:

```txt
test-harness/**
```

This makes the product model sound like test infrastructure.

### Target

Reserve `harness` for test/dev harnesses only.

Rename product/domain files to:

```txt
packages/partner-ai-core/src/domain/capabilities/**
packages/partner-ai-core/src/domain/capabilities.ts
apps/partner-ai-service/src/composition/manifest/service-capability-manifest.ts
```

Recommended type naming:

```txt
HostCapabilityManifest
AssistantProfile
ToolCapability
RetrievalSourceCapability
MemoryPolicy
WorkflowCapability if truly generic, otherwise ResearchWorkflowCapability
```

### Acceptance criteria

```txt
[ ] No product/domain source folder is named harness.
[ ] test-harness remains the only place where harness means test/dev harness.
[ ] docs use “capabilities” or “host capabilities” for product extension declarations.
[ ] service composition file names say capability manifest, not service harness.
[ ] imports are updated directly; no compatibility alias files remain.
```

## 3. Move neutral JSON primitives out of chat-protocol

### Problem

Internal packages import protocol types only to reuse neutral primitives:

```txt
JsonObject
JsonValue
```

This makes packages depend on the public browser protocol for non-protocol reasons.

### Target

Move neutral JSON primitives to:

```txt
packages/shared/src/json.ts
```

or reuse an existing shared JSON module if one exists.

Then update imports:

```txt
agent-runtime -> @side-chat/shared
partner-ai-core internal domain/ports -> @side-chat/shared where possible
db -> @side-chat/shared
chat-protocol -> may import JsonObject from @side-chat/shared
```

### Acceptance criteria

```txt
[ ] agent-runtime does not import JsonObject from chat-protocol.
[ ] db does not import JsonObject from chat-protocol.
[ ] chat-protocol still exports protocol request/event types.
[ ] neutral JSON helpers live in shared and have no protocol dependency.
[ ] no circular dependency is introduced.
```

## 4. Stop runtime from depending on protocol activity types

### Problem

Current runtime event contract imports protocol activity types:

```txt
ActivityKind
ActivityStatus
ActivityDetails
```

That makes `RuntimeEvent` look like a protocol event. It should be provider-neutral internal runtime output.

### Target option A: runtime-owned activity types

Create runtime-owned types:

```txt
RuntimeActivityKind
RuntimeActivityStatus
RuntimeActivityDetails
RuntimeActivitySource
```

Location:

```txt
packages/agent-runtime/src/runtime/contract/runtime-activity.ts
```

Then map to protocol in:

```txt
packages/partner-ai-core/src/application/stream-chat/protocol/runtime-event-mapper.ts
```

### Target option B: shared neutral activity primitives

If activity types are truly shared between runtime and protocol, move neutral versions to:

```txt
packages/shared/src/activity.ts
```

Then both runtime and protocol import from shared, while protocol wraps them in public event shapes.

### Recommendation

Prefer option A unless the same activity type is intentionally a cross-package primitive. Runtime events are an internal execution boundary, so runtime-owned types are safer.

### Acceptance criteria

```txt
[ ] agent-runtime runtime contracts do not import chat-protocol.
[ ] runtime activity types are either runtime-owned or shared-neutral.
[ ] protocol mapper explicitly converts runtime activity to sidechat.v1 activity.
[ ] comments state that runtime activity is internal and protocol activity is browser-facing.
```

## 5. Audit protocol imports in internal packages

Run a source inspection for imports from `@side-chat/chat-protocol` in:

```txt
packages/agent-runtime/**
packages/db/**
packages/partner-ai-core/src/domain/**
packages/partner-ai-core/src/ports/**
```

Classify each import:

```txt
Allowed:
  use-case boundary receives ChatStreamRequest
  protocol mapper produces SidechatStreamEvent
  chat client/widget consume browser protocol

Suspicious:
  runtime uses protocol activity types
  db uses protocol JsonObject
  domain/ports use protocol only for convenience primitives
```

### Acceptance criteria

```txt
[ ] A short boundary comment or doc explains remaining allowed protocol imports.
[ ] Convenience imports are moved to shared or local internal types.
[ ] protocol mapping remains localized to stream-chat/protocol and protocol package/client/widget.
```

## 6. Split partner-ai-core ports index

### Problem

`packages/partner-ai-core/src/ports/index.ts` is too large and becomes a mental dumping ground.

### Target structure

```txt
packages/partner-ai-core/src/ports/
├── agent-runtime-port.ts
├── assistant-turn-lifecycle-port.ts
├── clock-port.ts
├── context-manager-port.ts
├── conversation-repository-port.ts
├── host-capability-manifest-port.ts
├── id-generator-port.ts
├── memory-port.ts
├── rag-retriever.ts
├── research-agent.ts
├── turn-guard.ts
├── turn-policy-resolver-port.ts
└── index.ts
```

`index.ts` should only re-export.

### Acceptance criteria

```txt
[ ] Each port file has one owner concept.
[ ] index.ts has no long type bodies.
[ ] imports at call sites stay readable.
[ ] comments are short and source/target oriented.
```

## 7. Clarify package ownership in docs and code

Add these package ownership rules to the compressed docs.

### agent-runtime owns

```txt
runtime request/event contracts
runtime tool contract
runtime tool registry
agent executor contract and executor selection
AI SDK executor adapter
future LangGraph executor adapter
provider error normalization
```

Must not own:

```txt
conversation persistence
turn policy
memory/RAG retrieval
browser protocol mapping
widget state
HTTP route behavior
```

### partner-ai-core owns

```txt
assistant turn lifecycle
policy resolution use
turn guard execution
memory/RAG/research orchestration
context preparation
runtime request creation
runtime-event-to-protocol-event mapping
completion/failure/memory write lifecycle
```

Must not own:

```txt
AI SDK provider DTOs
concrete Jira/Confluence/vector DB clients
React widget state
HTTP request parsing details
```

### partner-ai-service owns

```txt
HTTP/SSE adapters
service composition
concrete tool/RAG/memory/guard/agent adapters
local/dev/example registrations
```

Must not own:

```txt
core turn lifecycle decisions
runtime stream part mapping
widget state reducers
protocol event definitions
```

### chat-protocol owns

```txt
sidechat.v1 request/event/error contract
browser-facing schema and discriminants
```

Must not own:

```txt
runtime internal activity semantics
DB storage primitives
provider/tool DTOs
```

---

# File: `04-extension-seams-plan.md`

# Extension Seams Completion Plan

## 1. Goal

The repo now has extension seams, but they need to become complete enough that an enterprise team can add tools, guards, RAG, memory, research agents, and final answer executors without editing the wrong layer.

Every extension must answer:

```txt
Where is the contract?
Where is the implementation registered?
Who decides whether it is allowed for a turn?
When does it run in the assistant turn lifecycle?
What does it receive?
What does it return?
What must not leak across the boundary?
```

## 2. Tool seam

### Current concern

`RuntimeToolContext` does not carry enough enterprise scope. A real enterprise tool needs to know who/where it is acting for, but runtime should not import core auth types.

### Target runtime scope

Add a runtime-owned primitive scope object:

```ts
export type RuntimeToolScope = {
  readonly hostAppId: string;
  readonly workspaceId: string;
  readonly subjectId: string;
  readonly conversationId: string;
  readonly assistantTurnId: string;
  readonly profileId: string;
  readonly allowedHostCommandNames?: readonly string[];
};
```

Pass it through:

```txt
TurnPolicyDecision / PreparedStreamChatTurn
-> AgentRuntimeRequest
-> RuntimeProviderRequest
-> RuntimeToolContext
```

Do not pass `AuthContext` directly to `agent-runtime` tools. Keep the scope primitive and runtime-owned.

### Tool example target

```ts
export const createJiraSearchIssuesTool = ({
  jiraClient,
}: {
  readonly jiraClient: JiraClient;
}): RuntimeTool => ({
  name: "jira.search_issues",
  description: "Search Jira issues visible to the current user/workspace.",
  inputSchema: JIRA_SEARCH_ISSUES_INPUT_SCHEMA,

  execute: (input, context) =>
    Effect.gen(function* () {
      const searchInput = yield* readJiraSearchIssuesInput(input);

      const authorizedSearch = {
        workspaceId: context.scope.workspaceId,
        subjectId: context.scope.subjectId,
        query: searchInput.query,
        limit: searchInput.limit,
      };

      const issues = yield* jiraClient.searchIssues(authorizedSearch);
      return toJiraSearchIssuesToolResult(issues);
    }),
});
```

### Acceptance criteria

```txt
[ ] RuntimeToolContext has a primitive enterprise scope.
[ ] Tools do not import core AuthContext or protocol request types.
[ ] Tool allowlist still comes from turn policy.
[ ] Tool unavailable/blocked behavior is tested.
[ ] Example tool demonstrates enterprise scope usage.
```

## 3. Host command seam

### Purpose

Host commands are not backend tools. They ask the embedding web app UI to do something.

Examples:

```txt
host.open_ticket_panel
host.highlight_document_section
host.ask_user_to_confirm_action
host.navigate_to_customer
```

### Target

Keep host command declarations in the capability manifest and render/dispatch results through browser protocol/widget/host bridge. Do not execute host commands inside `agent-runtime` as if they are backend tools.

### Acceptance criteria

```txt
[ ] Docs distinguish RuntimeTool from HostCommand.
[ ] Host command declarations are selected by policy/manifest.
[ ] Widget/host-bridge handles UI actions.
[ ] Backend runtime tools do not directly manipulate browser UI.
```

## 4. Turn guard seam

### Current concern

`TurnGuardRegistryPort` exposes all guards. The current flow can run every guard globally.

### Target

Guards should be selected by policy/profile/safety policy.

Recommended shape:

```ts
export type TurnGuardRegistryPort = {
  readonly resolveGuardsForTurn: (input: {
    readonly hostAppId: string;
    readonly profileId: string;
    readonly safetyPolicyId: string;
    readonly allowedGuardIds: readonly string[];
  }) => Effect.Effect<readonly TurnGuard[], PartnerAiCoreError>;
};
```

Or keep a list registry plus a pure selector, but the policy choice must be explicit.

### Target lifecycle

```txt
resolve allowed turn plan
resolve selected guards
run pre-context guards
if blocked, fail before memory/RAG/tools/main executor
```

### Guard example

```ts
export const createPromptSecurityGuard = ({
  classifier,
}: {
  readonly classifier: PromptSecurityClassifier;
}): TurnGuard => ({
  guardId: "prompt-security.standard",
  description:
    "Blocks prompts that attempt to exfiltrate private context or override system policy.",

  check: (input) =>
    Effect.gen(function* () {
      const decision = yield* classifier.classify({
        workspaceId: input.workspace.workspaceId,
        message: input.request.message,
      });

      return decision.blocked
        ? {
            kind: "block",
            publicReason: "This request cannot be processed safely.",
            internalReason: decision.reason,
            errorCode: "policy_blocked",
          }
        : { kind: "allow" };
    }),
});
```

### Acceptance criteria

```txt
[ ] Guards run before private memory/RAG/tool access.
[ ] Guards are selected by turn policy/safety policy, not blindly global.
[ ] Blocked result has safe public reason and internal reason.
[ ] Guard failure behavior is explicit.
[ ] Tests cover allow/block/warn/failure.
```

## 5. RAG seam

### Target

RAG is pre-model context retrieval. It normally runs before the runtime executor, not as a model tool.

Contract should remain core-owned:

```txt
RagRetrieverPort.retrieve(input) -> RagContextCandidate[]
```

RAG implementation lives in service adapters:

```txt
apps/partner-ai-service/src/adapters/rag/**
```

### Required candidate fields

```txt
candidateId
sourceId
title
content
score/provenance
estimatedTokens
trustLevel
redactionClass
metadata
```

### Acceptance criteria

```txt
[ ] RAG receives allowedSourceIds from policy.
[ ] RAG receives auth/workspace scope, not raw browser request only.
[ ] Runtime does not fetch RAG directly.
[ ] RAG candidates are mapped to context candidates in core/service context manager.
[ ] Empty RAG is valid.
[ ] Failure behavior is explicit: fail turn, degrade, or emit no context by policy.
```

## 6. Memory seam

### Target

Memory is durable user/workspace/conversation knowledge. It is not RAG.

Memory lifecycle:

```txt
pre-model: recall allowed memory candidates
post-turn: extract/record allowed memory write candidates
```

### Acceptance criteria

```txt
[ ] Memory policy modes are explicit: disabled/read/read_write.
[ ] Recall happens during context preparation.
[ ] Write candidates happen after terminal output and policy check.
[ ] No silent memory write from model output without policy.
[ ] Memory candidates include scope and provenance.
```

## 7. Research agent seam

### Purpose

A research agent gathers or synthesizes context before the main answer.

It is not the final answer executor unless explicitly selected as the executor.

### Target

```ts
export type ResearchAgentPort = {
  readonly runResearch: (
    input: ResearchAgentInput,
  ) => Effect.Effect<ResearchAgentOutput, PartnerAiCoreError>;
};
```

Output maps to:

```txt
ContextCandidate[]
WorkflowArtifact / ResearchArtifact
context manifest source entries
```

### Acceptance criteria

```txt
[ ] Research output is not directly browser protocol.
[ ] Research can be disabled by policy/profile.
[ ] Research sources are preserved in context manifest.
[ ] Research failure behavior is explicit.
[ ] Generic workflow naming is avoided unless a real workflow engine exists.
```

## 8. Agent executor seam

### Current concern

Runtime supports executor selection, but core does not clearly select executor from policy/profile.

### Target

Add an executor decision to profile/policy:

```ts
export type AssistantProfile = {
  readonly profileId: string;
  readonly displayName: string;
  readonly systemPromptId?: string;
  readonly executorId: string;
  // existing policy fields
};

export type TurnPolicyDecision = {
  readonly profileId: string;
  readonly executorId: string;
  readonly providerId: string;
  readonly modelId: string;
  readonly allowedToolNames: readonly string[];
  readonly allowedRetrievalSourceIds: readonly string[];
  readonly memoryPolicyId?: string;
  readonly safetyPolicyId: string;
};
```

Then pass:

```txt
TurnPolicyDecision.executorId
-> PreparedStreamChatTurn
-> AgentRuntimeRequest.executorId
-> agent-runtime executor selection
```

### Executor example

```ts
export const createLangGraphResearchExecutor = ({
  client,
}: {
  readonly client: LangGraphClient;
}): AgentExecutor => ({
  executorId: "langgraph.research",
  description: "Runs the LangGraph research assistant and maps its stream to RuntimeEvent values.",

  stream: (request) => createLangGraphRuntimeEventStream({ client, request }),
});
```

### Acceptance criteria

```txt
[ ] Core policy/profile selects executorId.
[ ] Runtime fail-closes unknown executorId before stream starts.
[ ] AI SDK details stay inside AI SDK executor.
[ ] LangGraph details stay inside LangGraph executor adapter.
[ ] Core/protocol/widget only see RuntimeEvent/SidechatStreamEvent.
```

## 9. Profile and system prompt resolution

### Current concern

Core profile uses `systemPromptId`; runtime profile uses `systemInstructions`. The connection is unclear.

### Target

Choose one explicit flow:

```txt
HostCapabilityManifest declares profile and systemPromptId.
Service composition resolves systemPromptId to text.
partner-ai-core includes resolved system instructions in the runtime request.
agent-runtime receives resolved instructions and does not fetch prompt storage.
```

or:

```txt
HostCapabilityManifest declares inline systemInstructions for now.
Future prompt storage can be added behind service composition.
```

### Recommendation

For early development, prefer explicit inline `systemInstructions` or a small service-level prompt resolver. Do not keep an unresolved ID and resolved text disconnected.

### Acceptance criteria

```txt
[ ] A reader can follow where system instructions come from.
[ ] Runtime receives resolved instructions, not a mysterious ID.
[ ] No duplicate profile concepts exist in core and runtime without a mapping function.
[ ] Tests cover selected profile -> runtime request instructions.
```

---

# File: `05-core-runtime-context-protocol-plan.md`

# Core, Runtime, Context, and Protocol Refactor Plan

## 1. Goal

Refactor the main spine files so the architecture is readable and the extension seams are actually used.

Primary targets:

```txt
packages/partner-ai-core/src/application/stream-chat/turn/prepare-stream-chat-turn.ts
apps/partner-ai-service/src/composition/context-manager/service-context-manager.ts
packages/partner-ai-core/src/application/stream-chat/protocol/protocol-event-stream.ts
packages/partner-ai-core/src/application/stream-chat/protocol/protocol-terminal-lifecycle.ts
packages/agent-runtime/src/runtime/contract/**
packages/agent-runtime/src/tools/runtime-tool.ts
```

## 2. Refactor `prepareStreamChatTurn` into a true lifecycle spine

### Current issue

The function has comments and improved names, but too many stages still live inline.

### Target shape

```ts
export const prepareStreamChatTurn = (
  ports: StreamChatPorts,
  input: StreamChatInput,
): Effect.Effect<PreparedStreamChatTurn, PartnerAiCoreError> =>
  Effect.gen(function* () {
    // Prove the host app allows this subject to act in the requested workspace.
    const authContext = yield* resolveAuthorizedContext(input);

    // Create the request-level correlation used by observations and persisted records.
    const requestScope = createStreamChatRequestScope(ports, input, authContext);

    // Record that the request was received before any agent/runtime work can start.
    yield* recordReceivedStreamRequest(ports, input, requestScope);

    // Choose the profile, tools, guards, RAG sources, memory policy, and executor for this turn.
    const turnPlan = yield* resolveAllowedTurnPlan(ports, input, authContext);

    // Block unsafe prompts before private memory, RAG, tools, or the main executor are exposed.
    const guardDecisions = yield* runSelectedTurnGuards(ports, input, authContext, turnPlan);

    // Load or create only the conversation this subject may access.
    const conversation = yield* ensureAuthorizedConversation(ports, input, authContext);

    // Store the user-visible message that starts this assistant turn.
    const userMessage = yield* appendUserMessage(ports, input, authContext, conversation);

    // Create the assistant turn record that streamed runtime/protocol events attach to.
    const assistantTurn = yield* startAssistantTurnRecord(
      ports,
      input,
      requestScope,
      turnPlan,
      conversation,
    );

    // Gather host context, memory, RAG, research output, and tool context into a model-ready board.
    const preparedContext = yield* prepareAndRecordTurnContext(ports, input, {
      authContext,
      conversation,
      userMessage,
      assistantTurn,
      turnPlan,
    });

    // Mark the stream as startable after all durable pre-start setup has succeeded.
    yield* recordStartedStreamTurn(ports, input, requestScope, turnPlan, assistantTurn);

    return toPreparedStreamChatTurn({
      input,
      requestScope,
      authContext,
      turnPlan,
      guardDecisions,
      conversation,
      userMessage,
      assistantTurn,
      preparedContext,
    });
  });
```

The exact types can differ. The required quality is that the function reads like a lifecycle checklist.

### Helper rules

```txt
- helper names must be concrete, not generic handle/process/map
- each helper has one lifecycle reason to change
- persistence failure mapping stays local and named
- authority checks are not hidden inside unrelated persistence code
- comments explain why the step exists, not how TypeScript works
```

### Acceptance criteria

```txt
[ ] prepareStreamChatTurn is under about 80-110 readable lines.
[ ] no helper name hides its lifecycle stage.
[ ] pre-start failure semantics are obvious.
[ ] post-start failure handling remains tested/named.
[ ] guard/RAG/memory/executor concepts enter at visible stages.
```

## 3. Split `service-context-manager`

### Current issue

This file is the main density hotspot after the architecture rewrite. It performs many steps in one place.

### Target folder

```txt
apps/partner-ai-service/src/composition/context-manager/
├── service-context-manager.ts
├── context-profile-resolution.ts
├── context-source-gathering.ts
├── context-candidate-selection.ts
├── context-section-rendering.ts
├── context-manifest.ts
└── runtime-message-rendering.ts
```

### Target top-level flow

```ts
export const createServiceContextManager = (
  options: ServiceContextManagerOptions,
): ContextManagerPort => ({
  prepareTurnContext: (input) =>
    Effect.gen(function* () {
      // Resolve the selected profile and context policies for this turn.
      const contextProfile = yield* resolveContextProfile(input);

      // Gather all allowed context sources: host context, tools, memory, RAG, research.
      const gatheredContext = yield* gatherAllowedTurnContext(options, input, contextProfile);

      // Convert source-specific records into one comparable candidate list.
      const candidates = createContextCandidates(gatheredContext);

      // Select what is admitted to the model context. Simple include-all is valid only if named.
      const admission = selectContextCandidates(candidates, contextProfile.budget);

      // Render admitted candidates into context sections and runtime messages.
      const sections = createPreparedContextSections(admission.included);
      const manifest = createPreparedContextManifest(admission, sections);
      const runtimeMessages = createRuntimeMessages(input, sections);

      return toPreparedTurnContext({ sections, manifest, runtimeMessages, admission });
    }),
});
```

### Context admission honesty

If the implementation still includes all candidates, name it honestly:

```txt
createSimpleContextAdmission
```

and document:

```txt
This default admission includes all candidates and records their estimated tokens.
It is intentionally simple until a real budget/ranking strategy is added.
```

Do not call it advanced budget selection if no selection happens.

### Acceptance criteria

```txt
[ ] service-context-manager.ts is a short composition file.
[ ] profile resolution, gathering, selection, section rendering, manifest creation, and runtime messages are separate.
[ ] admission decision is honest: real selection or clearly named simple admission.
[ ] memory/RAG/research failures have explicit behavior.
[ ] context manifest explains included/dropped candidates without false sophistication.
```

## 4. Replace emitted-event list with protocol stream accumulator

### Current issue

`protocol-terminal-lifecycle.ts` receives all emitted protocol events as an array. This makes finalization scan all events and store the full stream.

### Target

Create a small accumulator:

```ts
export type ProtocolStreamState = {
  readonly seenStarted: boolean;
  readonly terminalEventType?: "sidechat.completed" | "sidechat.error";
  readonly terminalErrorCode?: ProtocolErrorCode;
  readonly assistantContent: string;
  readonly usage?: RuntimeUsage;
  readonly eventCount: number;
};
```

Use helpers:

```txt
createProtocolStreamState
rememberStartedEvent
rememberRuntimeMappedProtocolEvent
rememberTerminalEvent
finalizeProtocolStreamFromState
```

### Target lifecycle

```txt
emit sidechat.started
map runtime events and update ProtocolStreamState
on runtime failure, emit sidechat.error and update ProtocolStreamState
finalize from ProtocolStreamState
record completion/failure/memory writes
```

### Acceptance criteria

```txt
[ ] finalization does not require Ref<SidechatStreamEvent[]>.
[ ] accumulator stores only what finalization needs.
[ ] exactly-one-terminal rule remains explicit.
[ ] memory write candidate extraction uses accumulated assistant content.
[ ] long streams do not accumulate full event arrays only for finalization.
```

## 5. Make protocol stream segments explicit

### Current issue

`protocol-event-stream.ts` is not terrible, but it still hides state/segment creation in a nested flow.

### Target shape

```ts
export const createProtocolEventStream = (...): Stream.Stream<SidechatStreamEvent, PartnerAiCoreError> =>
  Stream.unwrap(
    Effect.map(createProtocolStreamState(ports, input, turn), (state) =>
      concatProtocolStreamSegments({
        started: createStartedProtocolSegment(ports, input, turn, state),
        runtimeEvents: createRuntimeProtocolEventSegment(ports, input, turn, state),
        finalization: createProtocolFinalizationSegment(ports, input, turn, state),
      }),
    ),
  );
```

Or an equivalent Effect/Stream-safe style if clearer.

### Acceptance criteria

```txt
[ ] top-level stream reads started -> runtime events -> finalization.
[ ] the point where runtime failures become protocol errors is visible.
[ ] protocol sequence ownership is explicit.
[ ] state updates are centralized and named.
```

## 6. Runtime contract cleanup

### Target files

```txt
packages/agent-runtime/src/runtime/contract/runtime-request.ts
packages/agent-runtime/src/runtime/contract/runtime-event.ts
packages/agent-runtime/src/tools/runtime-tool.ts
packages/agent-runtime/src/runtime/turn/prepare-runtime-turn.ts
```

### Tasks

```txt
1. Remove imports from chat-protocol in runtime contracts.
2. Add runtime-owned activity types or shared-neutral primitives.
3. Add RuntimeToolScope.
4. Pass tool scope from AgentRuntimeRequest to RuntimeToolContext.
5. Keep RuntimeEvent provider-neutral and internal.
```

### Acceptance criteria

```txt
[ ] Runtime contract files do not import chat-protocol.
[ ] RuntimeToolContext includes scope needed by enterprise tools.
[ ] AI SDK executor can still map tool parts to RuntimeEvent activity.
[ ] RuntimeEvent -> SidechatStreamEvent mapping happens only in partner-ai-core protocol mapper.
```

## 7. Runtime executor integration

### Tasks

```txt
1. Add executorId to core policy decision/profile if missing.
2. Pass executorId to AgentRuntimeRequest.
3. Ensure runtime executor selection fail-closes unknown executor.
4. Add deterministic test executor for tests/fixtures.
5. Add LangGraph adapter shape only if needed now; otherwise document target seam without adding code.
```

### Acceptance criteria

```txt
[ ] core decides executor, not model.
[ ] runtime selects executor, not protocol/widget/service route.
[ ] unknown executor does not half-open the stream.
[ ] runtime events remain provider-neutral.
```

## 8. Workflow vocabulary cleanup

### Problem

Generic `WorkflowCapability` language can make the architecture look bigger than current behavior.

### Target rule

Use the narrowest true name:

```txt
TurnGuard: validates before context/tools/main executor.
ResearchAgent: produces pre-answer context.
AgentExecutor: produces the final runtime event stream.
RuntimeTool: callable capability during execution.
HostCommand: UI action requested from the host app.
```

Only keep generic `WorkflowCapability` if there is real generic workflow behavior.

### Acceptance criteria

```txt
[ ] Docs do not imply a workflow engine exists unless it does.
[ ] Code names match current behavior.
[ ] Research/pre-answer behavior is not disguised as generic workflow.
```

---

# File: `06-service-widget-testing-governance-plan.md`

# Service, Widget, Testing, and Governance Plan

## 1. Goal

Finish the current iteration outside the core spine: service composition, widget-owned code, tests as behavior documentation, and governance checks.

## 2. Service composition

### Current state

Service adapter folders now exist and match the adoption story. Keep them.

Main concerns:

```txt
- service-composition.ts can grow into a wiring wall
- service-config.ts may mix config reading, defaults, and validation
- service-context-manager.ts is too dense and handled in the core/context phase
- tiny adapter READMEs fragment documentation
```

### Target

Keep service code as composition and concrete adapter implementation.

Recommended folder responsibilities:

```txt
apps/partner-ai-service/src/inbound/http/**
  HTTP/SSE parsing and response adapters only

apps/partner-ai-service/src/composition/**
  wire ports, registries, manifests, runtime, service dependencies

apps/partner-ai-service/src/adapters/**
  concrete tools, RAG, memory, guards, research agents, host commands, observability, persistence
```

### Acceptance criteria

```txt
[ ] HTTP routes do not decide turn policy.
[ ] HTTP routes do not know AI SDK/runtime stream parts.
[ ] composition wires dependencies but does not hide business workflow.
[ ] adapter READMEs are merged/deleted unless uniquely useful.
[ ] demo/mock tools are under examples/test/dev naming and do not define architecture.
```

## 3. Widget-owned code

### Scope

Do not score copied UI code as project architecture:

```txt
packages/side-chat-widget/src/shared/ai/**
```

Review project-owned widget code:

```txt
packages/side-chat-widget/src/app/**
packages/side-chat-widget/src/widgets/**
packages/side-chat-widget/src/features/**
packages/side-chat-widget/src/entities/**
packages/side-chat-widget/src/shared/ui/**
```

### Current concern

Some project-owned widget files remain moderately dense:

```txt
packages/side-chat-widget/src/features/chat/model/widget-stream-events.ts
packages/side-chat-widget/src/features/chat/model/use-widget-chat.ts
packages/side-chat-widget/src/entities/chat/model/activity.ts
packages/side-chat-widget/src/features/conversation/ui/**
```

### Target ownership

```txt
chat-client
  transport + decoding

features/chat/model
  submit/stream lifecycle and state transition orchestration

entities/chat/model
  pure message/activity state transformations

features/conversation/ui
  render project-owned message/activity state

shared/ai
  copied visual primitives only
```

### Acceptance criteria

```txt
[ ] Widget does not know AI SDK, LangGraph, runtime provider DTOs, RAG internals, or memory internals.
[ ] Widget consumes SidechatStreamEvent / chat-client state only.
[ ] Stream event application uses explicit state transition helpers.
[ ] Rendering components are shallow and use specific names.
[ ] No business logic is moved into shared/ai copied components.
```

## 4. `useWidgetChat` and stream event application

### Target submit flow

The submit flow should remain readable as:

```txt
validate input
create optimistic messages
build protocol request
open stream
apply stream events
complete/fail/abort UI state
```

If the current file is already readable enough, do not churn it. But if new architecture changes add complexity, split before it grows.

### Acceptance criteria

```txt
[ ] submitMessage reads as high-level flow.
[ ] abort/error/success transitions are separate.
[ ] host context retrieval is named.
[ ] protocol request construction is named.
[ ] stream event application is testable independently.
```

## 5. Testing as behavior documentation

### Rule

Tests should document visible behavior and extension seam behavior, not preserve old internal shapes.

Current repo is early-stage. Delete tests for old shapes when the old shape is intentionally removed.

### Required coverage for this iteration

```txt
- selected guard allow/block/failure
- selected executorId passed into runtime request
- unknown executor fails before stream starts
- RuntimeToolContext includes enterprise scope
- RAG candidates selected by allowed source ids
- memory read/write modes
- context admission include/drop behavior or simple include-all behavior
- RuntimeEvent -> SidechatStreamEvent mapping after runtime-owned activity types
- protocol stream finalization with accumulator
- service manifest/capability rename
- widget stream event state transitions if protocol shapes change
```

Do not run tests in this review. Implementation agents should run them when they modify code unless specifically told not to.

## 6. Governance/check scripts

### Current good direction

A human-readability gate exists. Keep it, but avoid making it another giant unreadable artifact.

### Needed updates

```txt
- update path rules after harness -> capabilities rename
- update protocol boundary checks after shared JSON extraction
- ensure agent-runtime cannot import chat-protocol
- ensure db cannot import chat-protocol except explicitly allowed snapshot modules
- ensure shared/ai quarantine still applies
- ensure docs count/size does not grow back into walls
```

### Documentation size governance

Add a simple governance rule, even if manual:

```txt
- each core architecture doc has a line budget
- new docs require a unique purpose
- docs cannot redefine vocabulary already in vocabulary.md
- package README files stay local cards
```

This can be a script or an `AGENTS.md` rule. Do not over-engineer it.

## 7. Quality skill update

The repo skill should be a router/checklist, not a huge textbook.

Recommended shape:

```txt
.agents/skills/side-chat-code-quality-gate/SKILL.md
  short trigger, mandatory rules, review checklist

.agents/skills/side-chat-code-quality-gate/references/**
  examples, detailed comments guide, architecture notes
```

Acceptance criteria:

```txt
[ ] SKILL.md is short enough for agents to use.
[ ] detailed examples are moved to references.
[ ] skill references the compressed canonical docs.
[ ] skill includes the architecture seam rules from this iteration.
```

## 8. Final repo review checklist

Before accepting the iteration, review these questions:

```txt
Can a new adopter find where to add a tool?
Can a new adopter find where to add a prompt/security guard?
Can a new adopter find where to connect RAG?
Can a new adopter find where to connect memory?
Can a new adopter find where to add a LangGraph/future executor?
Can a maintainer explain RuntimeEvent vs SidechatStreamEvent locally?
Can a maintainer explain why chat-protocol is not imported by agent-runtime?
Can a maintainer read prepareStreamChatTurn without opening ten helpers?
Can a maintainer scan docs without reading multiple overlapping architecture pages?
```

If the answer is no, the iteration is not done.

---

# File: `07-acceptance-criteria.md`

# Current Iteration Acceptance Criteria

## 1. Overall acceptance

This iteration is complete only when documentation compression and architecture rewrite completion are both done.

It is not enough that:

```txt
- tests pass
- lints pass
- docs exist
- extension ports exist
```

The result must be readable, cohesive, and adoptable.

## 2. Documentation acceptance

```txt
[ ] docs/architecture is reduced to a small canonical set.
[ ] foundation/system/package docs are merged into one system map.
[ ] lifecycle docs are merged into one assistant-turn doc.
[ ] capability/adoption docs are merged into one extension-seams doc.
[ ] vocabulary is a compact lookup, not an architecture essay.
[ ] requirements are consolidated and readable.
[ ] package READMEs are local orientation cards.
[ ] tiny adapter READMEs are removed or merged.
[ ] docs do not define the same concept in multiple places.
[ ] docs use final code terms after renames.
```

## 3. Naming/ownership acceptance

```txt
[ ] Product/domain code no longer uses harness as the concept/folder name.
[ ] test-harness remains the only harness meaning test/dev harness.
[ ] product capability files use capabilities/host-capabilities naming.
[ ] service manifest file names use capability manifest, not harness.
[ ] no compatibility alias files are kept for old unshipped names.
```

## 4. Boundary acceptance

```txt
[ ] agent-runtime runtime contracts do not import chat-protocol.
[ ] agent-runtime tools do not import JsonObject/ActivitySource from chat-protocol.
[ ] db does not import chat-protocol only for JSON primitives.
[ ] shared owns neutral JSON primitives.
[ ] RuntimeEvent activity types are runtime-owned or shared-neutral.
[ ] RuntimeEvent -> SidechatStreamEvent mapping is explicit in partner-ai-core protocol mapper.
[ ] chat-protocol remains browser/server sidechat.v1 contract.
```

## 5. Extension seam acceptance

```txt
[ ] RuntimeToolContext includes primitive enterprise scope.
[ ] tools do not import AuthContext or browser protocol request types.
[ ] turn guards are selected by profile/safety policy, not blindly global.
[ ] guard block/allow/failure behavior is tested.
[ ] RAG runs in context preparation and uses allowedSourceIds.
[ ] memory recall/write follows memory policy.
[ ] research agent output becomes context/artifact, not browser protocol.
[ ] executorId is selected by profile/policy and passed to runtime.
[ ] unknown executor fails before stream starts.
[ ] systemPromptId/systemInstructions resolution is explicit.
```

## 6. Core spine acceptance

```txt
[ ] prepareStreamChatTurn reads as lifecycle table of contents.
[ ] service-context-manager is split into profile/gather/select/render/manifest/runtime-message steps.
[ ] context admission is honest: real budget selection or clearly named simple admission.
[ ] protocol-terminal-lifecycle uses a small accumulator instead of requiring full emitted event array.
[ ] protocol-event-stream shows started -> runtime events -> finalization.
[ ] partner-ai-core ports are split into focused files.
```

## 7. Service/widget acceptance

```txt
[ ] service HTTP routes remain adapters, not product workflow.
[ ] concrete integrations stay under service adapters.
[ ] demo/mock tools are examples/test/dev fixtures only.
[ ] widget consumes protocol/client state only.
[ ] widget does not know runtime/provider/RAG/memory internals.
[ ] shared/ai remains copied visual primitives only.
```

## 8. Human-readability acceptance

```txt
[ ] important workflows use named lifecycle steps.
[ ] comments explain source, target, hidden detail, and invariant at dense boundaries.
[ ] no comments compensate for avoidably clever code.
[ ] no new broad abstraction reduces lines while increasing concepts.
[ ] no project-owned code copies shared/ai style.
[ ] new code remains under human cognitive-load budget.
```

## 9. Final score target

Use this final target after review:

| Area                           |     Target |
| ------------------------------ | ---------: |
| Documentation usability        | 8.5-9 / 10 |
| Architecture extension clarity | 8.5-9 / 10 |
| Boundary integrity             | 8.5-9 / 10 |
| Human code readability         | 8.5-9 / 10 |
| AI-code resistance             | 8.5-9 / 10 |

A result that improves docs but leaves architecture seams incomplete should not pass. A result that adds architecture seams but leaves docs unreadable should not pass either.

## 10. Worker-agent prompt block

```md
You are implementing the current Side Chat docs + architecture fix iteration.

Assume the previous human-readability plan is active. Do not restart it. This task completes the current architecture rewrite and compresses docs around the final shape.

Rules:

- The repo is early-stage. Rewrite to final intended shape; do not keep compatibility aliases for old internal names.
- Do not treat tests/lints passing as enough. Human readability and architecture boundary clarity are required.
- Do not add more wall-of-text documentation. Compress and delete duplicates.
- `shared/ai/**` is copied/vendor-style UI. Do not imitate it and do not add business logic there.
- `apps/partner-ai-service` is deployable service composition, not a demo app.

When changing code, report:

1. which concept/package owns the change,
2. which extension seam is affected,
3. which docs were updated or deleted,
4. which old terms/files were removed,
5. how the change improves local readability.
```
