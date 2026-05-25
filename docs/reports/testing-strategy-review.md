# Side Chat Test And Testing Strategy Review

Date: 2026-05-25

## Scope

This review used `.agents/skills/side-chat-testing-architecture/SKILL.md` and
its reference docs as the rubric. The audit covered the repository docs,
architecture notes, ADRs, testing plan, package configs, Vitest suites,
Playwright harness suite, opt-in Postgres integration test, and governance test
fixtures.

Docs read:

- `README.md`, `AGENTS.md`
- `docs/CONTEXT.md`
- all files under `docs/architecture/`, `docs/adr/`, `docs/testing/`,
  `docs/ops/`, `docs/reports/`
- `infra/production/README.md`
- testing skill references:
  `repo-context.md`, `package-testing-matrix.md`,
  `testing-principles.md`, `examples.md`, `validation-prompts.md`

## Executive Verdict

The test suite is directionally strong for a young modular monolith. The best
coverage protects the key contracts: `sidechat.v1` validation and SSE framing,
stream sequence invariants, chat-client stream decoding, core auth/policy
ordering, service route behavior, deterministic runtime/provider behavior,
memory persistence, and the browser harness happy path.

The biggest risks are not "missing tests everywhere"; they are sharper:

1. The DB local test command is not portable on Windows.
2. The OpenAI Responses adapter test can pass while text deltas are not emitted
   as `runtime.output_delta`.
3. Widget behavior is under-tested at the component/integration level; most UI
   confidence is either static HTML or Playwright.
4. The documented E2E plan lists several scenarios that are not yet present.
5. The memory and Postgres repositories do not share a reusable repository
   contract suite, so the fake can drift from the real adapter.
6. Public API/type-level contract tests are documented but absent.

## Verification Baseline

Commands run from `C:\Users\Serge\Desktop\Projects\chat`:

| Command                                           | Result               | Notes                                                                                                                                                                          |
| ------------------------------------------------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `npm test`                                        | Pass                 | 30 Vitest files, 118 tests. Excludes DB integration by design.                                                                                                                 |
| `npm run test:e2e`                                | Pass                 | 4 Playwright tests against widget harness and service with fake provider/memory DB.                                                                                            |
| `npm run test:db:local`                           | Fail                 | Windows shell cannot parse POSIX inline env assignment in `package.json`.                                                                                                      |
| PowerShell equivalent DB integration              | Pass                 | `$env:SIDECHAT_TEST_DATABASE_URL=...; npm run test:db:integration` passes 1 file/1 test.                                                                                       |
| `npm run verify`                                  | Fail early           | `oxfmt --check` reports formatting issues in untracked `.agents/...` skill docs.                                                                                               |
| `npm run lint:oxlint`                             | Pass                 | Oxlint passes.                                                                                                                                                                 |
| `npm run typecheck`                               | Pass                 | TypeScript check passes.                                                                                                                                                       |
| `npm run build`                                   | Pass                 | Project build passes.                                                                                                                                                          |
| `npm run lint:custom`                             | Fail at runtime pins | Current shell is Node `24.15.0` / npm `11.12.1`; repo pins `24.16.0` / `11.15.0`.                                                                                              |
| Custom governance scripts after runtime-pin check | Pass                 | Version pins, dependency policy, exports, boundaries, widget layers, runtime boundaries, outbound rules, source governance, generated artifacts, and governance fixtures pass. |

## Test Inventory

| Area                          | Files | Primary behavior protected                                                                 |
| ----------------------------- | ----: | ------------------------------------------------------------------------------------------ |
| `apps/partner-ai-service`     |     3 | config, HTTP route behavior, auth/policy failures, persistence snapshots, activity mapping |
| `packages/chat-protocol`      |     5 | request validation, event validation, SSE codec, stream sequence, fixtures                 |
| `packages/chat-client`        |     2 | stream transport, SSE decoding, aborts, retries, history/usage routes                      |
| `packages/host-bridge`        |     1 | host context, command support, local command result semantics                              |
| `packages/partner-ai-core`    |     4 | authority, stream use case, Effect layer wiring, observability redaction                   |
| `packages/agent-runtime`      |     6 | fake provider, provider registry, tool registry, runtime tool exposure, OpenAI adapter     |
| `packages/db`                 |     4 | schema contract, migration shape, memory repos, opt-in Postgres smoke                      |
| `packages/side-chat-widget`   |     5 | activity model, static message rendering, panel sizing, static a11y smoke                  |
| `test-harness/widget-harness` |     2 | harness modes, auth-wrapped fetch, browser E2E                                             |

