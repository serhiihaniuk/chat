# Adoption Extension Map

Read this when: an adopting team needs to know where to add or change an
assistant capability.
Source of truth for: first files or folders to open for each extension seam.
Not source of truth for: lifecycle order, domain term definitions, or provider
adapter internals.

## First Open

| Need                           | Open first                                                                                                  | Then check                                                                                                                                                   |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Add a backend runtime tool     | `apps/partner-ai-service/src/adapters/README.md` and `apps/partner-ai-service/src/adapters/tools/examples/` | `apps/partner-ai-service/src/composition/service-composition.ts` for `runtimeTools` and declarations.                                                        |
| Add a host UI command          | `apps/partner-ai-service/src/adapters/README.md` and `packages/host-bridge/src/`                            | `docs/adr/0001-host-command-result-durability.md` before adding backend durability.                                                                          |
| Add RAG                        | `apps/partner-ai-service/src/adapters/README.md`                                                            | `packages/partner-ai-core/src/application/stream-chat/rag/retrieve-allowed-rag-candidates.ts`.                                                               |
| Add memory                     | `apps/partner-ai-service/src/adapters/README.md`                                                            | `packages/partner-ai-core/src/application/stream-chat/memory/`.                                                                                              |
| Add a prompt/security guard    | `apps/partner-ai-service/src/adapters/README.md`                                                            | Select the guard id through service composition `turnGuardIds`, then check `packages/partner-ai-core/src/application/stream-chat/guards/run-turn-guards.ts`. |
| Add a pre-answer research step | `apps/partner-ai-service/src/adapters/README.md`                                                            | `packages/partner-ai-core/src/application/stream-chat/research/run-allowed-research-agent.ts`.                                                               |
| Add a final agent executor     | `packages/agent-runtime/src/runtime/executors/`                                                             | `apps/partner-ai-service/src/composition/service-composition.ts` for `runtime.executors`.                                                                    |
| Change per-turn policy         | `packages/partner-ai-core/src/application/stream-chat/turn/turn-policy-plan.ts`                             | `packages/partner-ai-core/src/domain/capabilities/turn-policy/turn-policy-validation.ts`.                                                                    |
| Change core turn behavior      | `packages/partner-ai-core/src/application/stream-chat/README.md`                                            | `docs/architecture/assistant-turn-lifecycle.md` and `docs/architecture/stream-chat-flow.md`.                                                                 |
| Add approval policy            | `docs/architecture/capability-model.md`                                                                     | `packages/partner-ai-core/src/domain/capabilities/validation/validation.ts`.                                                                                 |

## Boundary Guardrails

| Detail                                 | Must stay in                                                                       | Crosses boundary as                                                  |
| -------------------------------------- | ---------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| Provider or AI SDK stream parts        | `packages/agent-runtime/src/runtime/ai-sdk/`                                       | Provider-neutral `RuntimeEvent`.                                     |
| Future LangGraph-native executor data  | Its `AgentExecutor` adapter under `packages/agent-runtime/src/runtime/executors/`. | Provider-neutral `RuntimeEvent`.                                     |
| Runtime activity and terminal events   | `packages/agent-runtime/src/runtime/contract/` until core protocol mapping.        | Browser-safe `SidechatStreamEvent`.                                  |
| Hono requests and SSE response details | `apps/partner-ai-service/src/inbound/http/`.                                       | `StreamChatInput` into core and SSE bytes out of protocol data.      |
| Drizzle/Postgres records               | `packages/db/` and service persistence adapters.                                   | Repository port records or normalized context/turn snapshots.        |
| Widget rendering state                 | `packages/side-chat-widget/src/entities` and `features`.                           | Protocol events and host-bridge messages, not runtime/provider data. |

## Stop Before Editing

If the change needs more than the first two locations in the table, update the
owning package README or this map in the same patch. A new adopting team should
not need to search the whole repo to find the seam.

## Related Docs

- `docs/domain/vocabulary.md`
- `docs/architecture/capability-model.md`
- `docs/architecture/boundaries.md`
- `docs/architecture/assistant-turn-lifecycle.md`
- `apps/partner-ai-service/src/adapters/README.md`
- `apps/partner-ai-service/src/composition/manifest/service-capability-manifest.ts`
