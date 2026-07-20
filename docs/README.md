# Side Chat documentation

Read this when: you need the durable source of truth for the current Side Chat system.

Source of truth for: documentation ownership and the shortest path to the right document.

Side Chat has one production architecture: `apps/side-chat-service` runs AI SDK 7 on Workflow DevKit/Postgres World, `packages/side-chat-widget` consumes the native UI message stream, and PostgreSQL stores product state through `packages/db`.

## Start here

| Need                                          | Document                                                                                     |
| --------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Product terms                                 | [domain/vocabulary.md](domain/vocabulary.md)                                                 |
| Components and entry points                   | [architecture/system-map.md](architecture/system-map.md)                                     |
| Import and data boundaries                    | [architecture/package-boundaries.md](architecture/package-boundaries.md)                     |
| Ordered turn lifecycle                        | [architecture/assistant-turn.md](architecture/assistant-turn.md)                             |
| Workflow bundles, realms, hooks, and journals | [architecture/workflow-substrate.md](architecture/workflow-substrate.md)                     |
| Native stream and activity events             | [architecture/runtime-and-protocol-events.md](architecture/runtime-and-protocol-events.md)   |
| Public UI message stream profile              | [architecture/stream-profile.md](architecture/stream-profile.md)                             |
| Client tools and originating-tab authority    | [architecture/client-tools.md](architecture/client-tools.md)                                 |
| Server-tool approval                          | [architecture/tool-approvals.md](architecture/tool-approvals.md)                             |
| Crash recovery and effective turn activity    | [architecture/turn-terminal-reconciliation.md](architecture/turn-terminal-reconciliation.md) |
| Widget and host integration                   | [architecture/widget-and-host-integration.md](architecture/widget-and-host-integration.md)   |
| Supported extension points                    | [architecture/extension-seams.md](architecture/extension-seams.md)                           |

## Operations

| Need                                                | Document                                                                       |
| --------------------------------------------------- | ------------------------------------------------------------------------------ |
| Local service and widget development                | [operations/local-development.md](operations/local-development.md)             |
| Live design-token configuration and widget previews | [operations/local-development.md](operations/local-development.md)             |
| Configuration and environment references            | [operations/configuration.md](operations/configuration.md)                     |
| Admission, worker sizing, and deployment            | [operations/capacity-and-deployment.md](operations/capacity-and-deployment.md) |
| Product schema, migrations, and journal maintenance | [operations/database.md](operations/database.md)                               |
| Telemetry and privacy                               | [operations/telemetry.md](operations/telemetry.md)                             |
| Verification commands and what they prove           | [operations/verification.md](operations/verification.md)                       |
| Iframe embedding                                    | [operations/embed-widget-iframe.md](operations/embed-widget-iframe.md)         |

## Documentation ownership

- Architecture documents describe the current system, not migration history or target plans.
- Operations documents own commands, configuration, deployment, and database procedures.
- Package READMEs own only local public surfaces and package-specific boundaries.
- ADRs preserve decision history. When an ADR describes a removed architecture, its historical status does not make that architecture current.
- `plan/` tracks delivery work and is never the source of truth for shipped behavior.

When code and a canonical document disagree, verify the code and update the owning document in the same coherent change.