## Prioritized Findings

### P0: `test:db:local` is broken on Windows

`package.json:21` uses POSIX inline environment syntax:

```sh
SIDECHAT_TEST_DATABASE_URL=postgres://... npm run test:db:integration
```

That fails in this Windows workspace with:

```text
'SIDECHAT_TEST_DATABASE_URL' is not recognized as an internal or external command
```

The underlying Postgres test passes when the environment variable is set with
PowerShell syntax. This is a command portability bug, not a repository adapter
failure.

Plan:

- Replace the inline env assignment with the Testcontainers-backed
  `test:db:container` lane.
- Add `scripts/run-db-container-tests.mjs` as the cross-platform Node
  orchestration script for Postgres startup, migration, repository contract
  execution, and teardown.
- Keep the direct `test:db:integration` command for already-provisioned DBs.

### P0: OpenAI adapter test can pass without streamed text output

`packages/agent-runtime/src/openai/openai-responses-provider.test.ts:9` says it
maps OpenAI Responses text events into runtime events, and lines 20 and 24 feed
`response.output_text.delta` events. But line 53 asserts only:

```ts
["runtime.started", "runtime.completed"];
```

The runtime mapper supports `runtime.output_delta` at
`packages/agent-runtime/src/runtime/ai-sdk-tool-loop-agent.ts:110`, but this
adapter test does not require text output to cross the runtime boundary. A
regression that drops assistant text could stay green.

Plan:

- Add an adapter/runtime test that proves OpenAI streamed text produces
  `runtime.output_delta` before `runtime.completed`.
- Add a matching service/core integration assertion that OpenAI-style runtime
  deltas become `sidechat.delta` and widget-visible assistant text.
- Add error-path tests for malformed provider stream parts and provider stream
  errors after `runtime.started`.

### P1: E2E coverage is narrower than the documented E2E plan

`docs/testing/widget-service-e2e.md:58-66` says the E2E lane should also cover:

- conversation id continuity and `/chat/history`
- reset/new-chat behavior
- host command dispatch and failed host command rendering
- model picker selecting multiple allowed mocked profiles
- context selection changing host context sent to the backend
- mobile viewport smoke
- visual regression checks for clipped/overlapping controls

The current Playwright file has four tests at
`test-harness/widget-harness/e2e/widget-harness.spec.ts:28`, `:41`, `:64`, and
`:94`. They are valuable, but they do not yet cover several required flows.

Plan:

- Add one Playwright test for conversation continuity: send, assert history,
  reset/new chat, assert old messages are gone or reset route was called.
- Add one failed-host-command scenario in mock-stream mode.
- Add one model/context scenario that proves the selected model/context changes
  the outgoing request.
- Add a mobile viewport smoke with an overlap/clipping check, even if it is
  geometric rather than screenshot-based at first.
- Add the persistent E2E lane: real widget, real service, fake provider, and
  Postgres from Testcontainers. Keep the current memory-backed E2E lane for
  fast browser confidence.

### P1: Widget behavior lacks component-level interaction tests

The widget tests mostly use `renderToStaticMarkup`:

- `widget-conversation.test.tsx:1`
- `widget-message-view.test.tsx:2`
- `widget-frame.test.tsx:1`

Those tests are good static smoke tests, but they cannot prove submit behavior,
disabled states, streaming updates, host command dispatch, stop/abort, or error
dismissal from a user's point of view. The main interaction path lives in
`useWidgetChat` and `SideChatWidget`:

- `use-widget-chat.ts:151` `submitMessage`
- `use-widget-chat.ts:182` `client.streamChat`
- `use-widget-chat.ts:69` `dispatchCommand`
- `side-chat-widget.tsx:31` `SideChatWidget`

The testing skill and repo context name Testing Library + user-event as the
intended component testing tool, but the repo currently has no
`@testing-library/*` dependencies.

Plan:

- Add widget component interaction tests through a small repo-owned React DOM
  test helper first. Do not assume jest-dom or Testing Library matchers.
- If Testing Library and user-event become an explicit accepted dependency
  decision later, pin them exactly and keep assertions compatible with the repo's
  matcher setup.
