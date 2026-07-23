# Step 03: Configuration and Application Composition

Read this when: turning the retained foundation into a safe production composition root.

Historical source for: configuration selection/resolution/validation, settings, boot failure behavior, and the production composition boundary.

Not authoritative for: dependency pins, the build substrate, or the compatibility verdict (Step 02), or providers/auth/telemetry (Step 04).

Tracking: status and owner are maintained only in [`STATUS.md`](./STATUS.md).

Depends on: Step 02. Unblocks: Step 04.

## Outcome

The retained `apps/side-chat-service` foundation gains the final configuration pipeline and explicit production/test compositions. It boots with accumulated safe validation errors, acquires resources in a readable order, and releases partial acquisitions on failure. The old app remains unchanged.

## Current evidence to verify

- Configuration sources: `apps/partner-ai-service/src/config/sidechat-config/**`, `src/config/env/service-env-contract.ts`, `src/config/service-config-error.ts`, and the root config variants.
- Repository dependency/version policy and the pins already established by Step 02.
- Step 02's substrate handoff (WorkflowAgent + Nitro + realm patch), its engine findings, and lifecycle ownership.

## Target layout

```text
apps/side-chat-service/
  src/
    application/ports/  # earned behavioral interfaces only
    adapters/http/      # Hono health/readiness and compatibility routes
    config/             # cohesive config DSL, env resolution, validation
    composition/        # route and workflow-bundle wiring; resources
    workflows/          # registry/engine repair plus production/testing scan roots
    testing/            # scripted models and doubles
    index.ts
  sidechat.config.ts
  sidechat.fake.config.ts
  sidechat.azure.config.ts
```

Plain TypeScript only. The three app-root `sidechat*.config.ts` declarations are inputs owned by the config catalog; every other config import stays inside `src/config`. `process.env` is read once in the env adapter. Constructors/functions receive dependencies explicitly. Two Step 02 facts constrain composition: route and workflow module state is not shared, and Nitro scans configured workflow directories independently from route reachability. Each physical workflow bundle therefore uses its matching composition initializer and the one typed initialized-once registry. Production and testing scan roots are disjoint.

## Implementation sequence

1. Port by copy and simplify: config-module selection → environment resolution → dependency-free validation with accumulated issues → immutable `Settings`.
2. Add required blocks: `timeouts`, `agent`, `capacity`, `keepalive`, `telemetry`, and `workflow` (worker, journal archive/prune knobs, `WORKFLOW_POSTGRES_URL` via the env adapter). Note the build-time part of the env contract: `WORKFLOW_TARGET_WORLD` selects the world at `nitro build` and is not a runtime setting.
3. Add cross-field validation: chunk/tool budgets below total budget, queue timeout below request budget, positive keepalive below the documented proxy idle budget, and Workflow worker concurrency above configured active generation plus headroom.
4. Build explicit production and testing compositions. Production cannot import scripted providers; tests cannot reach credentials or persistent infrastructure.
5. Boot in named stages. A failure prints every safe issue, no secret value, opens no port, and disposes already-acquired resources in reverse order.
6. Preserve Step 02's foundation tests and add configuration/composition contract tests rather than replacing them.

## Contract tests

- fake config boots and serves health/readiness;
- two or more invalid fields are reported together;
- secret sentinel never appears in errors/logs;
- `process.env` is unreachable outside the env adapter;
- partial acquisition failure closes worker/pool/listeners and never opens the port;
- production composition cannot resolve scripted/test dependencies;
- the compiled production artifact contains no scripted-provider or compatibility marker;
- missing or invalid `workflow` settings fail boot with accumulated safe issues.

## Verification

```powershell
npm test -- apps/side-chat-service/src/config
npm test -- apps/side-chat-service/src/composition
npm test -- apps/side-chat-service/src/workflows
npm run typecheck
npm run build
npm run build:testing --workspace @side-chat/side-chat-service
npm run lint:custom
rg -n "process\.env" apps/side-chat-service/src --glob '!**/config/**' --glob '!**/*.test.ts'
```

The search must return zero.

## Completion checklist

- [x] Settings pipeline and cross-field validation complete.
- [x] Production/test compositions are isolated and readable.
- [x] Boot failure is safe and resource-complete.
- [x] Step 02 permanent compatibility suite still passes.
- [x] Zero old-app imports; old app remains green.

## Handoff record

Configuration modules ported: readable default, fake, and Azure declarations; build-bundled selection through `SIDECHAT_CONFIG`; env references resolve only during boot.

Settings blocks and cross-field rules: timeouts, agent, capacity, keepalive, telemetry, and workflow; queue/request, chunk/total, tool/total, keepalive/proxy, worker/headroom, and archive/prune invariants accumulate in the dependency-free config boundary.

Composition/resource order: explicit route-bundle compositions start named service parts in order and close partial or completed startup in reverse. Matching production/testing workflow composition functions initialize the typed registry in their own bundle; only testing can reset it.

Artifact isolation: the normal Nitro config scans the empty Step 03 `workflows/production` root. The compatibility builder overrides both the route entry and scan root to `workflows/testing`. The permanent suite rebuilds production afterward and rejects any scripted-provider or compatibility marker in `.output`.

Workflow configuration and env contract: `WORKFLOW_TARGET_WORLD` remains Step 02 build-time input; `WORKFLOW_POSTGRES_URL` is a secret runtime reference. The registry stores an application-owned model-provider port, rejects reads before initialization, and never implies route/workflow module-state sharing.
