# Service Adapters

Read this when: adding host-app-specific infrastructure to the deployable
service.
Source of truth for: where concrete adapter implementations belong.
Not source of truth for: core turn lifecycle, policy semantics, or browser
protocol contracts.

## Folder Map

| Folder           | Add here                                                               | Do not add here                                |
| ---------------- | ---------------------------------------------------------------------- | ---------------------------------------------- |
| `auth/`          | Request authority and local auth profile adapters.                     | Product policy decisions.                      |
| `guards/`        | `TurnGuardRegistryPort` implementations and concrete guards.           | Private context readers.                       |
| `host-commands/` | Service helpers for host UI command declarations or dispatch adapters. | Backend model-callable tools.                  |
| `observability/` | Sinks for already-redacted lifecycle records.                          | Raw provider, prompt, or tool payload logging. |
| `persistence/`   | Service persistence port adapters over repositories.                   | Drizzle schema definitions.                    |
| `policy/`        | Service policy adapters around product-wide allow/deny checks.         | Manifest/profile validation rules.             |
| `tools/`         | RuntimeTool implementations exposed as one `ServiceToolRegistration`.  | Host commands or widget behavior.              |

Service composition wires adapters together. Route handlers should receive
already-composed ports and should not build app-specific tool, guard, or
host-command logic directly.

## Seam Notes

- Turn guards run before conversation persistence, private context, or runtime
  execution.
- A tool's capability and executable ship as one `ServiceToolRegistration`, so
  the manifest and runtime never need two independent lists.
- `mock-web-search-tool.ts` is a local development/test fixture exposed through
  `createMockWebSearchRegistration`.

## Canonical Docs

- `docs/architecture/extension-seams.md`
- `docs/architecture/package-boundaries.md`
