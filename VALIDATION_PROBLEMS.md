# Repository Validation Problems

Date: 2026-05-23

Scope: strict validation of `main` at `5e5e31a` after the current production scaffold snapshot was committed and pushed.

## Verdict

The repo is much closer to the production design than the previous validation. The package rename is now present: `packages/partner-ai-core` and `packages/agent-runtime` exist, old `backend-core` / `assistant-runtime` names no longer appear in non-dist repo sources, Hono auth middleware exists, route files are split, live Postgres validation exists, Docker Compose boots, and the Docker image builds.

The strict result is still not clean. The main issues are now deeper and more important:

- the service does not actually wire `agent-runtime` into `/chat/stream`;
- the current `ToolLoopAgent` is a local facade that still delegates to `streamText`, while the installed AI SDK exports its own `ToolLoopAgent`;
- local `npm run verify` fails by design because the active Node/npm versions do not match the pinned runtime;
- the guardrails still miss skipped-test aliases, unused dependencies, and oversized source files.

## Strict Validation Evidence

Commands run on 2026-05-23:

| Check                                                                                     | Result                       | Evidence                                                                                                                                                               |
| ----------------------------------------------------------------------------------------- | ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `git status --short --branch`                                                             | Clean before report rewrite  | `main...origin/main` after pushing `5e5e31a`.                                                                                                                          |
| old package-name scan                                                                     | Pass                         | No non-dist repo hits for the old `backend-core` / `assistant-runtime` package names.                                                                                  |
| `npm run verify`                                                                          | Fail locally                 | Format, ESLint, typecheck, 24 Vitest files / 85 tests, build all passed; `lint:custom` failed on runtime pins: Node `24.14.0` vs `24.16.0`, npm `11.9.0` vs `11.15.0`. |
| custom governance without runtime pin                                                     | Pass                         | `check-version-pins` through `check-governance-fixtures` passed when run after the pin gate.                                                                           |
| `npm run test:e2e`                                                                        | Pass                         | 1 Playwright widget harness test passed.                                                                                                                               |
| `npm run audit`                                                                           | Pass at configured threshold | 4 moderate `drizzle-kit` / `esbuild` advisories remain.                                                                                                                |
| `docker compose -f infra/local/docker-compose.yml config`                                 | Pass                         | Compose resolves `postgres` and `partner-ai-service`.                                                                                                                  |
| `docker compose -f infra/local/docker-compose.yml build partner-ai-service`               | Pass                         | Image `local-partner-ai-service` built.                                                                                                                                |
| `docker compose -f infra/local/docker-compose.yml up -d --build` + `/healthz` + `/readyz` | Pass                         | Service reached Docker health `healthy`; both endpoints returned `status:"ok"` with Postgres persistence.                                                              |
| `SIDECHAT_TEST_DATABASE_URL=... npm run test:db:integration`                              | Pass after health wait       | First immediate attempt failed with `ECONNRESET`; rerun after Postgres health passed 1 test.                                                                           |
| `git diff --check`                                                                        | Pass                         | No whitespace/conflict-marker problems.                                                                                                                                |

## Resolved Since Previous Validation

- `packages/partner-ai-core` and `packages/agent-runtime` now exist.
- Old `backend-core` / `assistant-runtime` names are gone from non-dist repo sources.
- Governance scripts now reference the new package names.
- Hono auth middleware now exists: `auth-context.ts`, `require-auth.ts`, and `request-id.ts`.
- `partner-ai-core` now receives normalized `AuthContext` in stream input instead of raw authority input.
- Route responsibilities are split under `apps/partner-ai-service/src/inbound/http/routes`.
- `infra/local/docker-compose.yml` now includes Postgres.
- CI includes a Postgres service and a `test:db:integration` step.
- Docker image build and local Compose health/readiness smoke passed in this strict run.
- Build outputs are ignored and not tracked.

## P0 Findings

### P0.1 `agent-runtime` is not wired into the service chat path

`apps/partner-ai-service` declares `@side-chat/agent-runtime` as a dependency, but `/chat/stream` does not import or compose it. The route still creates fake ports directly.

