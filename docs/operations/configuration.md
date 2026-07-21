# Configuration

Read this when: you need to change the service's provider, model catalog, tools, host-context limits, capacity, persistence, telemetry, or Workflow settings.
Source of truth for: the readable `SideChatConfig` declarations and their resolution rules.
Not source of truth for: turn order ([assistant-turn.md](../architecture/assistant-turn.md)), database procedures ([database.md](database.md)), or gate commands ([verification.md](verification.md)).

`apps/side-chat-service` declares deployment behavior in one typed object per app-root variant:

- [`sidechat.config.ts`](../../apps/side-chat-service/sidechat.config.ts) — production OpenAI configuration;
- [`sidechat.azure.config.ts`](../../apps/side-chat-service/sidechat.azure.config.ts) — production Azure OpenAI configuration;
- [`sidechat.fake.config.ts`](../../apps/side-chat-service/sidechat.fake.config.ts) — credential-free testing/local configuration.

`SIDECHAT_CONFIG` selects the bundled declaration (`default`, `azure`, or `fake`). Unknown names and invalid relationships fail boot. Each file stays deliberately readable and complete; do not hide deployment choices behind factories or loops.

## Configuration sections

| Section             | Owns                                                                                                                                                                |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `models`            | Provider connection references, request-selectable model catalog, default model, context windows, reasoning effort subsets/defaults, and provider-specific routing. |
| `conversationTitle` | Title model and bounded enrichment timeout.                                                                                                                         |
| `serverTools`       | Deployment-selected names from the closed registered server-tool catalog.                                                                                           |
| `hostContext`       | Enablement and serialized/string/depth/entry limits for untrusted page context.                                                                                     |
| `auth`              | Development/production profile, bearer reference, and workspace mapping.                                                                                            |
| `timeouts`          | Admission queue, provider execution, and client-tool wait deadlines.                                                                                                |
| `capacity`          | Active-turn admission, activity-stream process/subject limits, queue size/deadline, and shutdown drain budget.                                                      |
| `agent`             | System instructions and maximum model/tool steps.                                                                                                                   |
| `persistence`       | Product PostgreSQL URL; absence is permitted only by the development/test configuration.                                                                            |
| `keepalive`         | Idle interval for HTTP SSE heartbeat comments.                                                                                                                      |
| `telemetry`         | `off`, bounded `console`, or optional `otlp` mode.                                                                                                                  |
| `workflow`          | Worker concurrency, pool size, journal retention/sweep, journal class, and Workflow PostgreSQL URL.                                                                 |

## Models and tools

`models.availableModels` is the request allowlist. The default must name one entry; ids must be unique; each reasoning default must belong to that model's advertised effort list. `/api/models` publishes only this safe catalog. Request values may select or narrow it but cannot introduce an unconfigured model or effort.

Azure deployment routing belongs to each model descriptor. Provider credentials and SDK objects remain private to the service and are reconstructed in the current Workflow realm; they are never serialized into durable input.

`serverTools` contains registered names only. Boot rejects unknown or duplicate names. The filtered set is both the HTTP catalog and the set installed in Workflow execution, so browser discovery and execution cannot drift. Per-turn `enabledToolNames` may narrow this set but cannot widen it.

## Environment references

Config files use `readEnv`, `readEnv.secret`, and `readEnv.number`; production code does not read `process.env` ad hoc. The complete accepted key vocabulary is `SERVICE_ENV_KEYS` in [`src/config/declaration/side-chat-config.ts`](../../apps/side-chat-service/src/config/declaration/side-chat-config.ts). Provider catalogs own provider-specific secret and transport key constants.

Important service-owned inputs include:

- `SIDECHAT_CONFIG`
- `SIDECHAT_AUTH_TOKEN`
- `SIDECHAT_WORKSPACE_ID`
- `SIDECHAT_DATABASE_URL`
- `SIDECHAT_DRAIN_BUDGET_MS`
- `SIDECHAT_OTLP_ENDPOINT`
- `SIDECHAT_OTEL_SERVICE_NAME`
- `WORKFLOW_POSTGRES_URL`
- `WORKFLOW_POSTGRES_WORKER_CONCURRENCY`
- `WORKFLOW_POSTGRES_MAX_POOL_SIZE`
- `WORKFLOW_LOCAL_DATA_DIR`
- `WORKFLOW_LOCAL_BASE_URL`

Secret references are resolved only during boot and are excluded from readable settings, logs, Workflow input, and browser catalogs.

## Capacity and database pools

`capacity.maxActiveTurns` is a per-service-process turn-admission bound. It must be sized with the Workflow worker concurrency and both database pools; the relationship is documented in [capacity-and-deployment.md](capacity-and-deployment.md). Overload is rejected before durable turn mutation.

`capacity.maxActivityStreams` bounds all authenticated activity SSE connections in one service process. `capacity.maxActivityStreamsPerSubject` separately bounds connections for one authenticated workspace and subject. The subject limit must not exceed the process limit. These socket/fan-out controls do not reserve generation capacity or durable Workflow workers.

Product persistence and Workflow persistence are separate configured connections and schemas. `workflow.maxPoolSize` must support the configured Workflow worker concurrency. Database setup and ownership live in [database.md](database.md).

## Loading and validation

Boot resolves the selected declaration against the process environment, validates types and cross-field relationships, freezes the resulting settings, builds safe public catalogs, and only then composes routes and Workflow execution. A missing required secret, invalid number, unknown tool, invalid model/default relationship, or unsupported provider is fatal; the service never silently switches behavior.

## Rules

- Add tunables to `SideChatConfig` and `SERVICE_ENV_KEYS`; do not add inline `process.env` reads.
- Keep provider secrets in provider/config adapters and database URLs in service configuration.
- Keep fake/scripted models and testing workflows out of the production Workflow graph.
- Update this document, the app README, and focused config tests when a configuration section or public catalog changes.
