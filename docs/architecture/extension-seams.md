# Extension Seams

Read this when: an adopting team needs to add a tool, guard, RAG, memory,
research agent, executor, host command, policy rule, or observability sink.
Source of truth for: first files and contracts for extension work.
Not source of truth for: lifecycle order, package ownership, or provider adapter
internals.

## Capability Rule

Declaration, implementation, and exposure are separate:

```txt
host capability manifest
-> turn policy decision
-> executable registry or host bridge
```

A manifest entry is not model access. Runtime exposes only selected backend
RuntimeTools that also have executable registrations. Host commands remain
browser/host-app interactions unless the service separately implements a backend
tool.

## Backend Runtime Tool

- What it is: model-callable backend work such as search, lookup, or mutation.
- Runs: during runtime execution after turn policy selects the tool name.
- Receives/returns: AI/tool input becomes `RuntimeTool.execute` input; output is
  JSON-safe runtime activity data or a runtime tool error.
- Implementation: `apps/partner-ai-service/src/adapters/tools/`.
- Contract: `packages/agent-runtime/src/tools/runtime-tool.ts` and
  `packages/partner-ai-core/src/domain/capabilities/contracts/capabilities.ts`.
- Common mistake: declaring `ToolCapability` without registering a matching
  RuntimeTool and expecting the model to see it.

## Host Command

- What it is: browser/host-app UI work such as opening a panel or inserting
  text.
- Runs: through the widget and host bridge, not as a backend runtime tool.
- Receives/returns: host command payloads and browser-safe command results.
- Implementation: `packages/host-bridge/src/` and service declaration helpers in
  `apps/partner-ai-service/src/adapters/host-commands/`.
- Contract: `packages/host-bridge/src/commands/capability.ts`.
- Common mistake: placing host UI commands under runtime tool adapters.

## Turn Guard

- What it is: prompt/security check selected by the assistant profile.
- Runs: before conversation persistence, private context, RAG, memory, research,
  or runtime tools.
- Receives/returns: minimal turn/profile input and allow, warn, or block.
- Implementation: `apps/partner-ai-service/src/adapters/guards/`.
- Contract: `packages/partner-ai-core/src/ports/guards/turn-guard.ts`.
- Common mistake: registering a guard and assuming it runs without selecting its
  id in profile safety policy.

## RAG Retriever

- What it is: authorized retrieval from host-owned knowledge sources.
- Runs: during context preparation from policy-allowed retrieval source ids.
- Receives/returns: retrieval request plus source ids; returns candidates with
  provenance, trust, redaction class, and token estimate.
- Implementation: `apps/partner-ai-service/src/adapters/rag/`.
- Contract: `packages/partner-ai-core/src/ports/context/rag-retriever.ts`.
- Common mistake: modeling RAG as a model-callable search tool when it should be
  prepared context.

## Memory Port

- What it is: policy-scoped durable memory recall and write candidate recording.
- Runs: recall during context preparation; write candidates after successful
  output under write policy.
- Receives/returns: authorized memory scope; returns recalled memory or records
  memory candidates.
- Implementation: `apps/partner-ai-service/src/adapters/memory/`.
- Contract: `packages/partner-ai-core/src/ports/context/memory-port.ts`.
- Common mistake: persisting raw model claims as memory without memory policy.

## Research Agent

- What it is: pre-answer research that prepares context candidates and research
  artifacts.
- Runs: during context preparation when policy allows source ids and the
  `research_context` research agent id.
- Receives/returns: authorized source/research request; returns candidates and
  artifacts, not protocol events.
- Implementation: `apps/partner-ai-service/src/adapters/agents/`.
- Contract: `packages/partner-ai-core/src/ports/context/research-agent.ts`.
- Common mistake: treating research as the final AgentExecutor.

## Agent Executor

- What it is: runtime execution engine for one prepared assistant turn.
- Runs: after `sidechat.started`, selected by profile/turn policy.
- Receives/returns: `AgentExecutionRequest`; emits RuntimeEvents.
- Implementation: `packages/agent-runtime/src/runtime/executors/`.
- Contract: `packages/agent-runtime/src/runtime/executors/agent-executor.ts`.
- Common mistake: exposing executor ids as browser or manifest capabilities.

## Policy Resolver

- What it is: per-turn selection of profile, model, tools, host commands, RAG,
  memory, research, guards, approvals, executor id, and instructions.
- Runs: before turn guards and before any private context or persistence.
- Receives/returns: authorized input plus manifest/profile data; returns a turn
  policy decision.
- Implementation: `packages/partner-ai-core/src/application/stream-chat/turn/turn-policy-plan.ts`.
- Contract: `packages/partner-ai-core/src/domain/capabilities/turn-policy/`.
- Common mistake: moving policy decisions into runtime or route handlers.

## Observability Adapter

- What it is: sink for redacted lifecycle records.
- Runs: around stream-chat lifecycle stages.
- Receives/returns: already-redacted observability records; should not affect
  product behavior.
- Implementation: `apps/partner-ai-service/src/adapters/observability/`.
- Contract: `packages/partner-ai-core/src/services/observability.ts`.
- Common mistake: logging raw prompts, provider output, or tool payloads before a
  policy authorizes that diagnostic path.

## Service Adapter Index

Start with `apps/partner-ai-service/src/adapters/README.md` for folder placement.
Then open the package contract named by the seam above.
