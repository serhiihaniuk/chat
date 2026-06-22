# Human-Readable Service Config Plan

Read this when: planning the migration from scattered service/runtime config
functions and environment variables to one typed, human-readable service config.
Source of truth for: the staged migration plan until the config is implemented.
Not source of truth for: current runtime behavior, accepted ADRs, or provider
adapter internals.

> **Status:** Partially implemented. The typed config exists and is the default
> boot path — `apps/partner-ai-service/sidechat.config.ts` loaded by
> `src/config/sidechat-config.ts`. The early phases (config catalog, options
> adapter, config-driven boot) shipped; later phases (removing the remaining
> environment-variable fallbacks) are still open. For current behavior, read the
> config file and `docs/architecture/`, not this plan.

## Goal

Side Chat should have one readable service config that answers these questions
without searching through composition helpers:

- Which provider-backed models are enabled?
- Which reasoning effort options are available for each enabled model?
- Which model and reasoning effort are the defaults?
- What system instructions and output rules does chat use?
- Which backend tools, host commands, approval policies, executors, safety
  guards, context policies, history mode, request policy, and auxiliary model
  jobs are active?
- For each enabled tool, what model-facing prompt, input contract, runtime
  parameters, approval policy, and default exposure does it use?
- For each enabled host command or turn guard, what declaration, prompt/check
  config, safe parameters, and selection policy does it use?
- Which values are real product behavior versus deployment env, provider API
  keys, endpoints, and other provider-specific connection settings?

The widget still reads backend-published data such as `/models`; it does not
invent available models, reasoning options, tools, jobs, or prompts. The widget
may label reasoning as "Thinking", but service config and code use the canonical
repo term: reasoning effort.

## No Magic String Rule

The readable config must not ask maintainers to hand-type closed product values.
Provider ids, model ids, reasoning effort values, output formats, tool policy
modes, tool names, host-command names, approval policy ids, executor ids, guard
ids, history modes, context policies, request policy modes, safety policy ids,
prompt-injection modes, activity renderer ids, auxiliary-job ids,
auxiliary-job modes, and diagnostic exposure modes should come from imported
const objects.

String literals are allowed only for human-authored text, labels, and new local
ids that the config itself declares. If a value must match code that already
exists elsewhere, import the value instead of retyping it.

## Naming Decision

Use **Turn Profile** for the declared behavior bundle selected before one
assistant turn runs.

A turn profile contains instructions, model policy, tool policy, safety policy,
output contract, and executor choice. It is not the assistant itself, and it is
not the resolved turn policy decision. The policy resolver may use a turn
profile to produce the final per-turn decision.

Avoid **turn policy** as the config name. The repo already uses turn policy for
the validated per-turn decision after manifest/profile/model/tool resolution.
Using the same name for the declaration would blur declaration and resolution.

Keep these terms:

- **Assistant turn**: the lifecycle record for one assistant response.
- **assistant** message role: the conversation role emitted by model output.
- **Side Chat assistant foundation**: product-level wording.

Rename these concepts during the migration:

| Current concept              | Target concept          | Notes                                                                   |
| ---------------------------- | ----------------------- | ----------------------------------------------------------------------- |
| `AssistantProfile`           | `TurnProfile`           | Core manifest/config declaration.                                       |
| `ServiceAssistantProfile`    | `ServiceTurnProfile`    | Service-owned readable declaration.                                     |
| `Assistant profile registry` | `Turn profile registry` | Service composition validator/builder.                                  |
| `assistantProfileId`         | `turnProfileId`         | Browser request/manifest field; public protocol change requiring tests. |
| `defaultAssistantProfileId`  | `defaultTurnProfileId`  | Default profile selected when the browser does not ask for one.         |

Because `sidechat.v1` is a real product contract, protocol field renames must be
intentional and covered by validator, generated-schema, widget, service, and
adoption tests.

## Target Config Shape

The config should be TypeScript, not JSON, so it can import catalog constants,
use multiline strings, and fail typecheck when a model/tool/capability does not
exist.

Example shape:

