# Testing Strategy Implementation Plan

Date: 2026-05-25

Parent strategy: `docs/reports/testing-strategy-review.md`

## Goal

Implement the final Side Chat testing strategy:

- fast host-local commands for developer feedback;
- Testcontainers-backed Postgres contract tests;
- persistent E2E with real widget, real service, fake provider, and
  Testcontainers Postgres;
- one controlled dev/test app container that runs the full accepted suite through
  `npm run verify:container`;
- tests that protect `sidechat.v1`, package boundaries, deterministic behavior,
  and public seams without leaking provider, DB, Hono, Effect, or widget
  internals across boundaries.

## Definition Of Done

The strategy is implemented when:

- `npm test` remains fast, deterministic, and Postgres-free.
- `npm run test:e2e` remains the memory-backed Playwright harness lane.
- `npm run test:db:container` starts Postgres through Testcontainers and runs the
  shared repository contract against the real adapter.
- `npm run test:e2e:persistent` runs the real widget and real service against
  Testcontainers Postgres with the fake provider.
- `npm run verify:container` runs the accepted full suite inside one controlled
  dev/test app container.
- Persistent E2E asserts public behavior only; raw DB row/schema assertions stay
  inside `packages/db`.
- No ordinary test reaches real model providers, real product networks, or real
  Postgres.
- The testing strategy review and implementation docs are updated if commands or
  boundaries change.

## Story Map

| Story  | Title                                                       | Type | Blocked By             |
| ------ | ----------------------------------------------------------- | ---- | ---------------------- |
| TST-01 | Stabilize The Current Verification Baseline                 | AFK  | None                   |
| TST-02 | Add The Dev/Test App Container Gate                         | AFK  | TST-01                 |
| TST-03 | Add Testcontainers Postgres Infrastructure                  | AFK  | TST-01                 |
| TST-04 | Extract The Shared Repository Contract                      | AFK  | TST-03                 |
| TST-05 | Add Persistent E2E Against Real Postgres                    | AFK  | TST-03                 |
| TST-06 | Expand Memory-Backed Browser Harness E2E                    | AFK  | None                   |
| TST-07 | Add Widget Component Interaction Tests                      | AFK  | None                   |
| TST-08 | Strengthen Runtime, Protocol, Client, And Service Contracts | AFK  | None                   |
| TST-09 | Add Public API Type Contract Tests                          | AFK  | TST-01                 |
| TST-10 | Consolidate Test Builders And Fakes                         | AFK  | TST-04, TST-07, TST-08 |
| TST-11 | Document CI Usage And Maintenance Rules                     | AFK  | TST-02, TST-03, TST-05 |

## Stories

### TST-01: Stabilize The Current Verification Baseline

Type: AFK

Blocked by: None

What to build:

Make the current local verification commands deterministic before adding new
lanes. Resolve the current `npm run verify` blockers that are unrelated to
application behavior.

Acceptance criteria:

- [ ] `.agents/` is either tracked/formatted as repo content or excluded from the
      repository format scope as local-only skill material.
- [ ] `TESTING_SKILL_CONTEXT.md` is gone and has no references.
- [ ] Root docs point to the actual testing skill instead of duplicate context.
- [ ] Running with pinned Node/npm, `npm run verify` reaches the intended code
      and governance checks.
- [ ] The report still records any environment caveats that remain.

Repo checks:

- `npm test`
- `npm run test:e2e`
- `npm run verify` under pinned Node/npm

### TST-02: Add The Dev/Test App Container Gate

Type: AFK

Blocked by: TST-01

What to build:

Add one controlled dev/test app container for the full suite. This container is
the CI/release truth and should match the production-like app runtime closely
enough to catch Node/npm, Linux filesystem, package-manager, native dependency,
and browser runtime differences.

Acceptance criteria:

- [ ] A dev/test image is defined with exact pinned Node/npm.
- [ ] The image can install dependencies from the lockfile without floating
      package versions.
- [ ] The image contains the runtime needed for `npm run verify` and Playwright.
- [ ] `npm run verify:container` builds or reuses the image and runs the full
      accepted suite inside it.
- [ ] The container runner has a documented way to allow Testcontainers to start
      sibling dependency containers.
- [ ] Host-local commands still work independently of `verify:container`.

Repo checks:

- `npm run verify:container`

### TST-03: Add Testcontainers Postgres Infrastructure

Type: AFK

Blocked by: TST-01

What to build:

Replace the shell-fragile DB local command with a cross-platform
Testcontainers-backed DB lane. Testcontainers owns ephemeral Postgres lifecycle;
the app test runner remains responsible for migrations and test execution.

Acceptance criteria:

