---
name: side-chat-testing-architecture
description: Use when writing, reviewing, or refactoring tests in the Side Chat monorepo. Covers Vitest unit, contract, service, and integration tests; Testing Library widget tests; Playwright harness tests; sidechat.v1 protocol contracts; package boundary leakage; fake providers; memory repositories; and deterministic test strategy. Do not assume jest-dom or new test libraries.
---

# Side Chat Testing Architecture Skill

## Purpose

Use this skill to help with tests in the Side Chat repository.

Side Chat is an npm workspace modular monolith for an embeddable AI assistant. Package boundaries are architecture. Tests must protect product contracts, deterministic behavior, and stable seams without coupling to implementation details.

The browser/backend contract is `sidechat.v1`. It must not leak provider-native stream parts, AI SDK UI messages, database rows, Hono objects, Effect runtime details, Drizzle/Postgres internals, or host application internals.

## When to use this skill

Use this skill when the user asks to:

- write or review tests in the Side Chat repo
- decide whether a test should be unit, contract, service/route, integration, component, or Playwright E2E
- test `sidechat.v1` protocol behavior
- test SSE encoding/decoding or stream event normalization
- test package boundaries or architecture governance
- test React widget behavior
- test browser client transport behavior
- test host bridge contracts
- test partner AI core use cases, policies, ports, typed errors, or Effect service wiring
- test agent runtime provider adapters, fake provider, runtime tools, or normalized runtime events
- test Hono service routes and adapters
- test repository contracts, memory repositories, or Postgres adapters
- fix flaky, brittle, over-mocked, or implementation-coupled tests
- refactor untested legacy behavior safely

Do not use this skill for:

- broad product strategy unrelated to tests
- UI design critique unrelated to testability
- package installation or dependency migration unless testing-specific
- production host app behavior outside this repo
- provider-specific AI SDK behavior unless it is normalized through Side Chat runtime contracts

## Always do this

1. Identify the behavior, product contract, or architecture boundary being protected.
2. Identify the owning package.
3. Choose the smallest honest test level:
   - unit
   - contract
   - component
   - service/route
   - integration
   - Playwright E2E
4. Identify the seam or double to use.
5. Prefer existing repo doubles: memory repositories, fake providers, fake host bridge, fake chat client/transport, protocol fixtures, and builders from `packages/testing`.
6. Assert observable behavior, not internals.
7. Recommend the right repo command: `npm test`, `npm run test:e2e`, `npm run test:db:local`, or `npm run verify`.

## Hard constraints

- Do not assume jest-dom matchers. Avoid `toBeInTheDocument`, `toHaveTextContent`, `toBeVisible`, and similar matchers unless the user shows they exist in a specific package.
- Do not introduce new test libraries unless explicitly asked.
- Do not expose provider-native events outside `packages/agent-runtime` adapter tests.
- Do not expose AI SDK UI messages through `sidechat.v1`.
- Do not expose database rows outside `packages/db` tests.
- Do not expose Hono objects outside service route tests.
- Do not expose Effect runtime details through protocol, widget, client, or service contracts.
- Do not use real Postgres except opt-in DB integration tests.
- Do not use real network in ordinary tests.
- Do not use Playwright sleeps such as `page.waitForTimeout()`.
- Do not test React hook internals just to prove a hook was called.
- Do not snapshot the whole widget tree as a substitute for behavior assertions.

## Core principle

Test observable behavior through stable public seams.

In this repo, stable seams are usually package public APIs, protocol fixtures, ports, fake providers, memory repositories, browser client contracts, host bridge contracts, Hono route boundaries, and Playwright harness flows.

Before approving or generating a test, ask:

1. Would this test fail if the product behavior, package contract, or architecture boundary was broken?
2. Would this test still pass after a refactor that preserves that public behavior or boundary?

If the first answer is no, the test is weak. If the second answer is no, the test is fragile.

## Test level decision

Choose the smallest honest test level.

Use a unit test for pure or local behavior with dependencies controlled: protocol validators, DTO mappers, SSE codecs, stream decoders, domain rules, policy decisions, typed error mappers, runtime event normalization, config parsers, and test builders.

