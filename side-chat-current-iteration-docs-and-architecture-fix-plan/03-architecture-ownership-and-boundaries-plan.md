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
