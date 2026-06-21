# partner-ai-service

Read this when: editing the HTTP service, adapters, or composition root.
Source of truth for: this app's ownership, public surface, and local boundaries.
Not source of truth for: global vocabulary or product requirements.

## Owns

- Hono HTTP routes, middleware, and SSE response conversion.
- Auth, config, persistence, policy, provider, and tool adapters.
- Concrete turn guard, host-command, tool, persistence, policy, and
  observability adapter starting points.
- Deployable service composition of core, runtime, DB, and enterprise adapters.
- Local development/test fixtures that are explicitly enabled by config.

## Does Not Own

- Product workflow policy or lifecycle decisions.
- Provider/AI SDK execution details.
- Browser protocol definitions.
- Widget state or rendering.
- A production host app.

## First Files To Open

- `src/inbound/http/app.ts`
- `src/inbound/http/routes/chat/chat-stream.ts`
- `src/composition/service-composition.ts`
- `src/composition/manifest/service-capability-manifest.ts`
- `src/composition/providers/service-provider-registry.ts`
- `src/composition/tools/service-tool-registry.ts`
- `src/composition/turn-profile/turn-profile-registry.ts`
- `src/composition/turn-profile/default-turn-profile-config.ts`
- `src/adapters/README.md`
- `sidechat.config.ts`
- `src/config/sidechat-config.ts`
- `src/config/catalog/index.ts`
- `src/config/service-config.ts`
- `src/config/sidechat-config/conversation-title.ts`

## Capability Diagnostics

`/healthz` and `/readyz` include a safe `capabilities` object owned by service
composition. It reports whether history context, context admission, and
persistence are disabled or configured. The same endpoints report secret-free
`providers` and `tools` registry status: provider ids, model ids, default
selection, model metadata, reasoning policy, and tool names with their
default-enabled and approval policy ids. Provider secrets and tool payloads
stay hidden.

`GET /models` exposes the browser-safe model catalog derived from the provider
registry: provider/model ids, display names, context windows, output limits,
availability, default selection, and selectable reasoning efforts. It never
exposes provider secrets, base URLs, or provider-native request options.

Provider and tool registries are the single source for those surfaces.
`createServiceProviderRegistry` validates provider/model registrations and picks
the runtime identity. `createServiceToolRegistry` turns each
`ServiceToolRegistration` into both a manifest capability and the matching
runtime executable, so a tool cannot be declared without an executable behind
it.

Turn behavior is explicit service config. The default turn profile and any
`turnProfiles` passed to composition build through `createTurnProfileRegistry`,
which validates each `ServiceTurnProfileConfig` against the provider, tool, and
guard registries and uses the system prompt builder to assemble prompt text. The
manifest factory only receives the built profiles; it owns no default prompt.

The chat resource surface includes `GET /chat/conversations` for the current
authorized workspace subject and `GET /chat/history/:conversationId` for
hydrating a selected conversation. Service composition owns the conversation
title prompt/config. Core runs that config through a no-tools runtime basic
agent after the first successful turn, sanitizes the output, and stores the
title once; older records with no stored title still fall back to safe
first-message text while listed. Both routes use repository scoping and never
accept a caller-supplied subject id.

Default local boot is honest about the current app shape:

- prior conversation history is disabled by default; `recent_messages` admits
  authorized same-conversation user/assistant messages before the current user
  message, and reset starts a new history boundary;
- context admission enforces deterministic token budgets before optional
  context reaches runtime;
- in-memory repositories are process-local and not durable.

Context admission diagnostics expose the configured policy id, the actual
selection mode, and a secret-free recorded budget. `policyId:
deterministic_v1` with `selectionMode: budgeted` means the context manager can
drop optional candidates under token pressure and record safe drop reasons in
the manifest.

Persistence diagnostics are derived from the composed repository adapter. A
`SIDECHAT_DATABASE_URL` selects the Postgres/Drizzle repositories; local
in-memory repositories report `persistence: memory` and remain explicitly
non-production-safe because they reset with the process.

Diagnostics never include secrets, connection strings, provider requests, or
private context-board content.

## Capability Configuration

`partner-ai-core` owns the portable capability configuration contract used by
policy and context preparation. The service-readable product behavior now starts
in `sidechat.config.ts`: enabled models, provider reasoning summary, per-model
reasoning options, default executor, tool microconfigs, request policy, turn
profile prompt/output/safety, context budgets, and auxiliary model jobs live
there as imported catalog values plus human-authored prompt text.

`src/config/sidechat-config.ts` owns the typed `defineSideChatConfig(...)`
helper, `readEnv(...)` env-reference helpers, the optional config module loader,
and the adapter that turns the readable config plus secret/process env into
`PartnerAiServiceOptions`. `npm run dev --workspace
@side-chat/partner-ai-service` uses the normal `src/server.ts` boot path and
loads the default export from `sidechat.config.ts`. `SIDECHAT_CONFIG_PATH`
remains an explicit override for loading another config file, and `SIDECHAT_CONFIG`
can select a named export only when that module intentionally exports a
registry. The checked-in project config is one production OpenAI config object,
not a local/openai switchboard. The older `src/config/service-config.ts` env
parser remains during migration as the fallback when no config module can be
loaded and for existing deployment tests.

