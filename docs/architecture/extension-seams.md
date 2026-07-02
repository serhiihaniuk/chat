# Extension Seams

Read this when: you adopt Side Chat and need to add a tool, provider/model, guard, executor, host command, observability sink, or persistence adapter.
Source of truth for: the adoption seams, where each seam's contract type lives, and where you bind it in service composition.
Not source of truth for: package import rules (see [package-boundaries.md](package-boundaries.md)), the turn lifecycle (see [assistant-turn.md](assistant-turn.md)), or runtime/protocol events (see [runtime-and-protocol-events.md](runtime-and-protocol-events.md)).

## How extension works

Side Chat keeps each extension point as a typed contract in a `packages/*` package, then lets the deployable service bind a concrete implementation at startup. You write the implementation against the contract; you register it in `apps/partner-ai-service`. The split keeps core and runtime provider-neutral and lets one host app swap tools, models, or storage without forking them.

Two binding shapes exist:

- **Bundled (tools, providers):** one registration carries both the declaration (manifest/identity) and the executable. The registry asserts the names match, so the manifest and the runtime cannot drift.
- **Injected ports (guards, executors, observability, persistence, policy):** core and runtime expose a port type; the service passes a concrete adapter into `composePartnerAiService` ([service-composition.ts:105](../../apps/partner-ai-service/src/composition/service-composition.ts)).

The composition root assembles every port into one `StreamChatPorts` object at [create-stream-chat-ports.ts:47](../../apps/partner-ai-service/src/composition/ports/create-stream-chat-ports.ts). Routes receive that object; they never build adapters.

## Seam map

Contract types live in `packages/*`; binding happens in `apps/partner-ai-service`. Paths use `file:line` for the contract and the wiring point.

| Seam                      | Contract type (location)                                                                                                                                                                                                                                      | Bind / register at                                                                                                                                                                                                                                                                           | Shape                                                                                               |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Add a tool                | `RuntimeTool` ([runtime-tool.ts:49](../../packages/agent-runtime/src/tools/runtime-tool.ts)) + manifest `ToolCapability` ([capabilities.ts:158](../../packages/partner-ai-core/src/domain/capabilities/contracts/capabilities.ts))                            | `createServiceToolRegistration` then the registry list ([service-tool-registry.ts:59](../../apps/partner-ai-service/src/composition/tools/service-tool-registry.ts))                                                                                                                         | Bundled: one `ServiceToolRegistration` = capability + executable                                    |
| Add a provider/model      | `ServiceProviderRegistration` ([service-provider-registry.ts:66](../../apps/partner-ai-service/src/composition/providers/service-provider-registry.ts))                                                                                                       | `createServiceProviderRegistry` builds the concrete `ModelProvider`; first registration is the default                                                                                                                                                                                       | Bundled: declaration + transport/secret + runtime build                                             |
| Add a guard/policy        | `TurnGuard` / `TurnGuardRegistryPort` ([turn-guard.ts:36](../../packages/partner-ai-core/src/ports/guards/turn-guard.ts))                                                                                                                                     | `options.turnGuards` ([service-composition.ts:106](../../apps/partner-ai-service/src/composition/service-composition.ts)); turn-policy resolver via [create-service-capability-bundle.ts:58](../../apps/partner-ai-service/src/composition/capabilities/create-service-capability-bundle.ts) | Injected port; decision is `allow` / `allow_with_warning` / `block`                                 |
| Add an executor           | `AgentExecutor` ([agent-executor.ts:38](../../packages/agent-runtime/src/runtime/executors/agent-executor.ts))                                                                                                                                                | `AgentRuntimeOptions.executors`, passed by the runtime bundle                                                                                                                                                                                                                                | Injected port; default id `ai_sdk.tool_loop`                                                        |
| Wire a host command       | `HostCommandCapability` (core manifest shape, [capabilities.ts](../../packages/partner-ai-core/src/domain/capabilities/contracts/capabilities.ts)) + the host-bridge dispatch shapes ([capability.ts](../../packages/host-bridge/src/commands/capability.ts)) | Declare in `sidechat.config.ts`; the runtime exposes it to the model as a callable tool; handle it in the host app via `packages/host-bridge`                                                                                                                                                | Declared in config; model-callable; performed in the browser ([host-commands.md](host-commands.md)) |
| Add an observability sink | `ObservabilitySinkPort` ([observability.ts:54](../../packages/partner-ai-core/src/services/observability.ts))                                                                                                                                                 | `options.observability` ([service-composition.ts:137](../../apps/partner-ai-service/src/composition/service-composition.ts)); default `NOOP_OBSERVABILITY_SINK`                                                                                                                              | Injected port; receives redacted records only                                                       |
| Add a persistence adapter | `SidechatRepositories` + `RepositoryAdapterKind` (`@side-chat/db`)                                                                                                                                                                                            | `options.repositories` / `options.persistence`, resolved by `createServicePersistenceBundle`                                                                                                                                                                                                 | Injected port; repos must declare `adapterKind` or fail closed                                      |

