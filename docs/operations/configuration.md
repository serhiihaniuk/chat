# Configuration

Read this when: you need to change what the service runs — its provider, models, tools, policy, context budgets, or resumability timers.
Source of truth for: the human-readable `SideChatConfig` object, its top-level keys, and how the service loads it.
Not source of truth for: gate commands (see [verification.md](verification.md)), local-run env wiring (see [embed-widget-iframe.md](embed-widget-iframe.md)), or the turn lifecycle these settings tune (see [../architecture/assistant-turn.md](../architecture/assistant-turn.md)).

Side Chat's runnable app, `apps/partner-ai-service`, declares its entire behavior in one typed object: `defineSideChatConfig({...}) satisfies SideChatConfig` in [`apps/partner-ai-service/sidechat.config.ts`](../../apps/partner-ai-service/sidechat.config.ts). The server loads that object at boot and builds its options from it. Process inputs (secrets, port, profile) are declared _inside_ the same object as `readEnv(...)` references, so the config stays the single, readable map of what the service does. Reading `process.env` ad-hoc anywhere else fails a governance gate.

The AI SDK 7 replacement wing follows the same readable-declaration rule in [`apps/side-chat-service/sidechat.config.ts`](../../apps/side-chat-service/sidechat.config.ts), with standalone `azure` and testing-only `fake` variants. Each file declares the provider connection, the default request model, every request-selectable model and its exact reasoning policy, the conversation-title job, and the selected server tools. Catalog modules provide typed constants and registered executors remain in application code, but neither may hide which capabilities a deployment selects.

The file's shape is a recorded decision, not an accident: it is one big, deliberately repetitive file per deployment variant, with no loops, factories, or shared fragments — do not "clean it up" ([ADR 0010](../adr/0010-readable-declarative-config.md)).

## Replacement service config object

The replacement config uses these behavior-owning sections:

```ts
defineSideChatConfig({
  models: {
    provider: OPENAI_PROVIDER.KIND,
    connection: {
      apiKey: readEnv.secret(OPENAI_PROVIDER.SECRET_ENV_KEYS.API_KEY),
      baseUrl: readEnv(OPENAI_PROVIDER.TRANSPORT_ENV_KEYS.BASE_URL),
    },
    reasoningSummary: OPENAI_PROVIDER.REASONING_SUMMARIES.CONCISE,
    defaultModelId: OPENAI_PROVIDER.MODELS.GPT_5_6_LUNA.MODEL_ID,
    availableModels: [
      {
        id: OPENAI_PROVIDER.MODELS.GPT_5_6_LUNA.MODEL_ID,
        contextWindowTokens:
          OPENAI_PROVIDER.MODELS.GPT_5_6_LUNA.CONTEXT_WINDOW_TOKENS,
        reasoning: {
          defaultEffort: OPENAI_PROVIDER.REASONING_EFFORTS.MEDIUM,
          efforts: [
            OPENAI_PROVIDER.REASONING_EFFORTS.LOW,
            OPENAI_PROVIDER.REASONING_EFFORTS.MEDIUM,
            OPENAI_PROVIDER.REASONING_EFFORTS.HIGH,
          ],
        },
      },
    ],
  },
  conversationTitle: {
    modelId: OPENAI_PROVIDER.MODELS.GPT_5_6_LUNA.MODEL_ID,
    timeoutMs: 10_000,
  },
  serverTools: [],
  hostContext: {
    enabled: true,
    maxSerializedBytes: 16_384,
    maxStringLength: 4_096,
    maxMetadataDepth: 8,
    maxMetadataEntries: 128,
  },
  // auth, timeouts, agent, persistence, keepalive, telemetry, workflow
});
```

`models.availableModels` is the request allowlist. `models.defaultModelId` must name one entry, each model id must be unique, and a reasoning default must be one of that model's listed efforts. `/api/models` publishes the whole list plus the default. `prepareTurn` resolves the request against this catalog before conversation checks, admission, persistence, or Workflow start.

Azure keeps credentials, endpoint, and API version in `models.connection`, but each `availableModels` entry owns its deployment name. The adapter therefore resolves `modelId` to the selected model's deployment instead of treating one deployment as provider-wide. The scripted variant lists only request-selectable scripted behaviors; its separate title model stays visible under `conversationTitle`.