Evidence:

- `apps/partner-ai-service/package.json` depends on `@side-chat/agent-runtime`.
- `rg "@side-chat/agent-runtime" apps/partner-ai-service/src` returns no source imports.
- `apps/partner-ai-service/src/inbound/http/routes/chat-stream.ts` imports `createFakeServicePorts`.
- `chat-stream.ts` calls `createStreamChatUseCase(createFakeServicePorts(...))`.
- `apps/partner-ai-service/src/composition/service-composition.ts` composes auth, policy, persistence, and repositories, but no runtime provider.

Impact:

The production service path never reaches the new runtime boundary. The scaffold can pass with a fake runtime while `agent-runtime` is effectively unused by the deployed app. That breaks the intended product flow:

```text
partner-ai-service -> partner-ai-core -> agent-runtime -> provider adapter
```

Required correction:

Move runtime selection into service composition:

- add runtime config, for example `SIDECHAT_PROVIDER=fake|openai`;
- instantiate `createAgentRuntime(...)` with fake/OpenAI providers;
- pass an `AgentRuntimePort` into `createStreamChatUseCase`;
- keep fake runtime as an explicit development/test provider, not a hardcoded route dependency;
- add a test proving `/chat/stream` uses the composed runtime port.

### P0.2 The current `ToolLoopAgent` is a local facade, not AI SDK `ToolLoopAgent`

The design says AI SDK should be Agent / ToolLoopAgent-first. The installed `ai@6.0.191` package exports `ToolLoopAgent`, but the repo defines its own class with the same name and internally delegates to `streamText`.

Evidence:

- `node -e "import('ai').then(...)"` shows `ToolLoopAgent`, `Experimental_Agent`, and `streamText` are exported by the installed `ai` package.
- `packages/agent-runtime/src/runtime/ai-sdk-tool-loop-agent.ts` imports only `type LanguageModel` from `ai`.
- That file defines `export class ToolLoopAgent` locally.
- The local `ToolLoopAgent.stream(...)` calls `createAiSdkRuntimeEngine().stream(...)`.
- `packages/agent-runtime/src/runtime/ai-sdk-engine.ts` calls `streamText(...)` directly.

Impact:

This looks agent-shaped from the outside, but it does not yet use AI SDK's actual agent/tool-loop runtime. It preserves the exact risk the design was meant to avoid: a custom orchestration facade around `streamText` that may become the real runtime by inertia.

Required correction:

Replace the local shadow class with an adapter around the real AI SDK export:

- import AI SDK `ToolLoopAgent` or `Experimental_Agent` from `ai`;
- build accepted assistant profiles against the SDK agent abstraction;
- map AI SDK agent stream parts into internal runtime events;
- keep direct `streamText` only in explicitly accepted tiny utility flows or private fallback code with an ADR;
- add a governance rule that forbids declaring a local class named `ToolLoopAgent` in `agent-runtime`.

## P1 Findings

### P1.1 `npm run verify` fails under the current local runtime

The new runtime pin check is good and should stay. It correctly fails this local environment:

- expected Node: `24.16.0`;
- actual Node: `24.14.0`;
- expected npm: `11.15.0`;
- actual npm: `11.9.0`.

Impact:

Local validation cannot be called fully green until the active runtime matches the repo contract. CI should pass this pin because `.github/workflows/verify.yml` uses Node `24.16.0` and the Dockerfile installs npm `11.15.0`.

Required correction:

Switch the local shell to Node `24.16.0` and npm `11.15.0`, then rerun `npm run verify`. Keep the pin gate in `lint:custom`.

### P1.2 DB integration has a readiness race in local use

The first strict DB integration attempt failed:

```text
Error: read ECONNRESET
```

That happened immediately after `docker compose up -d postgres`. After waiting for Docker health to become `healthy`, the same command passed.

Impact:

The test itself is useful, and CI service health should reduce the risk. Locally, though, `npm run test:db:integration` fails with a low-level connection reset if the caller does not wait first.

Required correction:

Add one of these:

- a `scripts/wait-for-postgres.mjs` helper used by local DB test scripts;
- a retry/wait loop inside the integration test setup;
- a documented `npm run test:db:local` that starts Compose, waits for health, runs the test, and tears down.

### P1.3 The skipped-test guard can be bypassed by aliasing `describe.skip`

`npm test` reports:

```text
24 passed | 1 skipped (25 files)
85 passed | 1 skipped (86 tests)
```

The skipped test comes from:

```ts
const describeIfDatabase = databaseUrl ? describe : describe.skip;
```

`scripts/check-code-quality.mjs` only catches direct calls like `describe.skip(...)`, so the guardrail passes while Vitest still reports a skipped test.

Impact:

The repo policy says skipped tests are forbidden outside a quarantine path, but the implementation allows a simple alias pattern. That weakens test governance.

Required correction:

Either exclude DB integration tests from default `npm test` and run them only through `npm run test:db:integration`, or add an explicit quarantine mechanism. Also update the guardrail to reject `.skip` references, not only `.skip(...)` calls.

### P1.4 Dependency policy allows unused runtime dependencies

The dependency allowlist is now updated, but it checks whether a dependency is allowed, not whether it is used.

Evidence from source scans:

- `apps/partner-ai-service` declares `@side-chat/agent-runtime`, but app source does not import it.
- `apps/partner-ai-service` declares `effect` and `@effect/platform-node`, but app source does not import them.
- `packages/agent-runtime` declares `@ai-sdk/provider` and `effect`, but current source does not import them.
- `packages/db` declares `effect`, but current source does not import it.

Impact:

This violates the "dependencies must earn their place" rule and can hide missing composition work. In this case, the unused `@side-chat/agent-runtime` dependency is a symptom of the P0 service-runtime wiring gap.

Required correction:

Add a common dependency check such as ESLint `import-x/no-extraneous-dependencies` where it works with workspaces, plus a small custom unused-dependency check for workspace package manifests. Allow temporary unused dependencies only with an explicit ADR/tagged allowlist.

### P1.5 Code-size guardrails are looser than the stated standard

`scripts/check-code-quality.mjs` only fails production source files over 400 lines. A stricter pass found several large files already above 300 lines:

- `packages/db/src/repositories/memory.ts`: 363 lines.
- `packages/partner-ai-core/src/application/stream-chat/stream-chat.ts`: 352 lines.
- `apps/partner-ai-service/src/inbound/http/app.test.ts`: 337 lines.
- `apps/partner-ai-service/src/adapters/persistence/service-persistence.ts`: 327 lines.
- `packages/db/src/drizzle/schema.ts`: 320 lines.

Impact:

The files are not disastrous yet, but they are moving toward the kind of large AI-generated files we wanted to prevent. The current threshold will only catch the problem after the files are already too big.

Required correction:

Lower or tier budgets by file type:

- production source soft warning at 250 lines and hard fail at 300 lines;
- tests soft warning at 350 lines and hard fail at 450 lines;
- generated/schema exceptions must be explicit;
- split `stream-chat.ts`, `memory.ts`, and `service-persistence.ts` before they grow more.

## P2 Findings

### P2.1 Moderate npm audit advisories remain

`npm run audit` passes because the configured threshold is high severity, but npm reports 4 moderate advisories through:

```text
drizzle-kit -> @esbuild-kit/esm-loader -> @esbuild-kit/core-utils -> esbuild
```

The suggested force fix would install `drizzle-kit@0.18.1`, which is a breaking downgrade from the pinned `0.31.10`.

Required correction:

Track the advisory and upgrade through a compatible `drizzle-kit` path when available. Do not force-fix to a lower tool line.

### P2.2 Product magic strings are still duplicated

The design asks for no magic strings for protocol names, route paths, model ids, provider ids, env vars, and policy/error codes. Some constants exist, but stricter scans still show duplicated literals:

- `fake`;
- `fake-echo`;
- `tenant_local`;
- `workspace_local`;
- `Bearer local-test-token`;
- `sidechat.v1` in tests and response helpers.

Impact:

Some duplication is acceptable in tests, but production paths should converge on constants. The service currently defines fake provider/model defaults in route types instead of importing the runtime fake provider constants.

Required correction:

Move product defaults into package-owned constants and import them:

- fake provider/model ids from `agent-runtime`;
- protocol version from `chat-protocol`;
- local workspace/auth defaults from service config constants;
- env var names from a service env constants file.

### P2.3 Real provider smoke remains deferred

OpenAI provider code exists in `packages/agent-runtime`, but the local service smoke uses fake provider mode. `docs/ops/side-chat-production-runbook.md` also says the day-one service defaults to the fake provider until provider-selection rollout work is accepted.

Impact:

This is acceptable if deliberate, but it means the current scaffold has not proven a full service -> core -> runtime -> real provider path.

Required correction:

After P0.1 and P0.2 are fixed, add an opt-in live provider smoke that requires explicit credentials and data-use approval. Keep it outside default CI.

## Suggested Fix Order

1. Wire `agent-runtime` into `partner-ai-service` composition and remove the hardcoded fake runtime from the chat route.
2. Replace the local `ToolLoopAgent` facade with the actual AI SDK Agent/ToolLoopAgent abstraction.
3. Switch local Node/npm to the pinned versions and rerun `npm run verify`.
4. Fix the DB integration readiness race with a local wait/run script or test setup retry.
5. Close the skipped-test alias gap in `check-code-quality.mjs`.
6. Add unused-dependency enforcement and remove decorative Effect/runtime dependencies until actually used.
7. Tighten file-size budgets and split the largest files.
8. Consolidate duplicated product constants.

## Bottom Line

The surface scaffold now matches the naming and folder direction much better. The strict blockers are no longer "wrong folders"; they are "fake path still wired as production path" and "agent runtime still not truly AI SDK Agent/ToolLoopAgent-first." Fix those before treating this as the production implementation baseline.

## Remediation Status

Updated on 2026-05-23 after the follow-up implementation pass.

- P0.1 closed: `partner-ai-service` now composes `agent-runtime` in `service-composition.ts`, passes the runtime port into `/chat/stream`, and has regression tests proving composed runtime provider/model metadata reaches persistence.
- P0.2 closed: `agent-runtime` now wraps AI SDK's exported `ToolLoopAgent`; the local shadow `class ToolLoopAgent` and private `streamText` engine were removed. `check-code-quality.mjs` rejects future local `ToolLoopAgent` class declarations.
- P1.1 closed for the validation path: `npx -p node@24.16.0 -p npm@11.15.0 npm run verify` now passes format, ESLint, typecheck, tests, build, and custom lint with the repo-pinned runtime.
- P1.2 closed: `npm run test:db:local` starts local Compose Postgres, waits for health, then runs the DB integration test with `SIDECHAT_TEST_DATABASE_URL`.
- P1.3 closed: DB integration is excluded from default `npm test` unless its database URL is present, and the skipped-test guard now rejects `.skip` references.
- P1.4 closed with enforcement: `check-unused-dependencies.mjs` runs in `lint:custom`; day-one pinned-but-not-yet-imported strategic dependencies require explicit allowlist rationale.
- P1.5 closed: production source budget is now 300 lines, tests hard-fail above 450 lines, the called-out large production files were split, and the Drizzle schema has an explicit schema exception.
- P2.1 remains an upstream-tracked dependency advisory: `npm audit --audit-level=moderate` still reports the known moderate `drizzle-kit` / `esbuild` chain, `npm view drizzle-kit version` still reports `0.31.10` as the latest compatible published line, and npm only offers a breaking force downgrade to `drizzle-kit@0.18.1`. The default high-severity audit gate remains passable until a compatible upstream fix exists.
- P2.2 closed for production paths touched here: fake provider/model ids come from `agent-runtime`, protocol version comes from `chat-protocol`, and service env/local defaults are centralized in service config.
- P2.3 closed as an opt-in path: `npm run smoke:provider:openai` requires explicit `SIDECHAT_PROVIDER=openai`, credentials, allowed models, and `SIDECHAT_LIVE_PROVIDER_SMOKE=approved`.
