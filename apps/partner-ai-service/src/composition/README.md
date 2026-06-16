# Service Composition

Read this when: wiring the deployable service, adding a provider/tool/assistant,
or changing what HTTP routes receive.
Source of truth for: how configuration becomes the ports, runtime, manifest, and
diagnostics the service exposes.
Not source of truth for: core turn lifecycle, policy semantics, or browser
protocol contracts.

## What this module owns

- The single composition root `composePartnerAiService(options)`.
- The named factories that each turn config into one typed bundle.
- Provider, tool, and assistant registries and their validation.
- The host capability manifest, turn policy resolver, and capability status.
- The per-turn context manager and conversation history context port.
- The final `StreamChatPorts` object handed to HTTP routes and secret-free
  diagnostics for health/models routes.

## What this module must not own

- Product turn lifecycle, policy decisions, or protocol mapping (those live in
  `@side-chat/partner-ai-core`).
- Provider-native stream parts or AI SDK details (those stay in
  `@side-chat/agent-runtime`).
- Request parsing or SSE transport (those live in `inbound/http`).
- Widget internals or copied UI code.

## Main entrypoints

- `service-composition.ts` — the composition root; reads top to bottom as a
  table of contents of the factories.
- `service-composition-types.ts` — `ServiceCompositionOptions`,
  `ServiceComposition`, `PersistenceConfig`, `RuntimeConfig`, `RuntimeToolConfig`.
- `factories/` — one factory per bundle, each with a co-located test:
  - `create-service-security-ports.ts` → auth + policy
  - `create-service-persistence-bundle.ts` → persistence config + repositories
  - `create-service-provider-bundle.ts` → provider registry + runtime providers
  - `create-service-tool-bundle.ts` → tool registry + runtime tools
  - `create-service-assistant-bundle.ts` → assistant profiles + prompts
  - `create-service-capability-bundle.ts` → manifest, manifest port, turn policy
    resolver, capability status
  - `create-service-context-bundle.ts` → history context + context manager
  - `create-service-runtime-bundle.ts` → `AiRuntimePort`
  - `create-stream-chat-ports.ts` → the final `StreamChatPorts`
  - `create-service-diagnostics.ts` → secret-free health/models diagnostics
  - `bundle-types.ts` → the bundle and diagnostics types
- `providers/`, `tools/`, `assistant/`, `manifest/`, `capabilities/`,
  `context-manager/` — the registries and adapters the factories assemble.

`ServiceComposition` is:
`{ workspace, hostAppId, auth, policies, persistence, repositories, runtime,
ports, capabilities, diagnostics }`. The chat-stream route consumes
`composition.ports`; health and models read `composition.diagnostics` and
`composition.capabilities`.

## Common change recipes

- Add a provider: register it in `providers/`, then it flows through
  `create-service-provider-bundle.ts`. See
  `docs/architecture/add-a-model-provider.md`.
- Add a runtime tool: ship capability + executor as one `ServiceToolRegistration`
  in `tools/`. See `docs/architecture/add-a-runtime-tool.md`.
- Add an assistant profile: add a `ServiceAssistantConfig`; it validates through
  `create-service-assistant-bundle.ts`. See
  `docs/architecture/add-an-assistant-profile.md`.
- Change what routes receive: edit the relevant factory and `StreamChatPorts`
  assembly, not the route files.

## Tests to update when changing it

- `service-composition.test.ts`, `service-composition.persistence.test.ts`.
- The per-factory tests under `factories/*.test.ts` (success + invariant).
- The registry tests in `providers/`, `tools/`, `assistant/`, and
  `context-manager/`.
