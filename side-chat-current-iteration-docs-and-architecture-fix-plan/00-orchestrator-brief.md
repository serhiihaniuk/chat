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