- [ ] Exact-pinned Testcontainers dependencies are added deliberately.
- [ ] A shared Postgres test helper starts a pinned Postgres image, exposes a
      connection string, applies migrations, and tears down cleanly.
- [ ] `npm run test:db:container` runs on Windows/Linux/macOS without inline
      POSIX env syntax.
- [ ] The old `test:db:local` command is removed or replaced by
      `test:db:container`.
- [ ] `npm run test:db:integration` remains available for externally provisioned
      DBs if still useful.
- [ ] No ordinary `npm test` path starts Docker or real Postgres.

Repo checks:

- `npm run test:db:container`
- `npm test`

### TST-04: Extract The Shared Repository Contract

Type: AFK

Blocked by: TST-03

What to build:

Create a reusable repository contract that runs against memory repositories in
the fast lane and against Postgres in the Testcontainers DB lane.

Acceptance criteria:

- [ ] A shared contract covers conversation idempotency, message idempotency,
      cross-subject denial, reset, assistant turns, context snapshots, usage,
      tool invocations, host command results, audit events, and history ordering.
- [ ] Memory repositories run the shared contract in `npm test`.
- [ ] Postgres repositories run the same contract in `npm run
test:db:container`.
- [ ] Postgres-only migration, grants, schema, and row-shape assertions remain in
      `packages/db`.
- [ ] Consumers outside `packages/db` continue to assert repository/domain
      shapes, not raw rows.

Repo checks:

- `npm test`
- `npm run test:db:container`

### TST-05: Add Persistent E2E Against Real Postgres

Type: AFK

Blocked by: TST-03

What to build:

Add a small persistent E2E lane that uses a real Playwright browser, real widget
harness, real `partner-ai-service`, fake provider, and Testcontainers Postgres.
The suite proves persistence-sensitive behavior through public service/widget
seams.

Acceptance criteria:

- [ ] `npm run test:e2e:persistent` starts Testcontainers Postgres, applies
      migrations, starts the service with `SIDECHAT_DATABASE_URL`, starts the
      widget harness, runs persistent Playwright specs, and cleans up.
- [ ] The service uses the fake provider and never calls real model providers.
- [ ] Tests cover send message, history continuity, reset/new chat, usage, and
      service restart/history recovery.
- [ ] Tests do not assert raw DB rows outside `packages/db`.
- [ ] The lane is explicit opt-in/release coverage and is not part of ordinary
      `npm test`.

Repo checks:

- `npm run test:e2e:persistent`
- `npm run test:e2e`

### TST-06: Expand Memory-Backed Browser Harness E2E

Type: AFK

Blocked by: None

What to build:

Bring the existing memory-backed Playwright harness closer to the documented E2E
plan while keeping it fast and deterministic.

Acceptance criteria:

- [ ] Add a failed host-command scenario.
- [ ] Add a model-picker scenario with multiple allowed mocked profiles.
- [ ] Add a context-selection scenario that proves host context changes the
      outgoing request through public seams.
- [ ] Add a mobile viewport smoke test.
- [ ] Add error-state coverage without arbitrary sleeps.
- [ ] Prefer explicit harness scenarios over prompt keyword heuristics.
- [ ] Existing Playwright tests keep semantic locators and no
      `page.waitForTimeout()`.

Repo checks:

- `npm run test:e2e`

### TST-07: Add Widget Component Interaction Tests

Type: AFK

Blocked by: None

What to build:

Add user-visible widget interaction tests without asserting hook internals or
assuming jest-dom. Use a small repo-owned React DOM helper first; only add
Testing Library/user-event later through an explicit dependency decision.

Acceptance criteria:

- [ ] Component tests submit a message through a fake `ChatClient`.
- [ ] Streaming deltas render into the assistant message.
- [ ] Rejected client promises show the error state and dismiss works.
- [ ] Host command activity calls a fake `HostBridge.dispatchCommand` and
      renders the local result.
- [ ] Stop/abort clears active streaming state.
- [ ] Tests assert visible DOM behavior and public seams, not hook-call counts.
- [ ] No jest-dom matcher assumptions are introduced.

Repo checks:

- `npm test`
- `npm run test --workspace @side-chat/side-chat-widget`

### TST-08: Strengthen Runtime, Protocol, Client, And Service Contracts

Type: AFK

Blocked by: None

What to build:

Close high-risk contract gaps found in the review, especially around streamed
output, route errors, malformed protocol input, and service persistence failure.

Acceptance criteria:

- [ ] OpenAI adapter/runtime tests prove streamed text produces
      `runtime.output_delta`.
- [ ] Runtime tests cover reasoning deltas, tool errors, cancellation/abort, and
      malformed AI SDK/provider parts at the correct runtime boundary.