```ts
import {
  defineSideChatConfig,
  readEnv,
  type SideChatConfig,
  type SideChatConfiguredModel,
  type SideChatDefaultModel,
} from "#config/sidechat-config";
import {
  CONFIG_IDS,
  CONTEXT_ADMISSION_POLICIES,
  HISTORY_CONTEXT_MODES,
  OUTPUT_FORMATS,
  REQUEST_POLICY_MODES,
  SAFETY_POLICIES,
  SERVICE_PROFILES,
  TOOL_DEFAULT_EXPOSURE,
  TOOL_POLICY_MODES,
} from "#config/catalog/config-values";
import { AUXILIARY_JOBS } from "#config/catalog/capabilities/auxiliary-jobs";
import { EXECUTORS } from "#config/catalog/capabilities/executors";
import { TOOLS } from "#config/catalog/capabilities/tools";
import { PROVIDERS } from "#config/catalog/providers";
import {
  DEFAULT_SERVICE_PORT,
  DEFAULT_TENANT_ID,
  DEFAULT_WORKSPACE_ID,
  SERVICE_ENV_KEYS,
} from "#config/service-config";

const sideChatConfig = defineSideChatConfig({
  environment: {
    port: readEnv.number(SERVICE_ENV_KEYS.port, { defaultValue: DEFAULT_SERVICE_PORT }),
    profile: readEnv(SERVICE_ENV_KEYS.profile, { defaultValue: SERVICE_PROFILES.PRODUCTION }),
    authBearerToken: readEnv.secret(SERVICE_ENV_KEYS.authBearerToken),
    databaseUrl: readEnv.secret(SERVICE_ENV_KEYS.databaseUrl),
    demoSeedConversations: readEnv.boolean(SERVICE_ENV_KEYS.demoSeedConversations, {
      defaultValue: false,
    }),
    tenantId: readEnv(SERVICE_ENV_KEYS.tenantId, { defaultValue: DEFAULT_TENANT_ID }),
    workspaceId: readEnv(SERVICE_ENV_KEYS.workspaceId, { defaultValue: DEFAULT_WORKSPACE_ID }),
  },
  models: {
    provider: {
      kind: PROVIDERS.OPENAI.KIND,
      connection: {
        apiKey: readEnv.secret(PROVIDERS.OPENAI.SECRET_ENV_KEYS.API_KEY),
        endpoint: readEnv.optional(PROVIDERS.OPENAI.TRANSPORT_ENV_KEYS.BASE_URL),
      },
    },
    default: {
      model: PROVIDERS.OPENAI.MODELS.GPT_5_4_MINI,
      reasoning: PROVIDERS.OPENAI.MODELS.GPT_5_4_MINI.REASONING.MEDIUM,
    } satisfies SideChatDefaultModel<typeof PROVIDERS.OPENAI.MODELS.GPT_5_4_MINI>,
    availableModels: [
      {
        model: PROVIDERS.OPENAI.MODELS.GPT_5_4_MINI,
        reasoning: {
          default: PROVIDERS.OPENAI.MODELS.GPT_5_4_MINI.REASONING.MEDIUM,
          options: [
            PROVIDERS.OPENAI.MODELS.GPT_5_4_MINI.REASONING.LOW,
            PROVIDERS.OPENAI.MODELS.GPT_5_4_MINI.REASONING.MEDIUM,
            PROVIDERS.OPENAI.MODELS.GPT_5_4_MINI.REASONING.HIGH,
          ],
        },
      } satisfies SideChatConfiguredModel<typeof PROVIDERS.OPENAI.MODELS.GPT_5_4_MINI>,
      {
        model: PROVIDERS.OPENAI.MODELS.GPT_5_5,
        reasoning: {
          default: PROVIDERS.OPENAI.MODELS.GPT_5_5.REASONING.MEDIUM,
          options: [
            PROVIDERS.OPENAI.MODELS.GPT_5_5.REASONING.LOW,
            PROVIDERS.OPENAI.MODELS.GPT_5_5.REASONING.MEDIUM,
            PROVIDERS.OPENAI.MODELS.GPT_5_5.REASONING.HIGH,
          ],
        },
      } satisfies SideChatConfiguredModel<typeof PROVIDERS.OPENAI.MODELS.GPT_5_5>,
    ],
  },
  executors: {
    availableExecutors: [EXECUTORS.AI_SDK_TOOL_LOOP],
    default: EXECUTORS.AI_SDK_TOOL_LOOP,
  },
  tools: {
    availableTools: [
      {
        tool: TOOLS.MOCK_WEB_SEARCH,
        modelPrompt: {
          usageInstructions: TOOLS.MOCK_WEB_SEARCH.MODEL_PROMPT.USAGE_INSTRUCTIONS,
        },
        parameters: {
          delayMs: TOOLS.MOCK_WEB_SEARCH.PARAMETERS.DEFAULT_DELAY_MS,
        },
        exposure: {
          defaultMode: TOOL_DEFAULT_EXPOSURE.ENABLED,
          approvalPolicyIds: TOOLS.MOCK_WEB_SEARCH.EXPOSURE.APPROVAL_POLICY_IDS,
        },
      },
    ],
  },
  hostCommands: {
    availableCommands: [],
    approvalPolicies: [],
    activityRenderers: [],
  },
  turnGuards: {
    availableGuards: [],
  },
  requestPolicy: {
    mode: REQUEST_POLICY_MODES.CONFIGURED,
    modelEntitlements: {
      modelIds: [
        PROVIDERS.OPENAI.MODELS.GPT_5_4_MINI.MODEL_ID,
        PROVIDERS.OPENAI.MODELS.GPT_5_5.MODEL_ID,
      ],
    },
  },
  chat: {
    turnProfile: {
      id: CONFIG_IDS.TURN_PROFILES.DEFAULT,
      executor: EXECUTORS.AI_SDK_TOOL_LOOP,
      systemInstructions: [
        "Render final assistant answers as GitHub-flavored Markdown.",
        "Keep tool payload JSON out of the visible answer unless requested.",
      ],
      output: { format: OUTPUT_FORMATS.MARKDOWN },
      tools: {
        mode: TOOL_POLICY_MODES.PROFILE_ALLOWLIST,
        names: [TOOLS.MOCK_WEB_SEARCH.NAME],
      },
      safety: {
        policyId: SAFETY_POLICIES.STANDARD.ID,
        promptInjectionMode: SAFETY_POLICIES.STANDARD.DEFAULT_PROMPT_INJECTION_MODE,
        turnGuardIds: [],
      },
    },
  },
  context: {
    history: { mode: HISTORY_CONTEXT_MODES.RECENT_MESSAGES, maxMessages: 12, maxTokens: 4_000 },
    contextAdmission: {
      policyId: CONTEXT_ADMISSION_POLICIES.DETERMINISTIC_V1,
      maxInputTokens: 24_000,
      reservedOutputTokens: 4_000,
      maxHistoryTokens: 4_000,
    },
  },
  auxiliaryModelJobs: {
    availableJobs: [
      {
        job: AUXILIARY_JOBS.CONVERSATION_TITLE,
        mode: AUXILIARY_JOBS.CONVERSATION_TITLE.MODES.ENABLED,
        prompt: AUXILIARY_JOBS.CONVERSATION_TITLE.DEFAULT_PROMPT,
      },
    ],
  },
} satisfies SideChatConfig);

export default sideChatConfig;
```

