# Service Adapters

Read this when: adding host-app-specific infrastructure to the deployable
service.
Source of truth for: where concrete adapter implementations belong.
Not source of truth for: core turn lifecycle, policy semantics, or browser
protocol contracts.

## Folder Map

| Folder           | Add here                                                                | Do not add here                                           |
| ---------------- | ----------------------------------------------------------------------- | --------------------------------------------------------- |
| `agents/`        | Pre-answer research agents that produce context candidates/artifacts.   | Final runtime executors or provider-native stream events. |
| `auth/`          | Request authority and local auth profile adapters.                      | Product policy decisions.                                 |
| `guards/`        | Prompt/security turn guard registries and concrete guards.              | Context-board readers that need private RAG/memory.       |
| `host-commands/` | Service helpers for host UI command declarations or dispatch adapters.  | Backend model-callable tools.                             |
| `memory/`        | Memory recall/write adapters behind `MemoryPort`.                       | RAG retrievers or database repository contracts.          |
| `observability/` | Sinks that record redacted core observability records.                  | Raw provider/tool payload logging.                        |
| `persistence/`   | Service persistence port adapters over repositories.                    | Drizzle schema definitions.                               |
| `policy/`        | Service policy adapters around product-wide allow/deny checks.          | Manifest/profile validation rules.                        |
| `rag/`           | RAG retrievers behind `RagRetrieverPort`.                               | Runtime tools that the model calls directly.              |
| `tools/`         | Runtime tool implementations and matching manifest declaration helpers. | Host commands or widget behavior.                         |

Service composition wires adapters together. Route handlers should receive
already-composed ports and should not build app-specific tool, memory, RAG,
guard, research, or host-command logic directly.
