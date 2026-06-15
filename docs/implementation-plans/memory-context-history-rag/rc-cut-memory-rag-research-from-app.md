# RC Cut: Memory, RAG, and Research App Surface

Read this when: preparing RC by removing unimplemented memory, RAG, and
research behavior from the current app.
Source of truth for: the removal plan that makes these capabilities
planning-only.
Not source of truth for: future memory, RAG, or research implementation design.

## Target State

For RC, memory, RAG, and research must not exist in the running app surface.
They remain only as deferred planning docs:

```txt
07-real-memory.md
08-real-rag.md
09-research-agent.md
10-final-definition-of-done.md
```

This is stronger than "disabled but visible".

Allowed to remain:

```txt
docs/implementation-plans/memory-context-history-rag/07-real-memory.md
docs/implementation-plans/memory-context-history-rag/08-real-rag.md
docs/implementation-plans/memory-context-history-rag/09-research-agent.md
docs/implementation-plans/memory-context-history-rag/10-final-definition-of-done.md
in-memory persistence repositories and tests, named clearly as in-memory persistence
```

Not allowed to remain in the current app:

```txt
SIDECHAT_MEMORY_*
SIDECHAT_RAG_*
SIDECHAT_RESEARCH_*
SIDECHAT_CONTEXT_MAX_MEMORY_TOKENS
SIDECHAT_CONTEXT_MAX_RAG_TOKENS
SIDECHAT_CONTEXT_MAX_RESEARCH_TOKENS
MemoryPort
RagRetrieverPort
ResearchAgentPort
memory/RAG/research health rows
memory/RAG/research no-op adapters
memory/RAG/research app-path tests
memory/RAG/research runtime context-board sections
post-success memory write candidate recording
ordinary docs that present memory/RAG/research as current app capabilities
```

## Current Surfaces To Remove

| Surface                            | Current files                                                                                                                                                                                                                            |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Service env/config                 | `apps/partner-ai-service/src/config/service-capability-config.ts`, `apps/partner-ai-service/src/config/service-config.ts`                                                                                                                |
| Service capability modes/status    | `apps/partner-ai-service/src/composition/capabilities/*`                                                                                                                                                                                 |
| Service composition/options/routes | `apps/partner-ai-service/src/composition/service-composition.ts`, `service-composition-types.ts`, `ports/service-ports.ts`, `src/inbound/http/app.ts`, `src/inbound/http/routes/types.ts`, `src/inbound/http/routes/chat/chat-stream.ts` |
| No-op adapters                     | `apps/partner-ai-service/src/adapters/memory/**`, `apps/partner-ai-service/src/adapters/rag/**`, `apps/partner-ai-service/src/adapters/agents/noop-research-agent.ts`                                                                    |
| Core contracts                     | `packages/partner-ai-core/src/domain/capabilities/contracts/*`, `packages/partner-ai-core/src/ports/context/*`, `packages/partner-ai-core/src/services/effect-runtime.ts`                                                                |
| Core lifecycle                     | `packages/partner-ai-core/src/application/stream-chat/memory/**`, `rag/**`, `research/**`, `protocol/protocol-terminal-lifecycle.ts`, `turn/prepare-stream-chat-turn.ts`                                                                 |
| Service context manager            | `apps/partner-ai-service/src/composition/context-manager/**`, `apps/partner-ai-service/src/composition/context-candidates/service-*-context.ts`, `apps/partner-ai-service/src/adapters/persistence/service-persistence-recorders.ts`     |
| Tests                              | configured capability, memory policy/helper, RAG retriever, research agent, capability diagnostics, and context manager tests                                                                                                            |
| Ordinary docs                      | architecture, vocabulary, service README, adapter README, requirements, verification docs                                                                                                                                                |

## Implementation Plan

1. Lock removal behavior with tests.

   Add or rewrite tests before deleting implementation:

   ```txt
   service config rejects removed capability env keys
   health/readiness output has no memory/rag/research properties
   service composition no longer accepts memory/rag/research app options
   context manager tests assert only current message, host context, tools, and history
   ```

2. Remove app configuration and diagnostics.

   Delete memory/RAG/research mode constants, config parsing, manifest
   declaration builders, status builders, no-op states, and per-source context
   budgets. The app capability status should cover only RC-supported app
   features, especially history, context admission, and persistence.

3. Remove app composition wiring.

   Delete memory/RAG/research ports from `PartnerAiServiceOptions`, composition
   outputs, route dependencies, and service ports. Delete no-op adapter files.
   Keep in-memory persistence repositories, but call them "in-memory
   persistence" in comments and docs.

