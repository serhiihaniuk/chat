# Service Composition

Read this when: wiring the deployable service, adding a provider/tool/turn profile,
or changing what HTTP routes receive.
Source of truth for: how configuration becomes the ports, runtime, manifest, and
diagnostics the service exposes.
Not source of truth for: core turn lifecycle, policy semantics, or browser
protocol contracts.

## What this module owns

- The single composition root `composePartnerAiService(options)`.
- The named factories that each turn config into one typed bundle.
- Provider, tool, and turn-profile registries and their validation.
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
  - `create-service-turn-profile-bundle.ts` → turn profiles + prompts
  - `create-service-capability-bundle.ts` → manifest, manifest port, turn policy
    resolver, capability status
  - `create-service-context-bundle.ts` → history context + context manager
  - `create-service-runtime-bundle.ts` → `AiRuntimePort`
  - `create-stream-chat-ports.ts` → the final `StreamChatPorts`
  - `create-service-diagnostics.ts` → secret-free health/models diagnostics
  - `bundle-types.ts` → the bundle and diagnostics types
- `providers/`, `tools/`, `turn-profile/`, `manifest/`, `capabilities/`,
  `context-manager/` — the registries and adapters the factories assemble.

`ServiceComposition` is:
`{ workspace, hostAppId, auth, policies, persistence, repositories, runtime,
ports, turnRunner, dispatcher, cancelDispatcher, activityDispatcher, reaper,
pruner, observability?, safetyPollIntervalMs, capabilities, diagnostics, shutdown }`.
The runs route starts a turn through `composition.turnRunner`; the turn-stream
route subscribes through `composition.dispatcher` (+ `safetyPollIntervalMs`) and
`composition.ports`; the activity route subscribes through
`composition.activityDispatcher`; health and models read `composition.diagnostics`
and `composition.capabilities`. The cancel dispatcher, reaper (stale lease
terminalizer), and pruner (`turn_events` retention) are background owners that
`composition.shutdown` tears down with the dispatchers.

## Common change recipes

- Add a provider: register it in `providers/`, then it flows through
  `create-service-provider-bundle.ts`.
- Add a runtime tool: ship capability + executor as one `ServiceToolRegistration`
  in `tools/`.
- Add a turn profile: add a `ServiceTurnProfileConfig`; it validates through
  `create-service-turn-profile-bundle.ts`. The readable config that feeds it lives in
  `docs/operations/configuration.md`.
- Change what routes receive: edit the relevant factory and `StreamChatPorts`
  assembly, not the route files.

## Tests to update when changing it

- `service-composition.test.ts`, `service-composition.persistence.test.ts`.
- The per-factory tests under `factories/*.test.ts` (success + invariant).
- The registry tests in `providers/`, `tools/`, `turn-profile/`, and
  `context-manager/`.
