# Real Research Agent Implementation Plan

## 1. Goal

Add a concrete `ResearchAgentPort` only if the product needs pre-answer
research beyond ordinary RAG. The research agent prepares context candidates and
artifacts before the main assistant answer; it is not the final runtime
executor.

This plan covers audit gap `4.3`.

## 2. Current gap

The default service composition falls back to:

```txt
apps/partner-ai-service/src/adapters/agents/noop-research-agent.ts
```

That adapter returns an empty summary and no sources. Existing seam tests prove
the contract can carry research output, but the app does not perform real
research or persist research artifacts.

## 3. Product decision gate

Do not implement research just because the seam exists. First answer:

```txt
[ ] What user problem requires research instead of RAG?
[ ] Which sources may the research agent inspect?
[ ] Does research call a model, a search service, tools, or a workflow engine?
[ ] Are artifacts durable, ephemeral, or profile-dependent?
[ ] How is cost/latency bounded before sidechat.started?
```

If those answers are not current product needs, keep the concrete implementation
deferred and make the no-op/disabled status explicit.

## 4. Ownership

| Concern                                   | Owner                                                          |
| ----------------------------------------- | -------------------------------------------------------------- |
| Research permission and selected agent id | `packages/partner-ai-core` turn policy                         |
| Research input/output contract            | `packages/partner-ai-core/src/ports/context/research-agent.ts` |
| Research adapter                          | `apps/partner-ai-service/src/adapters/agents/**`               |
| Research artifact persistence             | service adapter plus repository/external store                 |
| Main answer execution                     | `packages/agent-runtime` selected `AgentExecutor`              |

Research output becomes prepared context and artifacts. It does not emit
`SidechatStreamEvent` directly.

## 5. Implementation sequence

1. Define the first research capability.

   Use a narrow id such as:

   ```txt
   research_context.project_sources
   ```

   Avoid generic workflow names unless a real workflow engine is being exposed.

2. Add capability/profile configuration.

   The profile must explicitly allow the research agent id and source ids.
   Disabled research must not call the adapter.

3. Implement the adapter.

   Place concrete code under:

   ```txt
   apps/partner-ai-service/src/adapters/agents/
   ```

   Keep provider SDKs, external search clients, and workflow clients inside the
   adapter or its local dependencies.

4. Normalize output.

   Research output should become:

   ```txt
   context candidates
   source/provenance entries
   optional research artifacts
   diagnostic status
   ```

5. Decide artifact persistence.

   If artifacts are durable, define repository/external store writes and
   cleanup behavior. If they are ephemeral, state that in docs and manifests.

6. Define failure behavior.

   Research runs before `sidechat.started`. Failure should either fail setup or
   degrade according to policy. Do not half-open the stream.

## 6. Tests

Required scenarios:

```txt
[ ] disabled research policy does not call ResearchAgentPort
[ ] allowed research receives request/auth/workspace/source scope
[ ] disallowed source ids are not passed to research
[ ] research output becomes context candidates
[ ] research artifacts are persisted or explicitly marked ephemeral
[ ] research sources appear in the context manifest
[ ] research failure follows the chosen pre-start policy
[ ] runtime receives prepared research context, not browser protocol DTOs
```

Likely test files:

```txt
packages/partner-ai-core/src/application/stream-chat/research/run-allowed-research-agent.test.ts
apps/partner-ai-service/src/composition/context-manager/service-context-manager.test.ts
apps/partner-ai-service/src/composition/service-composition.test.ts
```

## 7. Documentation updates

Update:

```txt
docs/architecture/extension-seams.md
docs/architecture/assistant-turn.md
apps/partner-ai-service/README.md
apps/partner-ai-service/src/adapters/README.md
side-chat-current-iteration-docs-and-architecture-fix-plan/07-acceptance-criteria.md
```

Docs must keep this distinction:

```txt
ResearchAgent prepares context before the answer.
AgentExecutor streams the final assistant answer.
RuntimeTool is model-callable during execution.
RAG retrieves authorized source candidates before execution.
```

## 8. Acceptance criteria

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
