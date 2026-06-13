# AI Harness Build Orchestrator Handoff

Date: 2026-06-13

Audience: the next agent or team leader orchestrating implementation of the Side
Chat target AI harness.

## Mission

Build `chat-reference` into an embeddable AI harness framework for ordinary web
applications.

This is not just a chatbot and not just a RAG feature. The framework must let
host apps safely expose context, tools, commands, retrieval sources, memory,
profiles, and workflows through one governed assistant pipeline.

## Canonical Inputs

Read these first, in order:

1. `docs/CONTEXT.md`
2. `docs/architecture/overview.md`
3. `docs/architecture/production-system-design.md`
4. `docs/architecture/implementation-plan.md`
5. `docs/architecture/partner-ai-core-boundaries.md`
6. `docs/architecture/agent-runtime.md`
7. `docs/architecture/testing-system-design.md`

Treat `production-system-design.md` as the target architecture and
`implementation-plan.md` as the execution plan.

## Core Thesis

The current project has good pieces, but they do not yet converge into a proper
harness spine. The desired spine is:

```txt
host capability manifest
-> policy/profile resolution
-> conversation and turn lifecycle
-> context manager
-> optional workflow engine
-> agent runtime
-> streamed protocol events
-> durable event/tool/usage/context records
-> compaction, memory extraction, and eval feedback
```

The main invariant:

```txt
partner-ai-core owns what the model sees and what the turn is allowed to do.
agent-runtime executes one prepared turn.
host apps register capabilities instead of bypassing the harness.
```

## Current High-Risk Gaps

- `partner-ai-core` currently narrows the richer `agent-runtime` request shape,
  so profile id, context board, request tools, and tool allowlists do not flow
  cleanly through the core turn.
- Runtime currently receives only the current user message in the main turn
  path.
- Conversation history exists in persistence, but model context does not yet use
  it through a real context manager.
- Assistant turn persistence is mostly post-stream; the target is to start the
  turn before model execution and complete/fail it from terminal runtime state.
- Context snapshots are shallow and should become canonical manifests with real
  rendered context hashes.
- Tool selection must fail closed before real tools arrive.
- Multi-agent workflows do not exist yet; they need workflow runs, node records,
  isolated context, budgets, artifacts, cancellation, and audit.

## Build Order

Follow `docs/architecture/implementation-plan.md`.

Start with Phase 0 and Phase 1:

1. Define the framework substrate:
   - `HostCapabilityManifest`
   - `AssistantProfile`
   - `TurnPolicyDecision`
   - `ContextCandidate`
   - `PreparedTurnContext`
   - `ContextManifest`
   - `WorkflowRun`
   - `WorkflowNode`
   - `WorkflowArtifact`
2. Repair the honest single-turn harness:
   - stable server `conversationId` round-trip through the widget;
   - richer core runtime request;
   - server-side assistant profile resolution;
   - fail-closed tool selection;
   - assistant turn start/fail/complete in core before/during runtime.

Only after that should the team implement the context manager MVP, turn ledger
observability, tool governance, compaction, retrieval, memory, and multi-agent
workflow engine.

## Orchestration Guidance

Use parallel work only after the Phase 0 interfaces are stable. Before then,
parallel implementation will create conflicting shapes.

Recommended lanes after Phase 0:

- Core harness lane: `partner-ai-core` policy, turn lifecycle, context manager.
- Runtime lane: runtime request shape, fail-closed tool selection, event mapping.
- Persistence lane: ledger records, summaries, memory, retrieval, workflows.
- Widget/protocol lane: conversation id, activity and workflow events.
- Evals lane: context fixtures, retrieval/memory/workflow evals.
- Ops/Effect lane: typed config, scoped layers, telemetry.

Each phase should end with a verifier pass against that phase's acceptance
criteria in `implementation-plan.md`.

## Non-Negotiable Architecture Rules

- Do not move product context policy into `agent-runtime`.
- Do not make each host app implement its own context manager.
- Do not expose all registered tools by default.
- Do not add RAG as a raw tool that dumps search results into the prompt.
- Do not implement memory as appended system-prompt text.
- Do not implement multi-agent as just another tool call.
- Do not keep post-stream persistence as the source of truth for assistant
  turns.
- Do not expose provider-native stream parts, AI SDK UI messages, DB rows, Hono
  objects, Effect objects, or provider DTOs through `sidechat.v1`.

## First Ten Issues

1. Define core framework substrate types.
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

## Verification Expectations

Minimum gate for implementation slices:

```sh
npm run typecheck
npm test
npm run lint:custom
```

Use more targeted workspace commands while iterating, then the full gate before
claiming a phase complete:

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

If `npm run test:evals` does not exist yet, create it as part of the eval
foundation phase and clearly report the gap before then.

## Stop and Replan Conditions

Stop and update the plan or write an ADR if:

- an implementation requires product policy inside `agent-runtime`;
- a host app needs to bypass the capability manifest;
- model-visible context cannot be reconstructed from the manifest;
- a tool or workflow cannot be cancelled or audited;
- evals show compaction, retrieval, or memory reduces answer quality;
- an existing ADR contradicts the selected implementation path.
