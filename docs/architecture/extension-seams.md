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

| Seam                      | Contract type (location)                                                                                                                                                                                                                                                           | Bind / register at                                                                                                                                                                                                                                                                           | Shape                                                                                               |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Add a tool                | `RuntimeTool` / `createRuntimeToolFromPromise` ([runtime-tool.ts:49](../../packages/agent-runtime/src/tools/runtime-tool.ts)) + manifest `ToolCapability` ([capabilities.ts:158](../../packages/partner-ai-core/src/domain/capabilities/contracts/capabilities.ts))                | `createServiceToolRegistration`, then a map entry in [tool-registrations.ts](../../apps/partner-ai-service/src/adapters/tools/tool-registrations.ts) (config-driven) or `options.runtime.tools` (programmatic)                                                                               | Bundled: one `ServiceToolRegistration` = capability + executable                                    |
| Add a provider/model      | `ServiceProviderRegistration` ([service-provider-registry.ts:66](../../apps/partner-ai-service/src/composition/providers/service-provider-registry.ts))                                                                                                                            | `createServiceProviderRegistry` builds the concrete `ModelProvider`; first registration is the default                                                                                                                                                                                       | Bundled: declaration + transport/secret + runtime build                                             |
| Add a guard/policy        | `TurnGuard` / `TurnGuardRegistryPort` ([turn-guard.ts:36](../../packages/partner-ai-core/src/ports/turn-guard.ts))                                                                                                                                                                 | `options.turnGuards` ([service-composition.ts:106](../../apps/partner-ai-service/src/composition/service-composition.ts)); turn-policy resolver via [create-service-capability-bundle.ts:58](../../apps/partner-ai-service/src/composition/capabilities/create-service-capability-bundle.ts) | Injected port; decision is `allow` / `allow_with_warning` / `block`                                 |
| Add an executor           | `AgentExecutor` ([agent-executor.ts:38](../../packages/agent-runtime/src/runtime/executors/agent-executor.ts))                                                                                                                                                                     | `AgentRuntimeOptions.executors`, passed by the runtime bundle                                                                                                                                                                                                                                | Injected port; default id `ai_sdk.tool_loop`                                                        |
| Wire a host command       | `HostCommandCapability` (core manifest shape, [capabilities.ts](../../packages/partner-ai-core/src/domain/capabilities/contracts/capabilities.ts)) + the host-bridge dispatch shapes ([capability.ts](../../packages/host-bridge/src/commands/capability.ts))                      | Declare in `sidechat.config.ts`; the runtime exposes it to the model as a callable tool; handle it in the host app via `packages/host-bridge`                                                                                                                                                | Declared in config; model-callable; performed in the browser ([host-commands.md](host-commands.md)) |
| Add an observability sink | `ObservabilitySinkPort` ([observability.ts:54](../../packages/partner-ai-core/src/services/observability.ts))                                                                                                                                                                      | `options.observability` ([service-composition.ts:137](../../apps/partner-ai-service/src/composition/service-composition.ts)); default `NOOP_OBSERVABILITY_SINK`                                                                                                                              | Injected port; receives redacted records only                                                       |
| Add a persistence adapter | `SidechatRepositories` + `RepositoryAdapterKind` (`@side-chat/db`)                                                                                                                                                                                                                 | `options.repositories` / `options.persistence`, resolved by `createServicePersistenceBundle`                                                                                                                                                                                                 | Injected port; repos must declare `adapterKind` or fail closed                                      |
| Change model parameters   | `RuntimeCallSettings` ([ai-runtime-contract](../../packages/ai-runtime-contract/src/index.ts)) / `SideChatCallSettings` ([types.ts](../../apps/partner-ai-service/src/config/sidechat-config/types.ts))                                                                            | `chat.turnProfile.callSettings` in `sidechat.config.ts`; threads profile → `TurnPolicyDecision` → `buildModelTurnRequest` → the runtime call                                                                                                                                                 | Config bag: `temperature`, `maxOutputTokens`, `topP`, `stopSequences`, `maxToolSteps`               |
| Plug in auth              | `ServiceAuthVerifier` ([service-auth.ts:37](../../apps/partner-ai-service/src/adapters/auth/service-auth.ts)); returns an `AuthContext` (`@side-chat/partner-ai-core`)                                                                                                             | `options.authVerifier` ([app.ts:95](../../apps/partner-ai-service/src/inbound/http/app.ts)); when absent the static-token adapter from `auth` config is the dev default                                                                                                                      | Injected port; `AuthContext.subject.subjectId` is the identity every read/write scopes by           |
| Render an activity item   | `RenderActivityItem` / `WidgetActivityItem` ([side-chat-widget.types.ts](../../packages/side-chat-widget/src/widgets/side-chat/model/side-chat-widget.types.ts), both exported from `@side-chat/side-chat-widget`)                                                                 | `renderActivityItem` prop on `SideChatWidget`                                                                                                                                                                                                                                                | Rendering seam only: return a node to replace one item's default rendering, `undefined` to keep it  |
| Feed a context source     | `ContextManagerPort` ([context-manager.ts:11](../../packages/partner-ai-core/src/ports/context-manager.ts)); source types are the closed `CONTEXT_CANDIDATE_SOURCE_TYPES` ([capabilities.ts:39](../../packages/partner-ai-core/src/domain/capabilities/contracts/capabilities.ts)) | Tune admission via `options.capabilities` (config). No options hook to swap the port yet; a **new source type** is a cross-package change — see [Feed a context source](#feed-a-context-source)                                                                                              | Config tunes limits; replacing the manager or adding a source type is code, not config              |

The capability rule keeps three stages separate: a manifest `ToolCapability` is a declaration, not model access; the per-turn policy decides which names are allowed; runtime executes only registered `RuntimeTool`s named in that allowlist. Declaring a tool capability without an executable is impossible because one registration supplies both.

## How to add one

Each seam follows the same loop: write against the contract, then register or inject in composition. Steps below start with the verb you run.

### Add a tool

A config-driven tool is exactly three edits — a tool file, a map entry, a config entry — and nothing in the validator or the options adapter changes.

1. **Write the tool file** under `apps/partner-ai-service/src/adapters/tools/`. The beginner path is a plain async function via `createRuntimeToolFromPromise({ name, description, inputSchema, run })` — no Effect needed; return the JSON result or throw, and a thrown error is scrubbed to a stable `tool_failed`. The advanced path writes `RuntimeTool.execute` as an Effect directly. The worked example shows both flavors: [jira-search-issues-tool.ts](../../apps/partner-ai-service/src/adapters/tools/examples/jira-search-issues-tool.ts). Wrap the tool with `createServiceToolRegistration({ capability, runtimeTool, defaultEnabled, approvalPolicyIds, label })` so one factory returns the manifest capability and the executable together — the registry rejects any registration whose capability and tool names disagree.
2. **Add one map entry** in [tool-registrations.ts](../../apps/partner-ai-service/src/adapters/tools/tool-registrations.ts) mapping the tool name to a factory that reads the config-derived `ConfiguredToolInput` and returns the registration. `DEFAULT_TOOL_REGISTRATIONS` is the seam: the config validator accepts exactly the names it holds, and the options adapter dispatches the configured name through it. An unknown configured name fails boot with an error naming the available tools.
3. **Add one config entry** to `tools.availableTools` in `sidechat.config.ts`, and allowlist the name in the turn profile's `tools.names`. The config block controls exposure: `exposure.defaultMode` (`enabled`/`disabled` before the per-turn `enabledToolNames` selection) and `exposure.approvalPolicyIds` (approval gating — see `plan/24` for approval honesty). The profile allowlist is the security upper bound.

A tool that needs an injected dependency (a Jira/HTTP client, a secret) cannot be built from config alone — wire it programmatically through `PartnerAiServiceOptions.runtime.tools` with the same `createServiceToolRegistration`, bypassing steps 2–3.

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

1. Implement an `ObservabilitySinkPort` and pass it as `options.observability` — an explicit sink always wins over the profile default.
2. Treat every record as already redacted; never log raw prompts, provider output, or tool payloads. Core redacts records before your sink receives them.
3. A real sink already ships: [`createConsoleObservabilitySink`](../../apps/partner-ai-service/src/adapters/observability/console-observability-sink.ts) renders each `ObservabilityRecord` as one compact line and doubles as the copy-me recipe. Development installs it by default; production defaults to `NOOP_OBSERVABILITY_SINK`. The contract and no-op default live in [observability.ts](../../packages/partner-ai-core/src/services/observability.ts).
4. For events that have no turn (boot, config fallback, LISTEN drops, shutdown), use the second channel — the `DiagnosticLogger` ([@side-chat/shared](../../packages/shared/src/diagnostic-logger.ts)), a plain leveled logger, not the turn-scoped sink (ADR [0011](../adr/0011-observability-channels-and-console-first-dev.md)).

### Add a persistence adapter

1. Provide `SidechatRepositories` tagged with a valid `adapterKind` (`memory`, `postgres-drizzle`, or `custom`) via `options.repositories`, or set `persistence` config to select a built-in.
2. `createServicePersistenceBundle` picks memory or postgres by `PersistenceConfig.kind`; a custom kind needs explicit persistence metadata or composition fails closed.
3. Keep `pg` and `drizzle-orm` inside `@side-chat/db`; the boundary lints forbid them elsewhere.

### Plug in your auth verifier

The default authority is a static bearer token for local development — every caller of one token resolves to one subject. Production plugs in a real check by implementing `ServiceAuthVerifier` and passing it as `options.authVerifier`; when present it fully replaces the static-token adapter, so there are **no edits to `app.ts`**.

The contract is one method — request headers in, an `AuthContext` (or `undefined` to reject) out:

```ts
import type { ServiceAuthVerifier } from "@side-chat/partner-ai-service";
import type { AuthContext } from "@side-chat/partner-ai-core";

const jwtVerifier: ServiceAuthVerifier = {
  resolveAuthContext: async ({ bearerToken }) => {
    const claims = await verifyJwt(bearerToken); // your library; return undefined on failure
    if (!claims) return undefined;
    return {
      tenantId: claims.tenantId,
      workspaceId: claims.workspaceId,
      subject: { subjectId: claims.sub, userId: claims.sub },
      actor: { subjectId: claims.sub, userId: claims.sub },
      roles: ["member"],
      scopes: ["conversation:read", "conversation:write", "message:write"],
      source: "signed_service_token",
      issuedAt: new Date(claims.iat * 1000).toISOString(),
    } satisfies AuthContext;
  },
};

createPartnerAiServiceApp({ authVerifier: jwtVerifier /* , runtime, repositories, … */ });
```

`AuthContext.subject.subjectId` is the per-user identity **everything scopes by**: conversation lists and history, the activity stream, and every turn read/write. A turn belongs to the subject that started it, so a leaked turn id from another user resolves to not-found on status, stream, and host-command result, and its cancel is a durable no-op. Return `undefined` for an unverifiable token and the request is answered `401`; the built-in comparisons are constant-time and normalize the `Bearer ` prefix on either side.

### Change model parameters

Ordinary model knobs live on the turn profile, beside reasoning. Add a `callSettings` block to `chat.turnProfile` in `sidechat.config.ts`:

```ts
chat: {
  turnProfile: {
    // …id, systemInstructions, tools, safety…
    callSettings: {
      temperature: 0.4,
      maxOutputTokens: 1024,
      topP: 0.95,
      stopSequences: ["\n\nUser:"],
      maxToolSteps: 8, // tool-loop cap; omit for the default of 20
    },
  },
},
```

Each field is optional, so an absent block (or field) keeps the runtime/provider default — no behavior change for existing configs. The block threads profile → `TurnPolicyDecision` → `buildModelTurnRequest` → the runtime, which applies them as top-level model call settings (not provider-native options). A turn stopped at `maxToolSteps` completes with the `tool_step_limit` finish reason so a truncated turn is observable, not a silent `stop`. A provider may ignore a setting it does not support (OpenAI drops `temperature`/`topP` for reasoning models); `maxOutputTokens` is the portable one.

### Render an activity item

The widget renders protocol activity content by default: tools and host commands with disclosable payloads are expandable detail rows (input/result JSON, host-command `status · resultCode`), attributed sources fold under the answer as an "N sources" list, and produced images render as constrained inline thumbnails. To replace the rendering of one item — the usual first customization is a custom card for your own tool's result — pass `renderActivityItem`:

```tsx
<SideChatWidget
  client={client}
  renderActivityItem={
    (item) =>
      item.details?.tool?.toolName === "ticket_lookup" ? (
        <TicketCard result={item.details.tool.result} status={item.status} />
      ) : undefined // every other item keeps the default rendering
  }
/>
```

The callback receives each `WidgetActivityItem` (id, kind, status, title, protocol `details`) and returns a replacement node or `undefined` to fall through. It is a rendering seam only — projection of protocol events into widget state and host-command dispatch are not overridable here.

### Feed a context source

Core assembles each turn's model context from a fixed set of source types (the current message, conversation history, host page context, turn profile, tool capabilities, tool results). What you can change depends on how far you want to go — the three levels cost very differently.

**Tune admission (config, no code).** The likeliest change — a longer history window or a different budget — is `options.capabilities`. `ServiceCapabilityConfig.history` sets the recent-message window; `contextAdmission` sets the input/output token budget and whether the selector is `include_all` or `budgeted`. No source-type change, no code.

**Replace the whole context manager (code, no config hook yet).** The clean core seam is `ContextManagerPort.prepareTurnContext` ([context-manager.ts:11](../../packages/partner-ai-core/src/ports/context-manager.ts)) — implement it and core gathers context however you say. Caveat: the bundled `partner-ai-service` builds its own with `createServiceContextManager` ([service-context-manager.ts](../../apps/partner-ai-service/src/composition/context/context-manager/service-context-manager.ts)) and does **not** expose an `options` override for it today, so replacing it means composing your own service or forking that builder. (This is a known seam gap — there is no `options.contextManager`.)

**Add a new source type (cross-package change).** The most-requested example — "feed our CRM record into context" — is the hardest, because the source-type set is a closed union threaded through exhaustive switches. Adding one touches:

- **Core.** Add the value to `CONTEXT_CANDIDATE_SOURCE_TYPES` ([capabilities.ts:39](../../packages/partner-ai-core/src/domain/capabilities/contracts/capabilities.ts)). If you budget the new source separately, also widen `ContextSourceTokenBudgets` ([context.ts:103](../../packages/partner-ai-core/src/domain/capabilities/contracts/context.ts)) — today it is `{ history: number }` only, so a per-source cap reshapes a core contract.
- **Service.** Add a gatherer beside the existing ones ([context-manager/sources/](../../apps/partner-ai-service/src/composition/context/context-manager/sources/)), turn its output into candidates in [context-candidate-creation.ts](../../apps/partner-ai-service/src/composition/context/context-manager/candidates/context-candidate-creation.ts), and add a `case` to the **two exhaustive switches** in [context-admission.ts](../../apps/partner-ai-service/src/composition/context/context-manager/candidates/context-admission.ts) (`sourceRank` and the per-source budget switch) — TypeScript's `noFallthroughCasesInSwitch` makes a missed case a build error, which is the safety net here.

**Redaction is classification, not masking.** Every `ContextCandidate` carries a `redactionClass` (`public` → `secret`, [capabilities.ts:61](../../packages/partner-ai-core/src/domain/capabilities/contracts/capabilities.ts)). Admission **drops** a `secret` candidate whole (`REDACTION_BLOCKED`); there is no hook to mask or transform sub-strings before the content becomes model-visible. If your source can carry secrets, classify it `secret` (dropped) rather than expecting field-level redaction.

## Where adapters live

For folder placement inside the service, see [adapters/README.md](../../apps/partner-ai-service/src/adapters/README.md). Folders that ship implementations today: `auth/`, `guards/`, `host-commands/` (the connection-bound result resolver), `persistence/` (including the in-memory turn-event registry), `policy/`, and `tools/`. The rest (`agents/`, `memory/`, `observability/`, `rag/`, `title/`) are reserved and empty.

Both seams adopters most often ask for are now injectable: config-driven custom tools through the [tool-registrations.ts](../../apps/partner-ai-service/src/adapters/tools/tool-registrations.ts) map (or `options.runtime.tools` programmatically), and auth through `options.authVerifier`.