Auxiliary jobs follow the same rule as tools: the readable config references an
imported job descriptor, and the descriptor points to the implemented job
builder. A config key such as `conversationTitle` is not enough because it does
not prove the service actually has that job.

Provider secrets, database URLs, ports, bearer tokens, and deployment-only
endpoints remain environment values, but the env keys are declared inside the
readable config through `readEnv(...)`. Product behavior moves into the config;
actual secret values stay outside source control and diagnostics.

## Phase 1: Rename Assistant Config To Turn Profile

Objective: make the domain language honest before moving more behavior into the
new config.

Scope:

- Rename core capability declarations from assistant profile to turn profile.
- Rename service composition helpers from the former assistant-named config/registry/bundle to
  turn profile config/registry/bundle.
- Rename browser request and manifest fields from `assistantProfileId` to
  `turnProfileId`, with deliberate `sidechat.v1` schema and validator updates.
- Update docs and tests that talk about selectable behavior bundles.
- Do not rename assistant turn lifecycle, assistant message role, or user-facing
  "assistant" product copy.

Acceptance criteria:

- The vocabulary doc defines Turn Profile and removes Assistant Profile as an
  active config term.
- `docs/architecture/assistant-turn.md` uses turn profile for the selected
  config bundle and turn policy for the resolved decision.