- Add component tests for:
  - submit sends a protocol request through a fake `ChatClient`
  - streaming deltas render into the assistant message
  - rejected client promise shows the error state and dismiss works
  - host command activity calls fake `HostBridge.dispatchCommand`
  - stop aborts the active request and clears streaming state
- Keep Playwright for browser/harness confidence, not for every widget state.

### P1: Memory and Postgres repositories need a shared contract suite

`packages/db/src/repositories/memory.test.ts` covers a broad set of repository
behaviors, including idempotency, cross-subject denial, reset, context, usage,
tool, host command, and audit records.

`packages/db/src/repositories/postgres-drizzle.integration.test.ts:14` calls
itself a repository contract, but currently exercises only migrations,
conversation idempotency, message append, and history read (`:21`, `:39`,
`:49`).

This creates fake drift risk: service/core tests can be green against memory
repositories while Postgres behavior differs for usage, assistant turns,
tool invocations, host command rows, audit records, reset, and tenancy checks.

Plan:

- Extract a reusable `sidechatRepositoryContract(createRepositories)` function.
- Run it against memory in the fast lane.
- Run the same contract against Postgres in the Testcontainers DB lane.
- Keep any Postgres-only migration/grant assertions in `packages/db`.

### P1: Testcontainers is the Postgres-backed test platform

The current DB integration strategy depends on Docker Compose plus shell-level
environment setup. That is enough to prove the adapter, but the command wrapper
is not cross-platform and the test lifecycle is split between npm scripts,
Compose, and Vitest.

Final strategy:

- DB integration tests will start a pinned Postgres image from Vitest, apply
  migrations, run the repository contract, and tear down the container.
- Persistent E2E tests will start Postgres the same way, then launch the real
  `partner-ai-service` with `SIDECHAT_DATABASE_URL` pointing at the container.
- Windows, Linux, and macOS will use the same Node orchestration path instead of
  POSIX-only inline env syntax.
- The default fast lane remains Docker-free.

Implementation plan:

- Add exact-pinned Testcontainers dependencies in the implementation PR.
- Replace `test:db:local` with `test:db:container`.
- Add `scripts/run-db-container-tests.mjs` to start Postgres, apply migrations,
  run the shared repository contract, and stop the container.
- Add `test:e2e:persistent`.
- Add `scripts/run-persistent-e2e.mjs` to start Postgres, launch
  `partner-ai-service`, launch the widget harness, run the persistent Playwright
  specs, and clean up all processes/containers.
- Keep `npm test` and the current `npm run test:e2e` Docker-DB-free.

### P1: Public API/type contract tests are documented but absent

The production design asks for type tests and declaration checks for public
contracts (`docs/architecture/production-system-design.md:2005-2020`,
`:2971`, `:3379`). There are no `*.type.test.ts` files in the repo.

Risk:

- Public package APIs can accidentally expose forbidden types while runtime
  tests stay green.
- Exhaustive unions can degrade without a compile-time negative test.
- Browser-facing packages can accidentally require Effect/provider/framework
  details at the type boundary.

Plan:

- Add `*.type.test.ts` or another accepted type-test lane for:
  - `chat-protocol` event discriminated unions
  - `side-chat-widget` public props
  - `chat-client` public API
  - `host-bridge` command/context shapes
  - runtime/provider registry public types
- Keep `@ts-expect-error` usage only in type tests with a reason.

### P2: Chat-client route helpers need negative and schema-ish tests

`packages/chat-client/src/client.test.ts` covers happy paths for
`readHistory`, `resetHistory`, and `readUsage`, but not HTTP failures,
malformed JSON, or unexpected response shapes for these routes.

Plan:

- Add tests for non-OK responses from `/chat/history`, `DELETE /chat/history`,
  and `/usage`.
- Add tests for malformed JSON or missing required fields, even if the current
  client only performs lightweight validation.
- Keep these as client transport tests with fake fetch, not service tests.

### P2: Protocol tests are good but should add compatibility and generated-artifact checks

Current protocol tests cover request validation, nested activity details,
provider/AI SDK leakage rejection, SSE event-name mismatch, monotonic terminal
streams, and golden fixtures. This is one of the stronger areas.

Additions worth making:

- Schema compatibility tests for generated JSON Schema/OpenAPI artifacts when
  event shapes change.
- Explicit negative tests for DB row-ish and Hono-ish shapes if those have
  recognizable fields.
- Golden fixture for activity timeline with tool running/completed and host
  command rows, not only generic success/error/malformed streams.

### P2: Harness mock-stream tool behavior is keyword-triggered

