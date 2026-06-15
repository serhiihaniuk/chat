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