- Core policy validation still proves the resolved turn policy matches the
  selected profile.
- Protocol validators reject stale `assistantProfileId` and accept
  `turnProfileId`.
- Widget, client, service, core, and adoption tests use the new request field.
- Health/model diagnostics do not expose stale assistant-profile wording.
- Renamed fields use const-object values wherever the value set is closed.

Suggested verification:

```sh
npm test --workspace @side-chat/chat-protocol
npm test --workspace @side-chat/partner-ai-service
npm test --workspace @side-chat/partner-ai-core
npm run typecheck
npm run lint:custom
```

## Phase 2: Add Provider, Model, Executor, And Config Value Catalog Constants

Objective: stop writing provider, model, reasoning, executor, and capability ids
as loose strings in service config.

Current implementation note: the service now has catalog entrypoints under
`apps/partner-ai-service/src/config/catalog/` for providers/models, executors,
tools, auxiliary jobs, and closed service config values. These catalogs are the
source for current default service wiring, but the single `sidechat.config.ts`
entrypoint is still Phase 3 work. The current service has no built-in host
commands or concrete turn guards, so Phase 2 does not create fake descriptors
for unavailable behavior.

Scope:

- Add provider catalog constants under service config ownership.
- Define provider id, adapter kind, secret requirements, retention policy
  defaults, and per-model metadata in one catalog.
- Put each model's supported reasoning effort options next to that model.
- Keep provider-neutral runtime reasoning values in `ai-runtime-contract`, but
  expose model-specific constants for human config.
- Add executor catalog constants for runtime executors such as the AI SDK tool
  loop executor.
- Add tool, host-command, guard, and auxiliary-job catalog constants for
  service-owned default/dev capabilities.
- Add tool microconfig value constants where a tool has closed parameter modes,
  result modes, prompt section ids, or default-exposure modes.
- Reuse existing core constants such as `HISTORY_CONTEXT_MODES` and
  `CONTEXT_ADMISSION_POLICIES`.
- Add missing const objects beside their owning types before config uses them:
  output formats, tool policy modes, approval modes, host-command exposure
  modes, activity renderer ids, executor ids, guard result modes, request
  policy modes, prompt-injection modes, safety policy ids, auxiliary-job ids,
  auxiliary-job modes, default turn-profile ids, and default prompt section ids.

Acceptance criteria:

- `PROVIDERS.OPENAI.MODELS.<MODEL>` contains id, display name, context window,
  output limit, and supported reasoning efforts.
- `EXECUTORS.<EXECUTOR>` contains the stable executor id and label for each
  registered runtime executor.
- `AUXILIARY_JOBS.<JOB>` contains the stable job id, supported modes, prompt
  sections, and config builder for each implemented auxiliary model job.
- Config examples use imported constants instead of string ids.
- A search of `sidechat.config.ts` finds no hand-typed closed values such as
  `"markdown"`, `"standard"`, `"profile_allowlist"`, `"recent_messages"`, or
  `"deterministic_v1"`.
- Typecheck catches an unavailable model or reasoning effort before runtime.
- Typecheck catches a tool microconfig that references a prompt section,
  parameter mode, approval policy, or exposure mode the tool does not support.
- Typecheck catches a host-command, guard, activity-renderer, approval-policy,
  or auxiliary-job config that references a value not declared in its catalog.
- Typecheck catches unavailable output formats, tool policy modes, history
  modes, context policies, auxiliary-job modes, request policy modes, and safety
  modes before runtime.
- Provider registry still validates enabled models before service routes start.

## Phase 3: Introduce `sidechat.config.ts`

Objective: create the single readable config entrypoint while preserving current
behavior.

Current implementation note: `apps/partner-ai-service/sidechat.config.ts` now
declares one default production OpenAI config object: production env references,
OpenAI API key/endpoint env references, GPT-5.4 mini and GPT-5.5 enablement,
per-model low/medium/high reasoning options, default executor, mock web-search
tool microconfig, default turn profile prompt/output/safety, request policy,
context budgets, and conversation-title auxiliary job. The normal `npm run dev
--workspace @side-chat/partner-ai-service` path boots through `src/server.ts`
and `createPartnerAiServiceOptionsFromConfig(...)`; the legacy env parser
remains available as the fallback when no config module can be loaded and for
existing deployment tests.