`test-harness/widget-harness/src/mock-stream-client.ts:146` uses a text
heuristic to decide whether mock-stream emits tool activity. It is acceptable
inside a deterministic harness, but tests become coupled to magic words like
`search`, `web`, and `lookup`.

Plan:

- Prefer explicit scenario query params or named fixtures for mock-stream tool,
  host-command, error, empty, and slow-stream states.
- Keep text heuristics out of service/runtime/product tests.

## Package Review

### `packages/chat-protocol`

Strengths:

- Strong ownership of `sidechat.v1` validation and SSE framing.
- Good negative coverage for provider-native and AI SDK UI message leakage.
- Sequence tests protect one terminal event and no events after terminal.

Gaps:

- Generated schema/OpenAPI compatibility is enforced by governance, but not
  deeply exercised as behavior tests.
- Fixture coverage should grow around canonical `sidechat.activity` tool and
  host-command streams.

### `packages/chat-client`

Strengths:

- Stream decoding handles split frames, terminal error events, malformed partial
  frames, missing terminal events, and events after terminal.
- Client tests use fake fetch and do not touch real network.
- Abort and retry behavior are covered at the browser-safe transport seam.

Gaps:

- Route helpers for history/reset/usage need failure and malformed-response
  tests.
- Consider testing content-type mismatch and empty stream body explicitly.

### `packages/host-bridge`

Strengths:

- Good contract coverage for command support by name/resource, local command
  results, protocol-safe host context, and public bridge dispatch.

Gaps:

- Add malformed host-command activity tests and missing host data tests.
- Add type-level tests for command/context public APIs.

### `packages/partner-ai-core`

Strengths:

- Use-case tests are at the correct seam: fake ports, no Hono/DB/provider SDK.
- Good coverage of auth-before-work, policy-before-persistence/model, runtime
  error mapping, sequence compaction, and observability redaction.

Gaps:

- Add tests for persistence failures after user message append/start turn
  boundaries if those become typed product errors.
- Add direct tests for `runtime-event-mapper` edge cases: tool_failed,
  provider_unavailable fallback, unknown runtime errors, malformed runtime
  sequence with no terminal event.

### `packages/agent-runtime`

Strengths:

- Fake provider determinism, registry rejection, tool registry rejection, and
  no pre-model tool execution are covered.
- Tool-call/tool-result mapping to a stable activity row is covered.

Gaps:

- OpenAI streaming text delta coverage is weak and may be misleading.
- Add tests for tool errors, reasoning deltas, cancellation/abort, malformed AI
  SDK parts, and source extraction failure.

### `apps/partner-ai-service`

Strengths:

- Route tests assert HTTP/protocol behavior through `app.request`, not Hono
  internals.
- Production fail-closed auth, policy, fake provider/dev tool rejection,
  malformed protocol requests, trace propagation, and persistence idempotency
  are covered.

Gaps:

- Add invalid JSON body and content-type tests.
- Add persistence failure mapping tests for `onComplete`/stream persistence.
- Add route tests for history/usage auth failures and reset behavior.

### `packages/db`

Strengths:

- Schema contract and migration shape are tested.
- Memory repository coverage is broad.
- Postgres integration lane exists and passes when invoked with a Windows-safe
  env setup.

Gaps:

- Missing shared repository contract across memory and Postgres.
- Postgres test is too narrow for the repository surface.
- `test:db:local` command is broken on Windows.

### `packages/side-chat-widget`

Strengths:

- Activity projection tests are valuable and protect protocol-order semantics.
- Static render tests verify activity/tool rendering and basic accessible
  labels without relying on jest-dom.
- Playwright covers real browser smoke for core happy paths.

Gaps:

- Missing component interaction tests for the public `SideChatWidget` and
  `useWidgetChat` behavior.
- Missing direct tests for prompt footer, model selection, context control,
  quick actions, stop button, and abort/error state transitions.
- Static HTML tests cannot detect many real browser interaction regressions.

### `test-harness/widget-harness`

Strengths:

- Playwright uses semantic locators and has no arbitrary sleeps.
- Console/page errors are collected and fail tests.
- The local-service E2E path uses the real widget, chat-client, Hono service,
  partner-ai-core, agent-runtime, fake provider, and memory repositories.

Gaps:

- E2E scenarios lag behind the documented plan.
- Need explicit error, reset, mobile, model/context mutation, failed host
  command, and history continuity scenarios.

