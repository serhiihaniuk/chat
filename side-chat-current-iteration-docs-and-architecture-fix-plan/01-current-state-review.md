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
