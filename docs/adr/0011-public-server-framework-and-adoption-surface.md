# ADR 0011: Separate the Public Server Framework from the Adopter Application

Read this when: deciding where server extensions, authentication, or adopter composition belong.
Source of truth for: why Side Chat exposes a side-effect-free server framework package while retaining app-local Workflow entrypoints.
Not source of truth for: current extension paths and procedures (see [extension-seams.md](../architecture/extension-seams.md)).

Status: accepted 2026-07-20

## Context

The durable server implementation has reusable tool, authentication, approval,
and composition concepts, but their interfaces lived inside the deployable
`apps/side-chat-service` application. Its package root booted Nitro as an import
side effect. Adopters therefore had to understand internal application,
adapter, composition, configuration, and Workflow folders before they could add
the most common custom code.

Server tools also received only an idempotency key and optional nested model
generation. The authenticated workspace and subject reached durable Workflow
execution for ownership checks, but did not reach the tool adapter itself. A
real integration could not perform actor-aware authorization through the
framework interface.

Workflow and step code execute in separately compiled realms. Request tokens,
provider clients, database clients, vendor credentials, functions, and other
non-serializable values cannot cross through Workflow input or its journal.

## Decision

Create `@side-chat/side-chat-server` as the side-effect-free server framework
package. It owns stable authentication, durable actor, server-tool, approval
policy, integration-registration, and adopter-manifest interfaces plus their
dependency-light validation.

Keep `apps/side-chat-service` as the deployable reference application. Its
adopter-authored code lives at visible top-level paths:

- `src/sidechat.ts` registers the available integrations once;
- `src/integrations/` owns concrete integration adapters and tools;
- `src/auth/` owns the configured request-authorizer adapter;
- `sidechat*.config.ts` selects deployment settings and may narrow the registered
  tool catalog.

Request authentication produces an `AuthContext`. Durable execution receives
only its `DurableActorRef`, containing stable workspace and subject identity.
Every server-tool execution receives that actor reference plus invocation and
idempotency identity. Tool adapters use the actor reference to re-evaluate
current authorization or resolve server-held credentials; they never receive or
journal the request bearer token.

Production Workflow entrypoints remain app-local in this decision. Nitro
currently scans app-local Workflow directories, and external workspace-package
Workflow compilation has not been proven by the compatibility suite. Shared
contracts may move now without weakening that physical build invariant.

## Alternatives rejected

- **Add barrels over the existing internal folders:** creates a shallow facade
  while the deployable package still boots on import and owns the extension
  interface.
- **Move every runtime file immediately:** expands the change into unproven Nitro
  external-package Workflow scanning and obscures the adopter-facing goal.
- **Journal the full request authentication state:** risks retaining credentials
  or stale authorization data and couples durable recovery to one HTTP request.
- **Let each tool invent its own identity shape:** duplicates security-sensitive
  workspace and subject propagation across integrations.

## Consequences

The reference application depends inward on `@side-chat/side-chat-server`; the
framework package never imports the application. Tool and auth authors import
stable contracts from one package rather than application-private paths.

The first extraction intentionally leaves HTTP, provider SDK, persistence, and
Workflow implementations in the deployable application. Moving those mechanics
later requires separate evidence that the Nitro build, Workflow scan, production
graph, and compatibility suite remain equivalent.