`src/config/catalog/` is the importable catalog for service-readable config
values. It names provider ids, model ids, per-model reasoning options, model
metadata, executor ids, default tool descriptors, and auxiliary model jobs such
as conversation-title generation. The catalog points at implemented providers,
executors, and tool adapters; it does not register host commands or turn guards
when the service has no built-in implementation for them.

The checked-in production config is explicit and fail closed:

| Config field                                    | Production value                        | Meaning                                                           |
| ----------------------------------------------- | --------------------------------------- | ----------------------------------------------------------------- |
| `environment.profile`                           | `SERVICE_PROFILES.PRODUCTION`           | Deployment posture used by auth, policy, and persistence.         |
| `models.provider.kind`                          | `PROVIDERS.OPENAI.KIND`                 | Runtime provider adapter.                                         |
| `models.provider.reasoning.summary`             | `auto`                                  | Requests provider reasoning summaries for visible activity rows.  |
| `models.availableModels`                        | GPT-5.4 mini and GPT-5.5                | Enabled backend model list published to the widget.               |
| `models.availableModels[].reasoning.options`    | low, medium, high                       | Reasoning efforts the widget may offer for each enabled model.    |
| `tools.availableTools`                          | `TOOLS.MOCK_WEB_SEARCH`                 | Configured backend tool registration.                             |
| `chat.turnProfile.systemInstructions`           | Markdown output instruction fragments   | Prompt text used for the default assistant turn.                  |
| `chat.turnProfile.executor`                     | `EXECUTORS.AI_SDK_TOOL_LOOP`            | Runtime executor id published in the turn profile.                |
| `requestPolicy.mode`                            | `REQUEST_POLICY_MODES.CONFIGURED`       | Requests are checked against configured model entitlements.       |
| `context.history.mode`                          | `HISTORY_CONTEXT_MODES.RECENT_MESSAGES` | Recent same-conversation messages are admitted into context.      |
| `context.history.maxMessages`                   | `12`                                    | Maximum same-conversation messages admitted into runtime context. |
| `context.contextAdmission.maxInputTokens`       | `24000`                                 | Recorded model input budget.                                      |
| `context.contextAdmission.reservedOutputTokens` | `4000`                                  | Reserved output budget; must be below max input tokens.           |
| `context.contextAdmission.maxHistoryTokens`     | `4000`                                  | Recorded per-source history budget.                               |
| `auxiliaryModelJobs.availableJobs`              | conversation title enabled              | Prompt/config for auxiliary model jobs outside the main turn.     |

Env references are visible in `sidechat.config.ts`. The `environment` block
declares process/deployment inputs such as `PORT`, `SIDECHAT_PROFILE`,
`SIDECHAT_AUTH_BEARER_TOKEN`, `SIDECHAT_DATABASE_URL`,
`SIDECHAT_DEMO_SEED_CONVERSATIONS`, `SIDECHAT_TENANT_ID`, and
`SIDECHAT_WORKSPACE_ID`. Provider-specific connection values live beside the
model provider config; the OpenAI config declares `SIDECHAT_OPENAI_API_KEY` and
optional `SIDECHAT_OPENAI_BASE_URL` through
`models.provider.connection`.

Example local path that enables recent conversation history:

```ts
// sidechat.config.ts
context: {
  history: {
    mode: HISTORY_CONTEXT_MODES.RECENT_MESSAGES,
    maxMessages: 12,
    maxTokens: 4_000,
  },
  contextAdmission: {
    policyId: CONTEXT_ADMISSION_POLICIES.DETERMINISTIC_V1,
    maxInputTokens: 24_000,
    reservedOutputTokens: 4_000,
    maxHistoryTokens: 4_000,
  },
}
```

History reports the repository-backed context adapter when `recent_messages` is
enabled. Longer-history summarization is tracked as deferred product work in
`docs/product/todo.md`.

Example OpenAI boot path: provide the env values declared by the default config.

```sh
SIDECHAT_OPENAI_API_KEY=... \
SIDECHAT_AUTH_BEARER_TOKEN=... \
SIDECHAT_DATABASE_URL=... \
npm run dev --workspace @side-chat/partner-ai-service
```

## Verify

- `npm test --workspace @side-chat/partner-ai-service`
- `npm run lint:custom`
- Full gate: `npm run verify`

## Canonical Docs

- `docs/architecture/system-map.md`
- `docs/architecture/assistant-turn.md`
- `docs/architecture/extension-seams.md`
- `docs/architecture/package-boundaries.md`
- `docs/operations/verification.md`
