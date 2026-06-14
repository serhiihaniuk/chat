# Service Adapters

Read this when: adding host-app-specific infrastructure to the deployable
service.
Source of truth for: where concrete adapter implementations belong.
Not source of truth for: core turn lifecycle, policy semantics, or browser
protocol contracts.

## Folder Map

| Folder           | Add here                                                                      | Do not add here                                |
| ---------------- | ----------------------------------------------------------------------------- | ---------------------------------------------- |
| `agents/`        | `ResearchAgentPort` implementations that return context candidates/artifacts. | Final runtime executors or protocol events.    |
| `auth/`          | Request authority and local auth profile adapters.                            | Product policy decisions.                      |
| `guards/`        | `TurnGuardRegistryPort` implementations and concrete guards.                  | Context readers that need private RAG/memory.  |
| `host-commands/` | Service helpers for host UI command declarations or dispatch adapters.        | Backend model-callable tools.                  |
| `memory/`        | `MemoryPort` recall/write adapters.                                           | RAG retrievers or repository schema.           |
| `observability/` | Sinks for already-redacted lifecycle records.                                 | Raw provider, prompt, or tool payload logging. |
| `persistence/`   | Service persistence port adapters over repositories.                          | Drizzle schema definitions.                    |
| `policy/`        | Service policy adapters around product-wide allow/deny checks.                | Manifest/profile validation rules.             |
| `rag/`           | `RagRetrieverPort` implementations with provenance/trust/redaction metadata.  | Runtime tools that the model calls directly.   |
| `tools/`         | RuntimeTool implementations and matching ToolCapability helpers.              | Host commands or widget behavior.              |

Service composition wires adapters together. Route handlers should receive
already-composed ports and should not build app-specific tool, memory, RAG,
guard, research, or host-command logic directly.

## Seam Notes

- Research runs during context preparation only when policy allows workflow and
  source ids.
- Turn guards run before conversation persistence, private context, RAG, memory,
  research, or runtime execution.
- Memory recall runs during context preparation; write candidates run after
  successful turns.
- Tool declarations and executable registrations stay separate.
- `mock-web-search-tool.ts` is a local development/test fixture.

## Canonical Docs

- `docs/architecture/extension-seams.md`
- `docs/architecture/package-boundaries.md`