### `packages/testing`

Strengths:

- Useful builders exist for basic stream/request fixtures.

Gaps:

- The package is underused compared with the duplication of request/event
  builders across tests.
- It should grow carefully into protocol builders, repository contract helpers,
  fake chat client/transport helpers, and harness scenario fixtures. Avoid a
  giant opaque fixture object.

## Final Testing Strategy

### Test Portfolio

The final portfolio has six explicit lanes. Developers keep host-local commands
for fast feedback. CI and release verification run the full suite from one
controlled dev/test container so the accepted result matches the
production-like app environment.

1. Fast deterministic lane: `npm test`
   - Unit, contract, component/static, service route tests.
   - No real network, no real Postgres, no browser.
   - Must stay fast enough to run constantly.

2. Browser harness lane: `npm run test:e2e`
   - Minimal but critical Playwright flows.
   - Real widget and real service process.
   - Fake provider and memory DB.
   - No arbitrary sleeps; keep semantic locators.

3. DB contract lane: `npm run test:db:container`
   - Shared repository contract against Postgres.
   - Postgres started by Testcontainers with a pinned image.
   - Opt-in for local development and CI jobs with Docker.
   - Replaces the current shell-fragile `test:db:local` command.

4. Persistent browser E2E lane: `npm run test:e2e:persistent`
   - Real Playwright browser, real widget harness, real `partner-ai-service`.
   - Fake provider for deterministic model behavior.
   - Postgres started by Testcontainers for real persistence behavior.
   - Explicit opt-in/release lane, not part of ordinary `npm test`.
   - Small suite focused on persistence-sensitive flows observable through
     public seams: send message, history continuity, reset/new chat, usage, and
     service restart/history recovery.
   - DB row-level assertions for tool invocations, audit records, and schema
     details stay in `packages/db` repository contract tests.

5. Full gate: `npm run verify`
   - Format, lint, typecheck, fast tests, build, governance.
   - Must be run under pinned Node/npm.
   - Should not be blocked by local-only untracked skill material.

6. Container parity gate: `npm run verify:container`
   - Runs the accepted verification suite inside one production-like dev/test
     app container.
   - Uses the exact pinned Node/npm, Linux filesystem semantics, package
     manager behavior, and native dependency environment expected by the
     deployed service image.
   - Runs `npm run verify`, `npm run test:db:container`, and
     `npm run test:e2e:persistent`.
   - Testcontainers starts external dependencies, such as Postgres, as isolated
     ephemeral containers from inside that app test container.
   - This is the CI/release truth. Host-local passes are useful signal, but the
     container parity gate is the environment-parity gate.

### What Each Package Should Own

| Package              | Primary test level       | Highest-value next tests                                                          |
| -------------------- | ------------------------ | --------------------------------------------------------------------------------- |
| `chat-protocol`      | unit/contract            | activity golden fixtures, generated schema compatibility, DB/Hono shape rejection |
| `chat-client`        | unit/transport contract  | route helper errors, malformed JSON, content-type/empty-body handling             |
| `host-bridge`        | contract                 | malformed command/context, type-level public API tests                            |
| `partner-ai-core`    | use-case/port contract   | runtime mapper edge cases, persistence failure mapping                            |
| `agent-runtime`      | runtime/adapter contract | OpenAI text deltas, reasoning deltas, tool errors, cancellation                   |
| `partner-ai-service` | service/route            | invalid JSON, persistence failure, history/reset/usage auth                       |
| `db`                 | repository contract      | Testcontainers-backed shared memory/Postgres contract across all commands         |
| `side-chat-widget`   | component + model + E2E  | public widget interaction tests with fake client/host bridge                      |
| `widget-harness`     | Playwright E2E           | documented reset/history/model/context/mobile/error plus persistent E2E scenarios |
| `testing`            | test utilities           | builders, fake clients, repository contracts, protocol fixtures                   |

### Container Strategy

The final strategy has both local commands and one controlled app test
container:

- Local commands (`npm test`, `npm run test:e2e`, and targeted package commands)
  stay available for fast development.
- `verify:container` runs the full accepted suite from one dev/test container
  that matches the app runtime environment.
- Testcontainers owns ephemeral dependencies such as Postgres. From inside the
  app test container, Testcontainers can start sibling dependency containers via
  the Docker socket or the CI container runtime.
- The app test runner, service process, widget harness, Playwright runtime, and
  package manager all run in the same controlled app container.
