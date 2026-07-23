# Side Chat server framework

Read this when: implementing authentication or server integrations for a Side Chat deployment.
Source of truth for: the public server framework contracts and integration-registration surface.
Not source of truth for: durable runtime mechanics or deployment wiring; see the [system map](../../docs/architecture/system-map.md) and [extension seams](../../docs/architecture/extension-seams.md).

`@side-chat/side-chat-server` is a side-effect-free framework package. Importing
it never starts HTTP, Workflow, providers, or persistence. It exposes the stable
contracts that adopter code implements while `apps/side-chat-service` remains
the deployable reference application.

The public surface owns:

- request authentication and the secret-free durable actor reference;
- server-tool definitions, approval policies, and execution context;
- integration registration and the single adopter manifest;
- validation that prevents duplicate integration and tool names.

Adopter code belongs under `apps/side-chat-service/src/auth/`,
`apps/side-chat-service/src/integrations/`, and `src/sidechat.ts`. Request tokens
and vendor credentials must not enter the durable actor reference or Workflow
input. A tool adapter receives the actor reference and must resolve current
authority or credentials inside its executing realm. The public `workspaceId`
is globally unique and tenant-qualified; an adopter must not reuse a local
workspace identifier across tenants.
