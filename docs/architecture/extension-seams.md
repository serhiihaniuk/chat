# Extension Seams

Read this when: you need to add a tool, provider/model, host context source, telemetry sink, stream extension, or widget renderer.
Source of truth for: supported extension points in the current service and browser architecture.
Not source of truth for: import rules ([package-boundaries.md](package-boundaries.md)), lifecycle order ([assistant-turn.md](assistant-turn.md)), or public stream grammar ([runtime-and-protocol-events.md](runtime-and-protocol-events.md)).

## Extension rule

Extend the owner of the behavior. The service owns policy, durable execution, providers, tools, and outbound privacy. Browser packages own page integration and rendering. Shared packages own only stable, dependency-light contracts used by more than one package.

Prefer a registered catalog entry or an existing app-local port before adding a new abstraction. A change that alters the public UI-message stream, product schema, Workflow input, or authorization contract is an architecture change and requires its canonical document and focused tests to change with it.

## Available seams

| Need                         | Contract and binding point                                                                                                                                                                       | Boundary                                                                                                                          |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------- |
| Add a server tool            | Define it with `@side-chat/side-chat-server`, place it under `apps/side-chat-service/src/integrations/`, and register its integration in `src/sidechat.ts`.                                      | Executes inside the service; validate input and return durable-safe model output.                                                 |
| Add a client tool            | Register a `HostClientToolDefinition` with `@side-chat/host-bridge`; advertise its bounded definition in the turn request.                                                                       | Executes only in the originating tab under the raw capability. See [client-tools.md](client-tools.md).                            |
| Require server-tool approval | Apply the registered approval policy and durable Workflow approval wait.                                                                                                                         | Approval UI and decisions use native AI SDK parts; see [tool-approvals.md](tool-approvals.md).                                    |
| Add a provider/model         | Add a provider adapter and model descriptor under the service adapters/composition/config catalogs.                                                                                              | Provider SDK types and credentials stay inside `apps/side-chat-service`.                                                          |
| Change model settings        | Extend the validated model descriptor/config and map it in the provider adapter.                                                                                                                 | The browser may select only values published by the model catalog.                                                                |
| Add host context             | Extend `@side-chat/host-bridge` context production and the service's bounded host-context validator/rendering stage.                                                                             | Context is untrusted user data, never authority or system instructions.                                                           |
| Add telemetry                | Implement the app-local `TelemetrySink` and register it during service composition.                                                                                                              | Records must be bounded and scrubbed; never include prompts, provider output, secrets, or private tool payloads.                  |
| Add an outbound transform    | Register a transform in the service stream composition around the shared scrub transform.                                                                                                        | Preserve native UI-message ordering, terminal discipline, cursor meaning, and privacy.                                            |
| Add a public `data-*` part   | Define and validate it in `@side-chat/stream-profile`, then add named producer and consumer tests.                                                                                               | Use only when native AI SDK parts cannot represent the concept; requires privacy review.                                          |
| Render an activity item      | Pass `renderActivityItem` to `SideChatWidget`.                                                                                                                                                   | Presentation only; it cannot change execution, approval, or authority.                                                            |
| Change persistence           | Implement the app-local repository port in `@side-chat/db` and bind it in service composition.                                                                                                   | `pg` and Drizzle remain inside `packages/db`; preserve both schema ownership and transactions.                                    |
| Change authentication        | Implement the public `RequestAuthorizer` contract under `apps/side-chat-service/src/auth/production-request-authorizer.ts`; route composition imports that process-local binding for production. | Every resource read/write remains tenant-qualified workspace and subject scoped. Built-in static bearer auth is development-only. |

## Server tools

Server tools are declared through the public server framework and grouped into
integration modules. `src/sidechat.ts` is the single registered catalog used by
route and Workflow composition, so policy cannot advertise a tool that durable
execution cannot reload.

When adding one:

1. define the input schema and integration adapter implementation;
2. register the tool's integration in `src/sidechat.ts`;
3. add its name to the validated `serverTools` configuration where the deployment should expose it;
4. choose approval policy explicitly;
5. add focused execution, schema, timeout, cancellation, and scrub tests.

Do not read environment variables inside the tool module. Inject configured clients or credentials through service composition. Tool failures must collapse to safe model/public errors while private causes stay in scrubbed telemetry.

Every execution receives a secret-free durable actor reference. Use it to check
the current actor's authority in the integration adapter. Do not place request
tokens, vendor credentials, or mutable authorization claims in Workflow input.

## Authentication

Production authentication is an adopter-owned service binding, not a readable
configuration value. The stock production config selects the `production`
profile, and production route composition calls
`createProductionRequestAuthorizer` from
`apps/side-chat-service/src/auth/production-request-authorizer.ts` before any
authenticated route is mounted. Adopters replace that app-local function with
their identity-system integration and return the public `AuthContext` shape.

The development profile is the only profile allowed to use the built-in static
bearer authorizer. It exists for deterministic fake/local runs and produces a
bounded tenant-qualified workspace and subject identity without requiring an external identity
provider. Do not use host context, request metadata, tool input, model output,
or Workflow state as authentication authority.

`AuthContext` is request-scoped. Workflow input and server-tool execution receive
only the secret-free `DurableActorRef`, so request bearer tokens, provider
credentials, and mutable claims never enter the Workflow journal, browser data,
logs, or documentation examples.

## Client tools

Browser-side implementations use `@side-chat/host-bridge`; the service owns the durable dispatch and result authority. Do not add a parallel browser-action protocol. The native AI SDK dynamic tool part, originating-tab capability, output endpoint, and Workflow hook are the one supported path.

The full lifecycle and security rules live in [client-tools.md](client-tools.md).

## Providers and model catalog

Provider adapters live under `apps/side-chat-service/src/adapters/providers/`; production selection and model construction live under service composition. Model descriptors own public ids, labels, reasoning-effort subsets/defaults, and supported settings. `/api/models` publishes only the safe descriptor.

Credentials, provider model objects, provider options, and provider response metadata remain inside the service. The Workflow rebuilds provider delegates in the current realm rather than serializing SDK objects into durable input.

## Host context

Add context production to `@side-chat/host-bridge` and validate it at the service HTTP boundary. If the shape changes, update both direct and iframe contracts. Keep a single named execution-only rendering stage so the accepted product message remains unchanged.

Every added field must have explicit string, collection, nesting, entry, and total-size behavior. Treat all content as untrusted user-provided reference material.

## Public stream extensions

Native AI SDK parts are the default. Add a `data-*` part only when the UI cannot derive the concept from native text, reasoning, source, file, tool, approval, start, finish, abort, or message-metadata parts.

A new part requires:

- a dependency-free schema and type in `packages/stream-profile`;
- a service producer and outbound scrub rule;
- a widget consumer with replay/history behavior;
- cursor and terminal-order tests;
- a privacy classification documented in [stream-profile.md](stream-profile.md).

## Telemetry and diagnostics

The service's app-local telemetry port receives bounded records and must never become a second event bus. Turn telemetry describes safe lifecycle measurements and classifications. Boot/config/process diagnostics use the shared diagnostic logger. Neither channel may contain secrets, prompts, model output, raw errors, private context, or tool bodies.

## Widget rendering

`renderActivityItem` receives a normalized `SideChatActivityItem` and may replace eligible default rows. Tool visibility policy and native approval cards remain authoritative. The callback is a rendering seam only and cannot mutate chat state, dispatch client tools, or submit approvals.

## Verification

Run focused tests for the owner you changed, then the repository boundary and type gates. For stream or durable execution seams, also run replay/restart tests. The canonical command matrix is [verification.md](../operations/verification.md).