`serverTools` is the deployment's selected list of registered server-tool names. Boot rejects duplicates and names absent from the registered executor catalog. The filtered definitions are the only tools published by `/api/tools` and the only server tools installed in the Workflow agent; a per-turn `enabledToolNames` request may narrow that list but cannot widen it. Production currently declares an honest empty list.

`hostContext.enabled` is deployment policy, not a UI default. Authenticated `/api/capabilities` publishes it to the widget. When false, the `+` menu cannot offer **Include page context** and `/api/chat` rejects any request that still supplies `hostContext`. When true, the option still requires a host-registered provider and explicit user opt-in; enabled configuration alone never causes collection.

The remaining `hostContext` fields bound optional browser-supplied page reference data before a turn reaches application policy. The HTTP boundary rejects unknown host-context keys, strings over `maxStringLength`, non-finite metadata numbers, metadata deeper than `maxMetadataDepth`, metadata with more than `maxMetadataEntries` nested object properties and array items, or a normalized UTF-8 serialization over `maxSerializedBytes`. The accepted value remains untrusted user-level data: it may be rendered into the current user message for model execution, but it never supplies identity, authorization, workspace scope, or system instructions.

Only behavior that is wired remains configurable. The replacement retains queue, provider, client-tool, and title timeouts; agent instructions and step cap; persistence; SSE keepalive interval; telemetry; and Workflow journal retention, sweep, class, and database settings. It deliberately has no request timeout, agent token budgets, active-generation count, proxy-idle budget, or worker-concurrency/headroom fields because those values did not control runtime behavior. Step 17 owns any future capacity policy and must add real enforcement before adding capacity configuration.

The replacement service consumes `hostContext.enabled` in both capability publication and request admission, and consumes every limit directly in request validation. The native widget collects a fresh snapshot only for an opted-in send; reconnect and replay never recollect it.

## Legacy service config object

One file, one default export: `defineSideChatConfig({...}) satisfies SideChatConfig` (`sidechat.config.ts:32`, `:227-229`). It is one production OpenAI config, not a local/openai switchboard. A second standalone file, [`sidechat.azure.config.ts`](../../apps/partner-ai-service/sidechat.azure.config.ts), holds the Azure OpenAI variant; the local launcher boots it by pointing `SIDECHAT_CONFIG_PATH` at it.

## Top-level keys

Every key below lives in `sidechat.config.ts` at the cited line. Each owns one slice of behavior:

| Key                  | Owns                                                                                                                                                                                                                                  | Line   |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| `environment`        | Deployment shape and secrets via `readEnv`: port, profile, bearer token, database URL, tenant/workspace ids.                                                                                                                          | `:33`  |
| `models`             | Provider connection (kind, secret API key, optional endpoint), reasoning summary, the `default` model, and `availableModels` with per-model reasoning options.                                                                        | `:61`  |
| `executors`          | The executor catalog and default; ships only `AI_SDK_TOOL_LOOP`.                                                                                                                                                                      | `:105` |
| `tools`              | Backend tools the assistant may call; ships only `mock_web_search` (prompt, parameters, and default exposure).                                                                                                                        | `:109` |
| `hostCommands`       | App-owned commands the host runs; ships with an empty command catalog.                                                                                                                                                                | `:126` |
| `turnGuards`         | Per-turn safety guards; ships empty.                                                                                                                                                                                                  | `:131` |
| `requestPolicy`      | Request gating mode (`CONFIGURED`) and the model entitlements a request may select.                                                                                                                                                   | `:134` |
| `chat.turnProfile`   | The default profile: system instructions, Markdown output, allowlisted tools, and standard safety.                                                                                                                                    | `:143` |
| `context`            | History window (`recent_messages`, 12 messages / 4k tokens) and `contextAdmission` token budgets.                                                                                                                                     | `:167` |
| `auxiliaryModelJobs` | Side model jobs; ships the enabled conversation-title job.                                                                                                                                                                            | `:180` |
| `history`            | Turn-activity retention (`turnActivity`, `SIDECHAT_TURN_ACTIVITY_HISTORY`): `full` (default) stores the turn's activity trace with the assistant message and serves it on history reads; `disabled` keeps the trace live-stream-only. | `:211` |
| `streaming`          | The delta coalescing window (`outputDeltaFlushInterval`): provider text and reasoning batched into ~4 events/s per active block — fewer SSE frames and widget re-renders.                                                             | `:214` |
| `resumability`       | Lease and heartbeat timers, the per-process `instanceId`, the crash-recovery sweep cadence (`reaperInterval`, `reaperBatchLimit` — ADR 0008), and the `sseHeartbeatInterval` SSE keepalive.                                           | `:189` |