- Container image pulls are environment setup, not test behavior. CI should
  pre-pull or cache exact-pinned images where possible. Tests must not call real
  model providers or external product networks by default.

Use containers this way:

- `verify:container` is the authoritative CI/release gate.
- The service process in persistent E2E runs in the same dev/test app container
  shape used for verification, with fake provider and Testcontainers Postgres.
- Testcontainers provides isolated Postgres for DB and persistent E2E tests.
- The current host-local `npm test` and `npm run test:e2e` lanes stay because
  they are much faster and catch workstation/browser/path issues that a Linux
  container can hide.

Do not put every developer keystroke behind Docker. Do require `verify:container`
to pass before accepting the branch.

### Immediate Fix Checklist

- Replace `test:db:local` with cross-platform `test:db:container` backed by
  Testcontainers.
- Add `test:e2e:persistent` backed by Testcontainers Postgres.
- Add `verify:container` as the CI/release environment-parity gate that runs the
  full suite inside the dev/test app container.
- Make the OpenAI adapter test require `runtime.output_delta` for streamed text.
- Resolve `.agents/` before using `npm run verify` as a gate: either track and
  format it as repo content, or keep local-only skill material outside the repo
  formatting scope.
- Use the pinned Node/npm runtime when claiming `npm run verify`.

### Near-Term Test Additions

- Extract shared DB repository contract and run it against memory + Postgres.
- Add Testcontainers orchestration for the DB contract lane.
- Add a small persistent E2E suite with Testcontainers Postgres, fake provider,
  real service, and real widget harness.
- Add a production-like dev/test image and a `verify:container` script that runs
  the accepted verification commands inside that image.
- Add `SideChatWidget` component interaction tests with fake chat client and
  fake host bridge through repo-owned test helpers.
- Add Playwright scenarios for history continuity, reset/new chat, failed host
  command, model/context mutation, mobile viewport, and error state.
- Add public API/type tests for protocol, client, widget, host bridge, and
  runtime registry contracts.
- Expand `packages/testing` with small, named builders instead of ad hoc
  duplicated fixtures.

### Ongoing Rules

- Keep provider-native events inside `packages/agent-runtime` adapter tests.
- Keep DB rows inside `packages/db` tests.
- Keep Hono-specific concerns inside service route tests.
- Keep widget tests user-visible and avoid hook-call assertions.
- Do not use real network in ordinary tests.
- Do not use real Postgres outside opt-in DB and persistent-E2E lanes.
- Do not assert raw DB rows outside `packages/db` tests; persistent E2E asserts
  persistence through public service/widget behavior.
- Do not add broad snapshots for widget trees or protocol behavior.
- Do not introduce jest-dom assumptions unless the repo deliberately adds and
  configures it.

## Skill Compliance Check

Checked against `.agents/skills/side-chat-testing-architecture/SKILL.md`:

| Skill rule                                              | Strategy alignment                                                                                                       |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Choose the smallest honest test level                   | Fast unit/contract/component/service lanes stay first; persistent E2E is small and reserved for cross-package behavior.  |
| Prefer existing doubles                                 | Fast and normal E2E lanes use fake providers, memory repositories, fake host bridge, fake chat client, and fixtures.     |
| No real Postgres in ordinary tests                      | `npm test` and memory-backed `test:e2e` stay Postgres-free; Postgres appears only in explicit container DB/E2E lanes.    |
| No real network in ordinary tests                       | Ordinary tests use fake fetch/transport/providers. Container image pulls are setup only, not product test behavior.      |
| No provider-native leaks through `sidechat.v1`          | Provider-native assertions stay in `agent-runtime`; protocol/client/widget assert normalized runtime/protocol events.    |
| No DB row leakage outside `packages/db`                 | Repository contracts own DB/schema assertions; persistent E2E asserts public behavior, not rows.                         |
| No Hono objects outside service route tests             | Service tests use `app.request` and HTTP/protocol results; core/widget/client tests stay framework-free.                 |
| Widget tests from the user's point of view              | Component tests target visible submit/streaming/error/host-command behavior, not hook-call assertions.                   |
| Playwright only for critical browser harness flows      | Browser lanes are limited to harness boot, send/stream, tool/activity, host/context/model, error, and persistence flows. |
| Do not assume jest-dom or unaccepted new test libraries | Strategy uses repo-owned helpers first; future Testing Library adoption requires an explicit pinned dependency decision. |
