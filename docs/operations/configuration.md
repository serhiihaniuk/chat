# Configuration

Read this when: you need to change what the service runs — its provider, models, tools, policy, context budgets, or resumability timers.
Source of truth for: the human-readable `SideChatConfig` object, its top-level keys, and how the service loads it.
Not source of truth for: gate commands (see [verification.md](verification.md)), local-run env wiring (see [embed-widget-iframe.md](embed-widget-iframe.md)), or the turn lifecycle these settings tune (see [../architecture/assistant-turn.md](../architecture/assistant-turn.md)).

Side Chat's runnable app, `apps/partner-ai-service`, declares its entire behavior in one typed object: `defineSideChatConfig({...}) satisfies SideChatConfig` in [`apps/partner-ai-service/sidechat.config.ts`](../../apps/partner-ai-service/sidechat.config.ts). The server loads that object at boot and builds its options from it. Process inputs (secrets, port, profile) are declared _inside_ the same object as `readEnv(...)` references, so the config stays the single, readable map of what the service does. Reading `process.env` ad-hoc anywhere else fails a governance gate.

The file's shape is a recorded decision, not an accident: it is one big, deliberately repetitive file per deployment variant, with no loops, factories, or shared fragments — do not "clean it up" ([ADR 0010](../adr/0010-readable-declarative-config.md)).

## The shipped config object

One file, one default export: `defineSideChatConfig({...}) satisfies SideChatConfig` (`sidechat.config.ts:32`, `:227-229`). It is one production OpenAI config, not a local/openai switchboard. A second standalone file, [`sidechat.azure.config.ts`](../../apps/partner-ai-service/sidechat.azure.config.ts), holds the Azure OpenAI variant; the local launcher boots it by pointing `SIDECHAT_CONFIG_PATH` at it.

## Top-level keys

Every key below lives in `sidechat.config.ts` at the cited line. Each owns one slice of behavior:

| Key                  | Owns                                                                                                                                                                                                                                                                                                         | Line   |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------ |
| `environment`        | Deployment shape and secrets via `readEnv`: port, profile, bearer token, database URL, tenant/workspace ids.                                                                                                                                                                                                 | `:33`  |
| `models`             | Provider connection (kind, secret API key, optional endpoint), reasoning summary, the `default` model, and `availableModels` with per-model reasoning options.                                                                                                                                               | `:61`  |
| `executors`          | The executor catalog and default; ships only `AI_SDK_TOOL_LOOP`.                                                                                                                                                                                                                                             | `:105` |
| `tools`              | Backend tools the assistant may call; ships only `mock_web_search` (prompt, delay, exposure, approval ids).                                                                                                                                                                                                  | `:109` |
| `hostCommands`       | App-owned commands the host runs; ships empty (no commands, policies, or renderers yet).                                                                                                                                                                                                                     | `:126` |
| `turnGuards`         | Per-turn safety guards; ships empty.                                                                                                                                                                                                                                                                         | `:131` |
| `requestPolicy`      | Request gating mode (`CONFIGURED`) and the model entitlements a request may select.                                                                                                                                                                                                                          | `:134` |
| `chat.turnProfile`   | The default profile: system instructions, Markdown output, allowlisted tools, and standard safety.                                                                                                                                                                                                           | `:143` |
| `context`            | History window (`recent_messages`, 12 messages / 4k tokens) and `contextAdmission` token budgets.                                                                                                                                                                                                            | `:167` |
| `auxiliaryModelJobs` | Side model jobs; ships the enabled conversation-title job.                                                                                                                                                                                                                                                   | `:180` |
| `resumability`       | Lease and heartbeat timers plus the per-process `instanceId`. Known gap: the `reaperInterval`, `reaperBatchLimit`, `turnEventRetention`, and `prunerInterval` keys still declared here configure nothing since the reaper/pruner removal — reconnection and deletion are tracked in `plan/05` and `plan/10`. | `:189` |

## Declaring process inputs with `readEnv`

The config never reads `process.env` directly. Each process input is a `readEnv` reference carrying a `description` and an optional `defaultValue`, which the boot path resolves to a value. Use the variant that matches the input:

| Reference                    | Use for                                  | Example                                       |
| ---------------------------- | ---------------------------------------- | --------------------------------------------- |
| `readEnv(key, ...)`          | A plain string with a default.           | `environment.profile` (`:38`)                 |
| `readEnv.secret(key, ...)`   | A secret never logged.                   | `environment.databaseUrl` (`:45`)             |
| `readEnv.number(key, ...)`   | A numeric value.                         | `resumability.leaseTtl` (`:200`)              |
| `readEnv.boolean(key, ...)`  | A boolean flag.                          | `environment.demoSeedConversations` (`:48`)   |
| `readEnv.optional(key, ...)` | An optional override, absent by default. | `models.provider.connection.endpoint` (`:68`) |

Env variable names are centralized, not typed inline. They live in `SERVICE_ENV_KEYS` ([`src/config/env/service-env-contract.ts:14-41`](../../apps/partner-ai-service/src/config/env/service-env-contract.ts)), a dependency-free leaf shared by both the config resolver and the legacy parser so they form no import cycle. Add a key there, then reference it from the config.

## How the service loads it

`src/server.ts` builds its boot config from the typed object first, falling back to the legacy parser only if no config module loads:

1. `server.ts:62-71` calls `loadSelectedSideChatConfig()`. On success it builds options via `createPartnerAiServiceOptionsFromConfig(config)`.
2. The loader ([`config-selection.ts`](../../apps/partner-ai-service/src/config/sidechat-config/selection/config-selection.ts)) imports the config module. `SIDECHAT_CONFIG_PATH` overrides the module path; the default is `../../../../sidechat.config.ts` (`:74-79`).
3. `SIDECHAT_CONFIG` selects a named config when the module exports a `SIDECHAT_CONFIGS` registry; otherwise the default export is used (`:60-72`). An unknown name throws.

## Rules and the fallback

- **No ad-hoc `process.env`.** `check-runtime-boundaries.mjs:22-28` fails any production source that reads `process.env` outside a `*.test.ts` file or the config adapter (anything under `apps/partner-ai-service/src/config/`). New tunables go in `sidechat.config.ts` plus `SERVICE_ENV_KEYS`, never as inline reads. This gate runs inside `npm run lint:custom` — see [verification.md](verification.md).
- **Single DB owner.** The service is the only reader of the database URL (`SIDECHAT_DATABASE_URL`); `drizzle.config.ts` and DB tooling deliberately do not re-read it.
- **Legacy parser is a migration fallback only.** When no config module loads, `server.ts:73-78` falls back to the env parser [`src/config/service-config.ts`](../../apps/partner-ai-service/src/config/service-config.ts). That parser handles only the `fake` and `openai` providers and rejects others (`service-config.ts:205-218`). Azure is config-only: configure it through `sidechat.azure.config.ts`, not env flags. This fallback is slated for removal.