- [ ] Protocol fixtures include canonical `sidechat.activity` tool and
      host-command streams.
- [ ] Protocol tests reject provider-native, AI SDK UI, DB-ish, and Hono-ish
      shapes where recognizable.
- [ ] Chat-client route helper tests cover non-OK responses, malformed JSON, and
      missing expected fields.
- [ ] Service route tests cover invalid JSON body, history/usage auth failures,
      reset behavior, and stream persistence failure mapping.
- [ ] No provider-native events are asserted outside `packages/agent-runtime`.

Repo checks:

- `npm test`
- `npm run verify`

### TST-09: Add Public API Type Contract Tests

Type: AFK

Blocked by: TST-01

What to build:

Add type-level contract tests or declaration checks for public package APIs so
browser-facing and package-boundary types cannot accidentally expose forbidden
runtime, provider, Hono, DB, or Effect details.

Acceptance criteria:

- [ ] `chat-protocol` has type tests for event discriminated unions and invalid
      protocol shapes.
- [ ] `chat-client` public API type tests stay browser-safe and Effect-free.
- [ ] `side-chat-widget` public props stay React/TypeScript-friendly and do not
      expose service/runtime/DB internals.
- [ ] `host-bridge` command/context type contracts are covered.
- [ ] Runtime/provider registry public types preserve allowed values without
      leaking provider-native events to protocol/widget consumers.
- [ ] `@ts-expect-error` appears only in type tests with a reason.

Repo checks:

- `npm run typecheck`
- `npm run verify`

### TST-10: Consolidate Test Builders And Fakes

Type: AFK

Blocked by: TST-04, TST-07, TST-08

What to build:

Grow `packages/testing` into the shared test utility package needed by the new
strategy, without creating opaque global fixtures.

Acceptance criteria:

- [ ] Add small protocol request/event builders with valid defaults.
- [ ] Add fake chat client/transport helpers for widget and client tests.
- [ ] Add fake host bridge helpers for widget and harness tests.
- [ ] Add repository contract helpers or exports used by DB tests.
- [ ] Replace duplicated local builders where it reduces noise.
- [ ] Production source still cannot import `packages/testing`.
- [ ] Fixtures remain named, minimal, deterministic, and product-vocabulary
      based.

Repo checks:

- `npm test`
- `npm run lint:custom`

### TST-11: Document CI Usage And Maintenance Rules

Type: AFK

Blocked by: TST-02, TST-03, TST-05

What to build:

Update docs so future contributors know which test lane to run, what each lane
protects, and how the container/Testcontainers setup works.

Acceptance criteria:

- [ ] README or docs/testing explains `npm test`, `npm run test:e2e`, `npm run
test:db:container`, `npm run test:e2e:persistent`, `npm run verify`, and
      `npm run verify:container`.
- [ ] The docs state that `verify:container` is the CI/release truth.
- [ ] The docs state that ordinary tests must not use real Postgres, real model
      providers, or real product networks.
- [ ] The docs state that persistent E2E asserts public behavior, not DB rows.
- [ ] The docs explain Docker/Testcontainers prerequisites and image caching.
- [ ] The testing strategy review and this implementation plan remain in sync.

Repo checks:

- `npm run format:check`
- `npm run verify:container`

## Suggested Implementation Order

1. TST-01: Stabilize the current verification baseline.
2. TST-03: Add Testcontainers Postgres infrastructure.
3. TST-04: Extract the shared repository contract.
4. TST-02: Add the dev/test app container gate.
5. TST-05: Add persistent E2E against real Postgres.
6. TST-08: Strengthen runtime/protocol/client/service contracts.
7. TST-06: Expand memory-backed browser harness E2E.
8. TST-07: Add widget component interaction tests.
9. TST-09: Add public API type contract tests.
10. TST-10: Consolidate test builders and fakes.
11. TST-11: Document CI usage and maintenance rules.

## Skill Compliance Guardrails

Every story must preserve these rules from
`.agents/skills/side-chat-testing-architecture/SKILL.md`:

- test observable behavior through stable public seams;
- prefer memory repositories, fake providers, fake host bridges, fake chat
  clients/transports, protocol fixtures, and `packages/testing` builders;
- keep provider-native assertions inside `packages/agent-runtime`;
- keep DB row/schema assertions inside `packages/db`;
- keep Hono-specific assertions inside service route tests;
- keep ordinary tests free of real network and real Postgres;
- keep Playwright for critical browser harness flows;
- avoid `page.waitForTimeout()`;
- avoid hook-call assertions and whole-widget-tree snapshots;
- do not assume jest-dom or new test libraries unless the dependency decision is
  explicit.