The capability rule keeps three stages separate: a manifest `ToolCapability` is a declaration, not model access; the per-turn policy decides which names are allowed; runtime executes only registered `RuntimeTool`s named in that allowlist. Declaring a tool capability without an executable is impossible because one registration supplies both.

## How to add one

Each seam follows the same loop: write against the contract, then register or inject in composition. Steps below start with the verb you run.

### Add a tool

1. Implement a `RuntimeTool` under `apps/partner-ai-service/src/adapters/tools/`. Copy the worked example [jira-search-issues-tool.ts:76](../../apps/partner-ai-service/src/adapters/tools/examples/jira-search-issues-tool.ts).
2. Wrap it with `createServiceToolRegistration({ capability, runtimeTool })` so one factory returns both.
3. Add the registration to the service's registry list. `createServiceToolRegistry` rejects any registration whose capability and tool names disagree.

Known gap (fix tracked in `plan/21`): the `sidechat.config.ts` `tools` block currently accepts only `mock_web_search` — the config adapter maps every configured name to the mock registration ([options-adapter.ts](../../apps/partner-ai-service/src/config/sidechat-config/options/options-adapter.ts)). Until the registration map lands, a custom tool must be wired programmatically through `PartnerAiServiceOptions.runtime.tools`, not through the config file.

### Add a provider/model

1. Add a `ServiceProviderRegistration` (kind `fake` / `openai` / `azure`, plus ids, secret, and transport fields) to provider config.
2. Declare reasoning intent there via `ServiceReasoningPolicy`; secrets stay in the registration and never reach the manifest or browser.
3. Let `createServiceProviderRegistry` validate and build the concrete `ModelProvider`. The first registration becomes the default.

### Add a guard/policy

1. Implement your guards and a `TurnGuardRegistryPort` under `apps/partner-ai-service/src/adapters/guards/`.
2. Pass the registry as `options.turnGuards`.
3. Select each `guardId` in the profile's safety policy. Registering a guard alone does not run it ([service-composition.ts:112](../../apps/partner-ai-service/src/composition/service-composition.ts)).

For per-turn policy decisions (profile, model, tools, guards, executor), provide a turn-policy resolver through the capability bundle. Keep policy in core, not in routes or runtime.

### Add an executor

1. Implement an `AgentExecutor` that produces `RuntimeEvent`s only. The runtime has already chosen the model, messages, and tools.
2. Add it to the runtime config `executors` list, injected via the runtime bundle.
3. Do not expose executor ids as browser or manifest capabilities; they are runtime-internal.

Need more than a custom loop — a different engine entirely, possibly remote or in another language? That is the next level up: implement `AiRuntimePort` itself. See [runtime-port.md](runtime-port.md) for the three integration levels and the remote-agent adapter pattern.

### Wire a host command

Full walkthrough with a runnable example: [host-commands.md](host-commands.md). In short:

1. Declare a `HostCommandCapability` in `hostCommands.availableCommands` ([sidechat.config.ts](../../apps/partner-ai-service/sidechat.config.ts)). The worked example is `open_resource` ([host-commands.ts](../../apps/partner-ai-service/src/config/catalog/capabilities/host-commands.ts)). The runtime exposes declared commands to the model as callable tools.
2. Handle the command in the host app through the bridge in `packages/host-bridge/src/`, and advertise it in the bridge's `getCapabilities` — the action itself runs in the browser.
3. Ship a separate `RuntimeTool` only if the backend must also perform the action.

### Add an observability sink

1. Implement an `ObservabilitySinkPort` and pass it as `options.observability`.
2. Treat every record as already redacted; never log raw prompts, provider output, or tool payloads.
3. The service `observability/` folder exists but ships no sink yet. The contract and `NOOP_OBSERVABILITY_SINK` default both live in [observability.ts](../../packages/partner-ai-core/src/services/observability.ts); core redacts records before your sink receives them.

### Add a persistence adapter

1. Provide `SidechatRepositories` tagged with a valid `adapterKind` (`memory`, `postgres-drizzle`, or `custom`) via `options.repositories`, or set `persistence` config to select a built-in.
2. `createServicePersistenceBundle` picks memory or postgres by `PersistenceConfig.kind`; a custom kind needs explicit persistence metadata or composition fails closed.
3. Keep `pg` and `drizzle-orm` inside `@side-chat/db`; the boundary lints forbid them elsewhere.

## Where adapters live

For folder placement inside the service, see [adapters/README.md](../../apps/partner-ai-service/src/adapters/README.md). Folders that ship implementations today: `auth/`, `guards/`, `host-commands/` (the connection-bound result resolver), `persistence/` (including the in-memory turn-event registry), `policy/`, and `tools/`. The rest (`agents/`, `memory/`, `observability/`, `rag/`, `title/`) are reserved and empty.

Two seams adopters ask for are not injectable yet, both tracked in `plan/`: bring-your-own auth (the `ServiceAuthVerifier` interface exists, but options accept only static-token configs — `plan/20`), and config-driven custom tools (`plan/21`, note above).