## Declaring process inputs with `readEnv`

The config never reads `process.env` directly. Each process input is a `readEnv` reference carrying a `description` and an optional `defaultValue`, which the boot path resolves to a value. Use the variant that matches the input:

| Reference                    | Use for                                  | Example                                       |
| ---------------------------- | ---------------------------------------- | --------------------------------------------- |
| `readEnv(key, ...)`          | A plain string with a default.           | `environment.profile` (`:38`)                 |
| `readEnv.secret(key, ...)`   | A secret never logged.                   | `environment.databaseUrl` (`:45`)             |
| `readEnv.number(key, ...)`   | A numeric value.                         | `resumability.leaseTtl` (`:200`)              |
| `readEnv.boolean(key, ...)`  | A boolean flag.                          | `environment.demoSeedConversations` (`:48`)   |
| `readEnv.optional(key, ...)` | An optional override, absent by default. | `models.provider.connection.endpoint` (`:68`) |

Env variable names are centralized, not typed inline. They live in `SERVICE_ENV_KEYS` ([`src/config/env/service-env-contract.ts`](../../apps/partner-ai-service/src/config/env/service-env-contract.ts)), a dependency-free leaf the config files and the boot-path resolvers share. Add a key there, then reference it from the config. Provider secrets keep their canonical names in the provider catalog (`PROVIDERS.*.SECRET_ENV_KEYS`).

Diagnostic logging is configured the same way: `environment.logLevel` (`SIDECHAT_LOG_LEVEL`, default `info`) and `environment.logFormat` (`SIDECHAT_LOG_FORMAT`, default `pretty` in development and `json` in production) select the console log verbosity and shape. For what each level prints, see [local-development.md](./local-development.md) "Run with logs".

The Postgres query pool is tunable through `environment.databasePool`; each key is optional and absence keeps the node-postgres default. Set them only to override:

| Env variable                                   | Pool option               | Default       |
| ---------------------------------------------- | ------------------------- | ------------- |
| `SIDECHAT_DATABASE_POOL_MAX`                   | `max`                     | 10            |
| `SIDECHAT_DATABASE_POOL_IDLE_TIMEOUT_MS`       | `idleTimeoutMillis`       | node-postgres |
| `SIDECHAT_DATABASE_POOL_CONNECTION_TIMEOUT_MS` | `connectionTimeoutMillis` | node-postgres |
| `SIDECHAT_DATABASE_POOL_SSL`                   | `ssl` (TLS on/off)        | off           |

These apply to the shared query pool. The three dedicated `LISTEN` connections (cancel, activity, host-command result) are not pooled; enable TLS for them through the connection string's `sslmode`. Both the pool and the `LISTEN` connections now survive a database restart — see [assistant-turn.md](../architecture/assistant-turn.md) "Connection resilience".

## How the service loads it

The typed config object is the ONE config system — there is no fallback:

1. `server.ts` calls `loadSelectedSideChatConfig()` and builds options via `createPartnerAiServiceOptionsFromConfig(config)`.
2. The loader ([`config-selection.ts`](../../apps/partner-ai-service/src/config/sidechat-config/selection/config-selection.ts)) imports the config module. `SIDECHAT_CONFIG_PATH` overrides the module path; the default is the app-root `sidechat.config.ts`.
3. `SIDECHAT_CONFIG` selects a named config when the module exports a `SIDECHAT_CONFIGS` registry; otherwise the default export is used. An unknown name throws.
4. **A config that cannot load is a fatal boot error.** A missing file, a syntax error, or a throw at module scope prints the module path and reason and exits non-zero — the service never silently boots different behavior.

## Rules

- **No ad-hoc `process.env`.** `check-runtime-boundaries.mjs:22-28` fails any production source that reads `process.env` outside a `*.test.ts` file or the config adapter (anything under `apps/partner-ai-service/src/config/`). New tunables go in `sidechat.config.ts` plus `SERVICE_ENV_KEYS`, never as inline reads. This gate runs inside `npm run lint:custom` — see [verification.md](verification.md).
- **Single DB owner.** The service is the only reader of the database URL (`SIDECHAT_DATABASE_URL`); `drizzle.config.ts` and DB tooling deliberately do not re-read it.
- **Development maps `configured` policy to `allow_all`.** The development profile deliberately relaxes the request policy so local runs work without entitlements; production enforces the configured entitlements as declared.