Scope:

- Add `apps/partner-ai-service/sidechat.config.ts`.
- Add `defineSideChatConfig(...)` with a narrow, documented type.
- Add `createPartnerAiServiceOptionsFromConfig(config, env)` as the new adapter
  into existing composition options.
- Keep the old env parser during migration, but make the config path the
  default service startup path.
- Move default system instructions, output format, enabled model list, reasoning
  defaults, executor selection, request policy, tool microconfigs, host-command
  declarations, guard microconfigs, auxiliary model job prompts, history mode,
  and context budgets into the config.

Acceptance criteria:

- The default production OpenAI service boots from `sidechat.config.ts` plus the
  required secret/deployment env values.
- Test-only fake configs can still be built from the same typed shape without
  becoming the checked-in default.
- Env-backed service wiring and provider connection values are visible in
  `sidechat.config.ts`, while resolved secrets stay out of diagnostics.
- `/models` output is derived from configured enabled models.
- `/healthz` and `/readyz` expose safe config-derived status.
- Turn profile executor selection is derived from the configured executor
  catalog, not a hand-typed executor id.
- Request policy mode is derived from config, not `SIDECHAT_POLICY_MODE`.
- No widget code imports service config or provider catalogs directly.

## Phase 4: Split Provider Adapter Wiring From Enabled Model Selection

Objective: keep adapter construction provider-owned while model enablement stays
config-owned.

Scope:

- Change provider bundle inputs from loose `modelIds` plus global reasoning
  fields to validated enabled model declarations.
- Keep OpenAI Responses adapter construction inside `agent-runtime`/service
  provider wiring.
- Pass only the enabled models and provider transport secrets into provider
  registration.
- Ensure per-model reasoning policy drives `/models` and runtime reasoning
  selection.

Acceptance criteria:

- A provider can expose multiple models with different reasoning efforts.
- The default model must be one of the enabled model declarations.
- Runtime receives provider/model/reasoning selections that were validated
  against the enabled model declaration.
- Provider-native options stay private to the runtime/provider adapter.

## Phase 5: Move Tool Microconfigs Into Config

Objective: make each tool's configurable behavior readable beside the tool,
without moving executable tool logic into config.

Scope:

- Add a tool microconfig shape for every configured runtime tool.
- Move model-facing tool prompt text, tool descriptions, input-schema selection,
  safe runtime parameters, default exposure, and approval policy ids into
  `sidechat.config.ts`.
- Keep host commands out of this tool section. Host commands get their own
  config section because they run through the browser host bridge, not backend
  `RuntimeTool` execution.
- Keep the executable `RuntimeTool` implementation in
  `apps/partner-ai-service/src/adapters/tools/` or the adopting service adapter.
- Keep tool declaration and executable registration bound through
  `ServiceToolRegistration`, so a configured tool still cannot be declared
  without a matching executable.
- Give each tool an explicit config builder, for example
  `createMockWebSearchRegistration(config.tools.mockWebSearch)`, so tool-specific
  prompt and parameter validation lives close to the tool adapter.
- Publish only secret-safe tool status in diagnostics: names, enabled/default
  exposure, approval ids, and safe parameter summaries. Do not expose raw tool
  prompts if they contain private business instructions.

Acceptance criteria:

- The config has one readable block per enabled tool.
- Each tool block shows the prompt/instructions that teach the model when to
  call the tool.
- Each tool block shows configurable parameters such as timeout, delay,
  result-count, source policy, mutation mode, or approval ids when the tool
  supports them.
- Tool-specific closed values are imported constants, not hand-typed strings.
- Changing a tool prompt or safe parameter does not require editing the runtime
  executable.
- Removing a tool microconfig removes both the manifest declaration and runtime
  executable registration for that service instance.

## Phase 6: Move Host Commands, Guards, Context, And Auxiliary Jobs Into Config

Objective: make every user-visible behavior knob discoverable in one place.

Scope:

- Move host-command declarations, approval policies, and activity-renderer ids
  into `sidechat.config.ts`. Keep host command dispatch in `host-bridge` or the
  adopting host adapter, not in runtime tool adapters.
