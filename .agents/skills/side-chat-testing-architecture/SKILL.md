---
name: side-chat-testing-architecture
description: Write, review, or refactor tests in a TypeScript/React/Node repository. Choose honest test levels, protect public contracts and architecture boundaries, use deterministic doubles, and avoid brittle implementation-coupled tests. Use for unit, contract, component, service, integration, browser E2E, testability, and flakiness work.
compatibility: Codex CLI, Codex IDE, Codex app; instruction-first skill; no network required.
metadata:
  version: "2.0.0"
  domain: "Test architecture, deterministic verification, and boundary protection"
  source: "Repository-local testing guidance expressed without repository-specific paths"
---

# Testing Architecture

Use this skill to protect product behavior, public contracts, deterministic behavior, and stable architecture seams without coupling tests to implementation details.

## When to use this skill

Use it when the user asks to:

- write, review, refactor, or classify tests;
- choose between unit, contract, component, service, integration, or browser E2E tests;
- test a versioned protocol, stream codec, transport, host boundary, runtime adapter, repository, route, or UI;
- fix flaky, brittle, over-mocked, or implementation-coupled tests;
- safely characterize untested legacy behavior.

Do not use it for broad product strategy, visual design unrelated to testability, dependency selection unrelated to testing, or production behavior outside the repository.

## Discover the repository's test surface

Before writing tests:

1. Read `AGENTS.md`, the repository documentation index, and the nearest package or folder README.
2. Inspect the package manifest and test configuration to discover the actual test runners, scripts, test locations, and available matchers.
3. Identify the behavior or contract and the module that owns it.
4. Inspect nearby tests and existing test support before creating a new double or helper.
5. Read the relevant architecture and boundary docs.

Do not assume a matcher, library, folder, package, command, or shared builder exists. Discover it from the current repository.

## Always do this

1. State the behavior, product contract, or architecture boundary being protected.
2. Identify the owning module or package.
3. Choose the smallest honest test level.
4. Choose an existing seam or the smallest new seam needed.
5. Prefer deterministic repository doubles: in-memory adapters, fake providers, fake transports, controlled streams, fake host boundaries, fixtures, and local builders that actually exist.
6. Assert observable behavior through a stable public seam.
7. Recommend the repository's actual focused and full verification commands.

## Test-level decision

Choose the smallest level that proves the behavior:

- **Unit:** pure or local behavior with controlled dependencies, such as validation, mapping, domain rules, policy decisions, error mapping, codecs, parsers, and normalization.
- **Contract:** behavior stable across package boundaries or implementations, such as protocol fixtures, browser/server DTOs, host boundaries, repository contracts, runtime event contracts, or adapter parity.
- **Component:** user-visible UI states, interaction, accessibility, loading, streaming, error, and empty states through a fake client or boundary.
- **Service/route:** HTTP behavior, authentication or policy failures, validation, composition, persistence through a test adapter, and mapping domain errors to transport responses.
- **Integration:** collaboration between several real modules where a unit or contract test would miss wiring, ownership, or translation errors.
- **Browser E2E:** a small set of critical flows through the real browser harness, such as boot, user submission, streamed output, visible errors, and host-boundary behavior.

## Hard constraints

- Do not assume extra matchers, assertion libraries, test libraries, or framework helpers. Use only configured dependencies unless the user explicitly requests a new one.
- Do not expose provider-native events, database rows, server framework objects, runtime internals, or host internals through browser-facing contracts.
- Do not use a real database except in an explicit opt-in integration lane.
- Do not use real network calls in ordinary tests.
- Do not use arbitrary sleeps in browser tests. Wait for observable state or a controlled event.
- Do not test hook internals merely to prove that a hook was called.
- Do not snapshot an entire UI tree as a substitute for behavior assertions.
- Do not weaken a test to make an implementation pass. Repair the behavior, the seam, or the expectation.

## Core resilience test

Before approving a test, ask:

1. Would this test fail if the protected product behavior or architecture boundary broke?
2. Would this test survive a refactor that preserves the protected behavior or boundary?

If the first answer is no, the test is weak. If the second answer is no, the test is fragile.

## Boundary and transport strategy

Keep each representation inside its owning boundary. A versioned browser/server contract must not expose provider DTOs, database rows, framework objects, runtime details, or host application internals.

Test transport in layers:

1. Test validators and codecs directly.
2. Test the browser or transport client with a controlled response, fake fetch, or controlled stream.
3. Test service routes with an in-process composition and deterministic adapters.
4. Use browser automation only when browser behavior is the risk.
5. Use a real database only through the repository's explicit integration lane.

Hidden network calls are determinism bugs. A test that needs a missing seam should identify the smallest production-code refactor that creates the seam.

## Output contract

When generating or reviewing tests, use this shape unless the user asks for another:

```text
Behavior/contract to protect:
- ...

Recommended test level:
- unit | contract | component | service/route | integration | browser E2E

Seam/double to use:
- ...

Tests:
<code>

Why this is resilient:
- ...

Failure meaning:
- What product behavior, contract, or boundary would be broken if this test fails.

Repository checks to run:
- <focused command>
- <full gate when appropriate>
```

Keep explanations short by default.

## Failure behavior

If source is missing, request the relevant file or infer a minimal test plan from the described contract. If behavior is ambiguous, state the ambiguity and propose characterization tests or a behavior matrix.

If the requested test is brittle, explain the fragility and provide a behavior-oriented alternative. If it crosses a package boundary incorrectly, name the boundary and propose the correct owning test.

## References

Load references relative to this skill directory only when needed:

- `references/testing-principles.md` for deeper test design, fixtures, fakes, timers, snapshots, and coverage.
- `references/examples.md` for generic test-shape examples.
- `references/validation-prompts.md` for skill behavior checks.
