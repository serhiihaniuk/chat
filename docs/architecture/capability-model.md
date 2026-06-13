# Capability Model

Read this when: you need to know why a declared capability is not automatically
available to a model call.
Source of truth for: current manifest, executable registry, and per-turn policy
separation.
Not source of truth for: future RAG, memory, or guard implementations.

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

## Agent Executor Path

`AgentExecutor` is not a model-callable capability. Core or service code may
select an executor id on `AgentRuntimeRequest`; the runtime resolves that id
against its executor registry before streaming. Missing ids use the default
AI SDK tool-loop executor, and unknown ids fail closed with
`executor_unavailable`.

## Research Agent Path

`ResearchAgentPort` is not a model-callable tool and not an `AgentExecutor`.
Service composition injects a concrete research agent, while the host capability
manifest declares the retrieval sources and workflows that policy may allow.
Core runs research during context preparation only when the per-turn policy
allows source ids and the `research_context` workflow.

Research output is admitted as prepared context candidates and workflow
artifacts. It is preserved in the context manifest and persistence snapshot, but
it is not streamed as `sidechat.v1` protocol data and it does not select the
final runtime executor.

## Runtime Tool Versus Host Command

Use a `RuntimeTool` for backend work the selected agent executor may call during
model execution:

```txt
jira.search_issues
customer.lookup
incident.create
```

Use a host command for browser/host-app UI work:

```txt
host.open_ticket_panel
host.highlight_document_section
host.insert_text_into_editor
```

Host commands are declared on `HostCapabilityManifest.commands` and dispatched
through `packages/host-bridge`. They are not executable runtime tools unless the
service also models a separate backend `RuntimeTool`.

## Approval-Sensitive Capabilities

`ApprovalPolicy` references declared tool or host-command names. Manifest
validation fails closed when an approval policy points at an undeclared
capability.

Mutating tools such as `jira.create_issue` should be declared with an approval
policy before a service adapter executes the mutation. The runtime still
receives only the final per-turn tool allowlist; approval requirements are
product policy data, not AI SDK provider options.

## Mock Tool Placement

`mock_web_search` is a local development and test fixture:

- its manifest declaration is built in service composition only when local
  config enables it;
- its executable `RuntimeTool` is registered with runtime only when local config
  enables it;
- production profiles must not expose it by default.

This fixture proves the manifest -> policy -> runtime registry path. It is not
the default enterprise tool architecture.

## Enterprise Tool Example

`apps/partner-ai-service/src/adapters/tools/examples/jira-search-issues-tool.ts`
shows the intended service-side shape for a concrete app-owned tool:

```txt
RuntimeTool implementation
ToolCapability declaration
small input reader
authorization-aware client call
protocol-safe JSON result
optional source extraction
runtime-safe error mapping
```

Service composition accepts `runtime.runtimeTools` for executable registrations
and `runtime.toolCapabilities` for manifest declarations. Supplying only one
side is allowed, but selected tools without a matching runtime implementation
fail closed with `tool_unavailable`.

Service adapter implementations live under
`apps/partner-ai-service/src/adapters/`. The adapter README there is the local
map for tools, RAG, memory, guards, research agents, host commands, and
observability sinks.

## Where To Open First

- `packages/partner-ai-core/src/domain/harness/capabilities.ts`
- `packages/partner-ai-core/src/domain/harness/validation.ts`
- `packages/partner-ai-core/src/domain/harness/turn-policy-validation.ts`
- `packages/partner-ai-core/src/application/stream-chat/turn/turn-policy-plan.ts`
- `packages/agent-runtime/src/runtime/turn/tool-selection.ts`
- `packages/agent-runtime/src/tools/tool-registry.ts`
- `apps/partner-ai-service/src/composition/service-harness.ts`
- `apps/partner-ai-service/src/composition/service-composition.ts`
- `apps/partner-ai-service/src/adapters/README.md`
- `apps/partner-ai-service/src/adapters/tools/examples/jira-search-issues-tool.ts`
- `packages/host-bridge/src/capability.ts`

## Related Docs

- `docs/domain/vocabulary.md`
- `docs/architecture/foundation-overview.md`
- `docs/architecture/boundaries.md`
- `docs/architecture/stream-chat-flow.md`
