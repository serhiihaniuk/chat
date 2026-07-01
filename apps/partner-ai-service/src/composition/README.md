# Service Composition

Read this when: wiring the deployable service, adding a provider/tool/turn profile,
or changing what HTTP routes receive.
Source of truth for: how configuration becomes the ports, runtime, manifest, and
diagnostics the service exposes.
Not source of truth for: core turn lifecycle, policy semantics, or browser
protocol contracts.

## Layout

One folder per concern — the wiring mirror of [`../adapters/`](../adapters/README.md),
which holds the implementations. Each concern folder owns its registry/builder
plus the factory that assembles it into a bundle; `service-composition.ts` is the
narrative that calls each factory in dependency order (it is the table of contents,
so there is no separate `factories/` folder).

```text
composition/
  service-composition.ts    the root — calls each concern's factory in dependency order
  service-composition-types.ts, bundle-types.ts    the shared contracts
  security/       create-service-security-ports.ts             (auth + policy)
  persistence/    create-service-persistence-bundle.ts
  providers/      service-provider-registry.ts  + create-service-provider-bundle.ts
  tools/          service-tool-registry.ts      + create-service-tool-bundle.ts
  turn-profile/   registry + config + factory   (prompt/ builds the system prompt)
  capabilities/   settings + manifest + factory (status/ builds capability status)
  context/        create-service-context-bundle.ts + the context-manager/ pipeline
  runtime/        create-service-runtime-bundle.ts + resumability-resolution.ts
  ports/          create-stream-chat-ports.ts   (the final StreamChatPorts)
  diagnostics/    create-service-diagnostics.ts (secret-free health/models)
```

`options → composePartnerAiService → each concern's factory → ServiceComposition → HTTP routes`

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
  table of contents, calling each concern's factory in dependency order.
- `service-composition-types.ts` / `bundle-types.ts` — the shared contracts:
  `ServiceCompositionOptions`, `ServiceComposition`, `PersistenceConfig`,
  `RuntimeConfig`, `RuntimeToolConfig`, and each `ServiceXBundle`.
- One folder per concern, each holding its registry/builder and its bundle
  factory (with a co-located test):
  - `security/` → auth + policy ports
  - `persistence/` → persistence config + repositories
  - `providers/` → provider registry + runtime providers
  - `tools/` → tool registry + runtime tools
  - `turn-profile/` → turn-profile registry + config, with `prompt/` for the system prompt
  - `capabilities/` → manifest + settings + factory, with `status/` for capability status
  - `context/` → history context + the `context-manager/` prepare-context pipeline
  - `runtime/` → `AiRuntimePort` + resumability resolution
  - `ports/` → the final `StreamChatPorts`
  - `diagnostics/` → secret-free health/models diagnostics

`ServiceComposition` is:
`{ workspace, hostAppId, auth, policies, persistence, repositories, runtime,
ports, turnRunner, dispatcher, hostCommandResolver, cancelDispatcher,
activityDispatcher, observability?, safetyPollIntervalMs, capabilities,
diagnostics, shutdown }` (`service-composition-types.ts:165`).
The runs route starts a turn through `composition.turnRunner`; the turn-stream
route subscribes through `composition.dispatcher` (+ `safetyPollIntervalMs`) and
`composition.ports`; the host-command result route settles
`composition.hostCommandResolver`; the activity route subscribes through
`composition.activityDispatcher`; health and models read `composition.diagnostics`
and `composition.capabilities`. The cancel and activity dispatchers are the
background owners that `composition.shutdown` tears down after interrupting
in-flight turns.

## Common change recipes

- Add a provider: register it in `providers/`, then it flows through
  `providers/create-service-provider-bundle.ts`.
- Add a runtime tool: ship capability + executor as one `ServiceToolRegistration`
  in `tools/`.
- Add a turn profile: add a `ServiceTurnProfileConfig`; it validates through
  `turn-profile/create-service-turn-profile-bundle.ts`. The readable config that
  feeds it lives in `docs/operations/configuration.md`.
- Change what routes receive: edit the relevant concern's factory and the
  `ports/` `StreamChatPorts` assembly, not the route files.

## Tests to update when changing it

- `service-composition.test.ts`, `service-composition.persistence.test.ts`.
- The co-located factory test in the concern you touched (e.g.
  `providers/create-service-provider-bundle.test.ts`).
- The registry tests in `providers/`, `tools/`, `turn-profile/`, and
  `context/context-manager/`.
