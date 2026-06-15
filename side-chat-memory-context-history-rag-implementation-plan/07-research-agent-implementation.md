# 07 — Research Agent Implementation

## Goal

Implement research only when the product needs pre-answer synthesis beyond basic RAG.

The audit says the core has a `ResearchAgentPort`, but the default running service falls back to `noop-research-agent`, returning an empty summary and no sources.

Research is lower priority than history, durable persistence, memory, RAG, and context admission. It should not block those fundamentals unless a current use case needs it now.

## Decide whether research is needed now

Before implementation, answer:

```txt
What does research do that RAG does not?
Does it produce a summary for the main assistant?
Does it follow multiple sources/steps?
Does it call an external LangGraph agent?
Does it need durable artifacts?
Does it stream user-visible progress, or is it private pre-context work?
```

If the answer is unclear, do not implement research yet. Keep it disabled and documented honestly.

## Research modes

```txt
disabled
  No research runs.

external/langgraph
  Calls an external research agent/workflow and receives a summary + sources.

internal
  Uses local model/tool/RAG workflow to synthesize research context.
```

Do not make research a generic plugin. Keep a clear `ResearchAgentPort` or `AgentExecutor` boundary depending on behavior.

## Recommended shape

Research as pre-answer context producer:

```ts
export type ResearchAgentInput = {
  readonly requestId: string;
  readonly authContext: AuthContext;
  readonly workspace: WorkspaceRef;
  readonly userMessage: string;
  readonly allowedSourceIds: readonly string[];
  readonly maxResearchSteps: number;
  readonly abortSignal?: AbortSignal;
};

export type ResearchAgentOutput = {
  readonly artifactId?: string;
  readonly summary: string;
  readonly sources: readonly RagContextCandidate[];
  readonly estimatedTokens: number;
  readonly provenance: JsonObject;
};
```

Research output becomes context candidates. It should not become browser protocol DTOs directly.

## Implementation tasks

Target files:

```txt
apps/partner-ai-service/src/config/service-config.ts
apps/partner-ai-service/src/adapters/agents/**
apps/partner-ai-service/src/composition/service-composition.ts
apps/partner-ai-service/src/composition/context-manager/sources/context-source-gathering.ts
apps/partner-ai-service/src/composition/context-manager/candidates/context-candidate-creation.ts
apps/partner-ai-service/src/composition/manifest/service-capability-manifest.ts
```

Tasks if research is implemented now:

```txt
[ ] Add research mode config.
[ ] Add research capability registration.
[ ] Add profile/policy switch for research_context.
[ ] Implement concrete ResearchAgentPort adapter.
[ ] Pass auth/workspace/request/allowed source scope into research.
[ ] Convert research output into context candidates.
[ ] Decide whether research artifacts are persisted or explicitly ephemeral.
[ ] Add failure policy: degrade or fail_turn.
[ ] Add tests for enabled, disabled, empty, failure, and source provenance.
```

Tasks if research is not implemented now:

```txt
[ ] Keep ResearchAgentPort seam.
[ ] Keep config mode disabled/noop explicit.
[ ] Diagnostics report research disabled/noop.
[ ] Docs state research is an extension seam, not implemented default behavior.
[ ] Tests assert production-like config cannot enable research without a concrete adapter.
```

## When research should be an AgentExecutor instead

If the external agent produces the final answer stream, do not model it as research context. Model it as an `AgentExecutor` selected by profile/policy.

```txt
ResearchAgentPort
  produces context for the main assistant.

AgentExecutor
  produces the final RuntimeEvent stream for the turn.
```

This distinction matters for readability and boundary safety.

## Acceptance criteria

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