- Move turn guard microconfigs into `sidechat.config.ts`: guard ids, prompts or
  check text, thresholds, safe parameters, and result modes. The turn profile
  should select guard ids; the guard registry should still provide executable
  guard implementations.
- Move service request policy into `sidechat.config.ts`: entitlement mode,
  model-entitlement source, and production fail-closed behavior. Keep this
  separate from turn-profile safety policy; request policy decides whether a
  selected model/request is allowed, while safety policy decides how an
  assistant turn should behave.
- Move history mode and context admission budgets into `sidechat.config.ts`.
- Move conversation-title prompt/config into an
  `auxiliaryModelJobs.availableJobs` entry using
  `AUXILIARY_JOBS.CONVERSATION_TITLE`.
- Treat future classifiers, routing checks, and security checks as auxiliary
  model jobs with named config blocks instead of hidden route-local agents.
- Move safety policy selection into the turn profile config.
- Define diagnostic exposure as a config surface only for safe ids, modes,
  counts, and budgets. Observability sinks and log destinations stay in service
  adapters/deployment wiring, and must not expose raw prompts, provider output,
  tool payloads, credentials, or private context.
- Keep secrets and concrete enterprise adapter endpoints in env or deployment
  wiring.

Acceptance criteria:

- Current real OpenAI behavior is represented by config plus env secrets.
- Local fake behavior stays test-only or must be declared in a separate explicit
  config file when needed.
- Host commands, approval policies, and activity renderers in the manifest come
  from config and remain separate from backend runtime tools.
- Registered turn guards and selected turn guard ids are validated together, so
  a profile cannot name an unavailable guard.
- Request policy supports production `fail_closed` and configured model
  entitlement without reading `SIDECHAT_POLICY_MODE`.
- Conversation-title generation is represented as an auxiliary model job, not as
  an unrelated special-case prompt, and the job is imported from
  `AUXILIARY_JOBS` like tools are imported from `TOOLS`.
- Disabled/deferred capabilities do not appear as active config.
- Diagnostics remain secret-safe and expose only configured modes, ids, counts,
  and budgets.

## Phase 7: Retire Behavior Env Flags

Objective: remove the confusing second source of product behavior truth.

Scope:

- Remove or deprecate env keys that now duplicate readable config:
  `SIDECHAT_ALLOWED_MODELS`, `SIDECHAT_MODEL_CONTEXT_WINDOWS`,
  `SIDECHAT_OPENAI_REASONING_EFFORT`, `SIDECHAT_OPENAI_REASONING_EFFORTS`,
  `SIDECHAT_OPENAI_REASONING_SUMMARY`, `SIDECHAT_PROVIDER`,
  `SIDECHAT_ENABLE_DEV_TOOLS`, `SIDECHAT_POLICY_MODE`, `SIDECHAT_HISTORY_*`,
  and `SIDECHAT_CONTEXT_*`.
- Keep env for secrets and deployment shape:
  `SIDECHAT_OPENAI_API_KEY`, `SIDECHAT_OPENAI_BASE_URL`,
  `SIDECHAT_DATABASE_URL`, `SIDECHAT_AUTH_BEARER_TOKEN`, `PORT`, workspace
  identity overrides, and production profile.
- Keep `SIDECHAT_PROFILE` only as deployment posture or config-file selection.
  It must not silently toggle enabled models, tools, guards, commands, or
  prompts behind the readable config.
- Production request policy remains explicit in config. If production should
  fail closed, the config says so; if it should use configured entitlements, the
  config names the model-entitlement source.
- Update scripts, docs, tests, and local launchers.

Acceptance criteria:

- There is one behavior source: `sidechat.config.ts`.
- Env parsing is limited to secrets, deployment addresses, auth, profile, and
  process/runtime wiring.
- Removing `SIDECHAT_POLICY_MODE` does not remove production entitlement
  checks; those checks are represented by `requestPolicy`.
- README and launcher docs point to the config first.
- Stale env keys fail with clear errors or are removed from tests/docs.

## Final Verification Gate

Run the narrowest relevant tests during each phase, then finish the full
migration with:

```sh
npm run lint:oxlint
npm run typecheck
npm test
npm run build
npm run lint:custom
npm run verify
```

If repo-wide `verify` is blocked by unrelated drift, report the blocker and
include targeted evidence for every touched package.
