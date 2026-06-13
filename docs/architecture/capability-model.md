# Capability Model

Read this when: you need to know why a declared capability is not automatically
available to a model call.
Source of truth for: current manifest, executable registry, and per-turn policy
separation.
Not source of truth for: future RAG, memory, guard, or agent-executor
implementations.

## Three Separate Objects

Side Chat keeps capability declaration, implementation, and exposure separate.

| Object                   | Owner                                            | Answers                             | Example                                            |
| ------------------------ | ------------------------------------------------ | ----------------------------------- | -------------------------------------------------- |
| Host capability manifest | `partner-ai-core` contract, service adapter data | What can this host app offer?       | `ToolCapability` named `mock_web_search`           |
| Executable registry      | `agent-runtime` and service composition          | Which implementations can run here? | `RuntimeTool` registered with `createAgentRuntime` |
| Turn policy decision     | `partner-ai-core` policy flow                    | What may this user/request use now? | `allowedToolNames` on `TurnPolicyDecision`         |

A capability present in the manifest is registration only. The model sees it
only when the per-turn policy decision allows it and the runtime can resolve a
matching executable implementation.

## Tool Path

```txt
service builds HostCapabilityManifest.tools
-> core validates manifest declarations
-> service/core resolve TurnPolicyDecision.allowedToolNames
-> core sends allowedToolNames to AgentRuntimeRequest
-> agent-runtime selects matching RuntimeTool implementations
-> AI SDK adapter exposes only selected tools to the model
```

If a selected tool is missing from the runtime registry, runtime fails closed
with `tool_unavailable`; it does not silently expose a replacement.

If a tool is registered in runtime but no request/profile allowlist selects it,
the model sees no tool.

## Mock Tool Placement

`mock_web_search` is a local development and test fixture:

- its manifest declaration is built in service composition only when local
  config enables it;
- its executable `RuntimeTool` is registered with runtime only when local config
  enables it;
- production profiles must not expose it by default.

This fixture proves the manifest -> policy -> runtime registry path. It is not
the default enterprise tool architecture.

## Where To Open First

- `packages/partner-ai-core/src/domain/harness/capabilities.ts`
- `packages/partner-ai-core/src/domain/harness/validation.ts`
- `packages/partner-ai-core/src/domain/harness/turn-policy-validation.ts`
- `packages/partner-ai-core/src/application/stream-chat/turn/turn-policy-plan.ts`
- `packages/agent-runtime/src/runtime/turn/tool-selection.ts`
- `packages/agent-runtime/src/tools/tool-registry.ts`
- `apps/partner-ai-service/src/composition/service-harness.ts`
- `apps/partner-ai-service/src/composition/service-composition.ts`

## Related Docs

- `docs/domain/vocabulary.md`
- `docs/architecture/foundation-overview.md`
- `docs/architecture/boundaries.md`
- `docs/architecture/stream-chat-flow.md`