4. Remove core contracts and lifecycle stages.

   Remove memory/RAG/research fields from current `HostCapabilityManifest`,
   `AssistantProfile`, and `TurnPolicyDecision`. Delete the current
   memory/RAG/research context ports and stream-chat helper folders. Remove
   post-success memory write candidate recording.

5. Simplify context preparation.

   `gatherAllowedTurnContext` should gather current RC sources only:

   ```txt
   same-conversation history when configured
   host context
   tool capability context
   current user message
   ```

   Context candidates, admission budgets, manifest entries, persistence
   snapshots, and context-board rendering should not contain memory,
   retrieval-result, research-result, or research-artifact source types.

6. Delete future/fake app-path tests.

   Delete tests that only prove fake configured memory/RAG/research wiring. For
   broader tests, rewrite fixtures around current-message, host-context, tools,
   history, context admission, persistence, and protocol boundaries.

7. Clean ordinary docs while preserving planning docs.

   Remove current-app references from:

   ```txt
   docs/README.md
   docs/domain/vocabulary.md
   docs/architecture/system-map.md
   docs/architecture/package-boundaries.md
   docs/architecture/assistant-turn.md
   docs/architecture/extension-seams.md
   docs/architecture/runtime-and-protocol-events.md
   docs/product/requirements.md
   apps/partner-ai-service/README.md
   apps/partner-ai-service/src/adapters/README.md
   ```

   Add a short note to this folder's README that phases 7-9 are deferred after
   RC and are planning docs only.

8. Sweep for forbidden surfaces.

   Run this after edits and manually review remaining hits:

   ```sh
   rg -n "SIDECHAT_(MEMORY|RAG|RESEARCH)|MemoryPort|RagRetrieverPort|ResearchAgentPort|memoryPolicy|memoryPolicies|retrievalSources|researchAgents|memoryScope|researchPolicy|retrievalSourceIds|Retrieved context|Research|RAG" apps packages docs -g '!docs/implementation-plans/memory-context-history-rag/07-real-memory.md' -g '!docs/implementation-plans/memory-context-history-rag/08-real-rag.md' -g '!docs/implementation-plans/memory-context-history-rag/09-research-agent.md' -g '!docs/implementation-plans/memory-context-history-rag/10-final-definition-of-done.md' -g '!docs/implementation-plans/memory-context-history-rag/rc-cut-memory-rag-research-from-app.md'
   ```

   Review `memory` matches separately because in-memory persistence remains
   valid.

## Acceptance Criteria

```txt
[ ] Removed env keys are rejected or absent from service config.
[ ] Health/readiness has no memory/rag/research capability rows.
[ ] App composition and route dependencies expose no memory/RAG/research ports.
[ ] Current core manifest/profile/turn-policy contracts expose no memory/RAG/research fields.
[ ] Context preparation cannot call memory/RAG/research ports.
[ ] Context boards and persisted context snapshots cannot render those sections.
[ ] Post-success finalization has no memory-write side effect.
[ ] Fake configured memory/RAG/research app-path tests are gone.
[ ] Ordinary docs describe the RC app without those capabilities.
[ ] The only remaining memory/RAG/research feature docs are the deferred planning docs in this folder.
```

## Verification

Run narrow tests first:

```sh
npm test -- --run apps/partner-ai-service/src/config/service-config.test.ts
npm test -- --run apps/partner-ai-service/src/inbound/http/routes/health/health-capability-status.test.ts
npm test -- --run apps/partner-ai-service/src/composition/service-composition.test.ts
npm test -- --run apps/partner-ai-service/src/composition/context-manager
npm test -- --run packages/partner-ai-core/src/domain/capabilities
npm test -- --run packages/partner-ai-core/src/application/stream-chat
```

Then run:

```sh
npm run lint:oxlint
npm run typecheck
npm test
npm run lint:custom
npm run verify
```

Use the pinned runtime from `docs/operations/verification.md` when needed:

```sh
npx -p node@24.16.0 -p npm@11.15.0 npm run verify
```

## Risks

- This is a broad type-contract removal. Remove fields from core contracts first
  and let TypeScript identify every consumer.
- `memory` also names in-memory persistence. Preserve that code, but make docs
  and comments use "in-memory persistence" where the distinction matters.
- Architecture docs can easily imply future features are current seams. Keep
  future memory/RAG/research detail only in the planning docs.
- Context admission currently budgets removed source types. Simplify the budget
  shape to current sources and update admission tests around host/tool/history
  pressure.