Use a contract test when behavior must remain stable across package boundaries or implementations: `sidechat.v1` fixtures, browser/backend protocol, host bridge command/context contract, repository contracts, fake provider behavior, runtime normalized event contract, memory repository versus real Postgres adapter, and service port contracts.

Use a component test for widget behavior from the user’s point of view: visible UI states, user input, submit/send interaction, loading, streaming, error, empty states, accessible behavior, and widget interaction with fake chat client or fake host bridge.

Use a service/route test for `apps/partner-ai-service`: Hono route behavior, auth/policy failures, request validation, route-to-core composition, domain error to HTTP/SSE mapping, and persistence adapter behavior through memory repositories. Assert HTTP/protocol behavior, not Hono internals.

Use an integration test when the risk is collaboration between several real packages: chat-client + chat-protocol, service + core + fake provider + memory repository, widget + fake chat client + host bridge, or DB repository contract against real Postgres in the opt-in suite.

Use Playwright E2E only for critical browser harness flows in `test-harness/widget-harness`: widget boots, user sends a message, streaming response appears, error state appears, and host bridge behavior is visible in browser.

## Boundary leakage rules

`sidechat.v1` must not expose provider-native stream parts, AI SDK UI messages, database rows, Hono objects, Effect runtime details, or host application internals.

Browser packages must not depend on Hono, Drizzle, Postgres, provider SDK internals, server-only config, or service internals.

`partner-ai-core` must remain framework-free and hexagonal. Tests should use ports/fakes rather than importing service adapters directly.

`agent-runtime` may know provider details, but it must normalize them before crossing runtime boundaries.

`packages/db` may know Drizzle/Postgres, but repository consumers should see repository contracts/domain shapes, not rows.

## Network and transport strategy

When testing network or transport behavior, use repo-facing Vitest/test interfaces and existing seams. Do not mention or depend on underlying implementation details of those test interfaces.

Choose the least fragile seam:

1. Test protocol codecs and validators directly in `chat-protocol`.
2. Test `chat-client` with fake fetch/transport or controlled stream source.
3. Test service routes with in-process app/service composition, memory repositories, and fake providers.
4. Test browser harness edge cases with Playwright `page.route()` only when the browser-level failure is the point.
5. Use real Postgres only through `npm run test:db:local` or explicitly marked opt-in integration tests.

Ordinary tests should not accidentally reach the real network. Treat hidden network calls as determinism bugs.

## Output contract

When generating or reviewing tests, use this shape unless the user asks for something else:

```text
Behavior/contract to protect:
- ...

Recommended test level:
- unit | contract | component | service/route | integration | Playwright E2E

Seam/double to use:
- ...

Tests:
<code>

Why this is resilient:
- ...

Failure meaning:
- What product behavior, package contract, or boundary would be broken if this test fails.

Repo checks to run:
- npm test / npm run test:e2e / npm run test:db:local / npm run verify
```

Keep explanations short by default.

## Failure behavior

If code is missing, ask for the relevant source file or infer a minimal test plan from the described contract.

If public behavior is ambiguous, state the ambiguity and propose characterization tests or a small behavior matrix.

If the test would require a missing seam, identify the missing seam and suggest the smallest production-code refactor.

If the user asks for a brittle test, explain the fragility and provide a behavior-oriented alternative.

If the test requires unavailable or non-core tools, do not introduce jest-dom or new libraries unless the user explicitly asks. Prefer existing repo seams and repo-facing test interfaces.

If the requested test crosses package boundaries incorrectly, flag the architecture boundary and propose the correct package-level test.

## References

Use these files when more detail is needed:

- `references/repo-context.md` for repository architecture, product path, commands, and package ownership.
- `references/package-testing-matrix.md` for package-specific test types, doubles, and leakage risks.
- `references/testing-principles.md` for deeper testing rules, smells, fixtures, fakes, timers, snapshots, and coverage.
- `references/examples.md` for concrete Side Chat-style test examples.
- `references/validation-prompts.md` for prompts that test whether this skill behaves correctly.
