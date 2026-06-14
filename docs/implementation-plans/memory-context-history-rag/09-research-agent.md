# 9. Research Agent

## Goal

Add a concrete `ResearchAgentPort` only if product needs pre-answer synthesis
beyond ordinary RAG. Research prepares context candidates and artifacts before
the main answer; it is not the final runtime executor.

## Why Last

Research is workflow-like, potentially slower, and more expensive than history,
memory, and RAG. It should not block those fundamentals unless it is an explicit
product requirement.

## Product Decision Gate

Before implementing, answer:

```txt
[ ] What user problem requires research instead of RAG?
[ ] Which sources may research inspect?
[ ] Does research call a model, search service, tools, or workflow engine?
[ ] Are artifacts durable, ephemeral, or profile-dependent?
[ ] How are cost and latency bounded before sidechat.started?
```

If these are not current product needs, keep research disabled/no-op and make
that status explicit through phase 1 diagnostics.

## Research Modes

```txt
disabled: no research runs
noop: manifest declaration with no concrete research adapter, local/test only
external: external agent returns summary, sources, and optional artifacts
langgraph: LangGraph-backed external workflow adapter
```

These are the modes currently parsed by service config. If an `internal` mode is
needed later, add it deliberately to service config, diagnostics, tests, and
adapter selection before using it in a plan.

Do not make research a generic plugin. Keep the boundary as either
`ResearchAgentPort` or `AgentExecutor`, depending on behavior.

## Ownership

| Concern                                   | Owner                                                          |
| ----------------------------------------- | -------------------------------------------------------------- |
| Research permission and selected agent id | `packages/partner-ai-core` turn policy                         |
| Research port contract                    | `packages/partner-ai-core/src/ports/context/research-agent.ts` |
| Research adapter                          | `apps/partner-ai-service/src/adapters/agents/**`               |
| Research artifacts                        | service adapter plus repository or external store              |
| Final answer execution                    | `packages/agent-runtime` selected `AgentExecutor`              |

Research output becomes prepared context and artifacts. It does not emit browser
protocol events directly.

## Implementation Steps

If research is implemented now:

1. Define the first narrow research capability id.
2. Add profile/config selection for the research agent and allowed source ids.
3. Implement the adapter under `apps/partner-ai-service/src/adapters/agents/`.
4. Pass auth, workspace, request, and allowed source scope into research.
5. Normalize output into context candidates, provenance, artifacts, and status.
6. Decide whether artifacts are persisted or explicitly ephemeral.
7. Implement failure behavior: fail or degrade before `sidechat.started`.

If research is not implemented now:

1. Keep `ResearchAgentPort` as an explicit seam.
2. Keep config mode disabled/no-op explicit.
3. Report research disabled/no-op through diagnostics.
4. Add tests that production-like config cannot enable research without a
   concrete adapter.
5. Update docs to state research is seam-only for the default app.

## Boundary Check

```txt
ResearchAgentPort: produces context for the main assistant.
AgentExecutor: produces the final RuntimeEvent stream for the turn.
RuntimeTool: model-callable backend capability during execution.
```

If an external agent produces the final answer stream, model it as an
`AgentExecutor`, not as research context.

## Tests

```txt
[ ] disabled research policy does not call ResearchAgentPort
[ ] allowed research receives request, auth, workspace, and source scope
[ ] disallowed source ids are not passed to research
[ ] research output becomes context candidates
[ ] artifacts are persisted or explicitly marked ephemeral
[ ] research sources appear in the context manifest
[ ] research failure follows configured pre-start policy
[ ] runtime receives prepared research context, not protocol DTOs
```

## Exit Criteria

```txt
[ ] Research runs only when profile/config/policy allow it.
[ ] Research output becomes prepared context and artifacts.
[ ] Research artifacts have an explicit persistence decision.
[ ] Disabled research does not call the research agent.
[ ] Research remains separate from RAG, RuntimeTool, and AgentExecutor.
```
