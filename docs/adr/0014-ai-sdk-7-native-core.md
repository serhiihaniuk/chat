# ADR 0014: AI SDK 7 Is the Application Core

Status: accepted 2026-07-11; target-state implementation pending

Supersedes: ADR 0003, ADR 0005, and ADR 0006 at the v7 cutover.

## Context

Side Chat is pre-alpha, so current internal boundaries carry no compatibility promise. The existing architecture was designed before AI SDK 7 shipped. It keeps the SDK behind `AiRuntimePort`, translates provider parts through `RuntimeEvent`, and uses Effect for the surrounding lifecycle. That was defensible when the SDK was only a model-call engine.

AI SDK 7 now owns the agent loop, typed UI messages, tool lifecycle, approval vocabulary, stream protocol, timeout/abort inputs, client state, and provider abstraction. WorkflowAgent adds a durable execution option in the same TypeScript ecosystem. Keeping parallel Side Chat abstractions for those concepts would preserve replaceability by duplicating the system that must actually be maintained.

## Decision

AI SDK 7 is the new wing's application core:

- `UIMessage`, `UIMessageChunk`, tools, approval parts, agents, and transports keep their SDK names and shapes.
- Provider instances and agent construction stay server-only. Provider-specific packages never enter browser packages.
- The service and widget may share the stable `ai` UI types. They do not share provider DTOs or model-call internals.
- Provider replacement remains a supported seam. Replacing AI SDK itself is no longer an architectural promise.
- The new wing uses plain TypeScript, zod, async/await, and `AbortSignal`. It does not use Effect, an Effect compatibility layer, or Effect-shaped ports.
- Exact package pins and permanent compatibility tests turn dependency upgrades into deliberate architecture events.
- Implementation is a greenfield service/widget-state wing followed by one deletion cutover. The old runtime is reference material, not a migration layer.

This decision does not claim that plain TypeScript recreates Effect's runtime. It removes the need to recreate it: AI SDK/Workflow owns agent execution, durability, interruption inputs, and stream lifecycle; Side Chat retains only product policy and application resource ownership.

## Side Chat-owned responsibilities

The SDK cannot own these product boundaries, so they remain explicit Side Chat code:

- authentication, workspace/tenant ownership, and request authorization;
- conversation/message records and provenance;
- tool exposure policy, approval authority, audit, and idempotency;
- safe public errors and provider-content scrubbing;
- admission/capacity limits and application shutdown;
- widget components, design system, host-page integration, and product behavior.

## Alternatives rejected

- **Keep `AiRuntimePort` and `RuntimeEvent` around AI SDK 7:** duplicates SDK concepts and forces every new feature through two vocabularies.
- **Complete the Effect v4 rewrite first:** gives two frameworks jurisdiction over the same lifecycle and tool/stream concerns.
- **Preserve the old runtime as fallback:** creates a permanent second architecture. The fallback in ADR 0016 is AI SDK 7 ToolLoopAgent, not the current stack.
- **Adopt LangGraph or a Python sidecar:** adds another runtime without improving the embedded TypeScript UI/stream path.

## Consequences

The repository accepts stronger coupling to AI SDK's stable public protocol and UI types. Exact pins, source verification, and conformance tests mitigate that coupling; they do not pretend it is absent. The v7 cutover deletes `AiRuntimePort`, `RuntimeEvent`, the Effect server core, and their compatibility/governance rules. Canonical architecture docs remain current-state documents until that cutover and are rewritten in the same final change.
