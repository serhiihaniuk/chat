# Step 03: Configuration and Application Composition

Read this when: turning the retained foundation into a safe production composition root.

Source of truth for: configuration selection/resolution/validation, settings, boot failure behavior, and the production composition boundary.

Not source of truth for: dependency pins, the build substrate, or the compatibility verdict (Step 02), or providers/auth/telemetry (Step 04).

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
    ports/              # inward contracts; no framework imports
    application/        # resolved settings and cross-field policy
    adapters/
      configuration/    # process env and bundled config selection
      inbound/http/     # Hono health/readiness and compatibility routes
      outbound/workflow/ # WorkflowAgent execution and engine repair
    bootstrap/          # production/testing wiring and resource ownership
    index.ts
  sidechat.config.ts
  sidechat.fake.config.ts
  sidechat.azure.config.ts
```

Plain TypeScript only. `process.env` is read once in the env adapter. Constructors/functions receive dependencies explicitly. Two Step 02 facts constrain the composition: the Workflow serialization boundary forbids closures over live services, and the Nitro workflow build compiles routes and workflow steps into separate module instances — module-scope state never crosses that boundary. Services reachable from step code therefore initialize inside the step bundle: expose exactly one documented initialized-once registry owned by production composition; it must reject use before initialization, reset in test disposal, and never be assumed shared with the route bundle.

## Implementation sequence

1. Port by copy and simplify: config-module selection → environment resolution → zod validation with accumulated issues → immutable `Settings`.
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
- missing or invalid `workflow` settings fail boot with accumulated safe issues.

## Verification

```powershell
npm test -- apps/side-chat-service/src/application/configuration
npm test -- apps/side-chat-service/src/adapters/configuration
npm test -- apps/side-chat-service/src/bootstrap
npm run typecheck
npm run build
npm run lint:custom
rg -n "process\.env" apps/side-chat-service/src --glob '!**/adapters/configuration/**' --glob '!**/*.test.ts'
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

Settings blocks and cross-field rules: timeouts, agent, capacity, keepalive, telemetry, and workflow; queue/request, chunk/total, tool/total, keepalive/proxy, worker/headroom, and archive/prune invariants accumulate through Zod.

Composition/resource order: explicit bootstrap compositions start named service parts in order and close partial or completed startup in reverse. Testing close also resets workflow-adapter state. The enforced dependency direction is `bootstrap -> adapters -> application -> ports`.

Workflow configuration and env contract: `WORKFLOW_TARGET_WORLD` remains Step 02 build-time input; `WORKFLOW_POSTGRES_URL` is a secret runtime reference. The workflow registry rejects reads before initialization and documents Nitro module-instance isolation.
