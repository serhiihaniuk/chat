# Testing System Design

Side Chat tests protect product contracts and package boundaries. The system is
designed around fast local feedback plus one controlled container parity gate for
CI and release confidence.

This document is the source of truth for how the repository is tested.

## Goals

- Keep ordinary tests deterministic, fast, and Docker-free.
- Prove `sidechat.v1` as the browser/backend contract.
- Prove the target AI harness contracts: context assembly, budget decisions,
  manifests, compaction, retrieval, memory, tool governance, and workflows.
- Keep provider-native events inside `packages/agent-runtime`.
- Keep database row and schema assertions inside `packages/db`.
- Keep HTTP framework internals inside `apps/partner-ai-service`.
- Use fake providers, memory repositories, fake chat clients, fake host bridges,
  protocol fixtures, and repository contracts before reaching for E2E.
- Use Postgres and browser E2E only where they protect behavior that smaller
  tests cannot honestly cover.
- Run the accepted full suite inside one pinned app test container before merge
  or release.
- Add AI evals as product gates for prompt/profile/context/retrieval changes.

## Test Lanes

| Lane               | Command                       | Environment                                  | What It Proves                                                                                                                             |
| ------------------ | ----------------------------- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Fast deterministic | `npm test`                    | Host Node/npm                                | Vitest unit, contract, service route, component, and type tests. No Docker, no real Postgres, no real model providers, no product network. |
| Browser harness    | `npm run test:e2e`            | Host Playwright                              | Real widget and real service process with fake provider and memory repositories. Browser-visible behavior and harness wiring.              |
| DB contract        | `npm run test:db:container`   | Host Node plus Testcontainers Postgres       | Shared repository contract against the real Postgres/Drizzle adapter.                                                                      |
| Persistent browser | `npm run test:e2e:persistent` | Host Playwright plus Testcontainers Postgres | Real widget, real service, fake provider, and real Postgres through public widget/service seams.                                           |
| AI evals           | `npm run test:evals`           | Deterministic fixtures plus optional approved model lane | Context assembly, compaction, retrieval, memory, tool-use, workflow, and safety quality gates.                                            |
| Host full gate     | `npm run verify`              | Host pinned Node `24.16.0` and npm `11.15.0` | Format, lint, typecheck, fast tests, build, and custom governance.                                                                         |
| Container parity   | `npm run verify:container`    | Dev/test app container                       | The accepted full suite inside the controlled Linux app runtime. This is the CI/release truth.                                             |

## Current Flow

```txt
npm test
  -> package-level Vitest tests
  -> fake fetch/providers/host bridge/memory repositories

npm run test:e2e
  -> Playwright browser
  -> widget-harness
  -> SideChatWidget
  -> chat-client
  -> partner-ai-service
  -> partner-ai-core
  -> agent-runtime fake provider
  -> memory repositories

npm run test:db:container
  -> Testcontainers Postgres
  -> migrations
  -> shared repository contract
  -> Postgres/Drizzle repositories

npm run test:e2e:persistent
  -> Testcontainers Postgres
  -> partner-ai-service with SIDECHAT_DATABASE_URL
  -> widget-harness
  -> Playwright browser
  -> public stream/history/reset/usage assertions

npm run verify:container
  -> infra/docker/dev-test.Dockerfile
  -> npm run verify
  -> npm run test:db:container
  -> npm run test:e2e:persistent
```

## Package Ownership

| Package                       | Test Ownership                                                                                                                                                        |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/chat-protocol`      | `sidechat.v1` request/event validation, SSE codecs, event sequence rules, golden fixtures, generated schema compatibility, and type-level protocol unions.            |
| `packages/chat-client`        | Browser-safe fetch transport, streaming decode, abort/retry behavior, history/reset/usage route helpers, and malformed response handling.                             |
| `packages/host-bridge`        | Host context and host command contracts, local command results, and public type surfaces.                                                                             |
| `packages/partner-ai-core`    | Use-case behavior through ports: auth, policies, stream orchestration, observability, persistence callbacks, and runtime event mapping.                               |
| `packages/agent-runtime`      | Provider adapters, fake provider determinism, AI SDK/tool mapping, OpenAI Responses normalization, defect-to-typed-error boundary behavior, and runtime public types. |
| `apps/partner-ai-service`     | HTTP route behavior via `app.request`, auth and policy fail-closed behavior, service composition, and protocol-shaped responses.                                      |
| `packages/db`                 | Schema contract, migrations, memory repositories, Postgres/Drizzle repositories, and the shared repository contract.                                                  |
| `packages/side-chat-widget`   | Widget model tests, static rendering tests, DOM interaction tests with a fake `ChatClient` and fake `HostBridge`, and browser behavior via harness E2E.               |
| `test-harness/widget-harness` | Playwright flows, harness modes, fake host bridge, mock stream scenarios, and local-service integration.                                                              |
| `packages/evals` or `apps/eval-runner` | Target package/app for golden context assembly, retrieval quality, memory correctness, tool-use decisions, workflow outcomes, and prompt-injection resistance. |

## Target AI Eval Coverage

The target architecture needs evals in addition to unit and integration tests.
At minimum, add fixtures for:

- context candidate gathering and budget fit decisions;
- rendered context snapshots and manifest hashes;
- compaction preservation across long conversations;
- retrieval relevance, permission filters, and citation correctness;
- memory extraction, supersession, and selection;
- tool allowlist and tool-result summarization behavior;
- workflow node handoffs, verifier results, and failure handling;
- prompt-injection resistance across retrieved docs, user text, tool results,
  and host context.

## Boundaries

Tests must fail for broken product behavior, not for harmless refactors.

- Protocol tests assert normalized `sidechat.v1`, not provider SDK payloads.
- Client tests use fake `fetch` and controlled streams, not a real service.
- Core tests use ports and fakes, not service adapters or database adapters.
- Core/runtime tests consume Effect streams. They may convert to `AsyncIterable`
  inside the test harness, but package APIs should remain Effect-first.
- Service tests assert HTTP/protocol behavior, not framework object internals.
- DB tests may assert rows, schema, migrations, and adapter-specific behavior.
- Widget tests assert visible behavior and public seams, not hook call counts.
- Playwright tests cover critical browser flows only.

## Repository Contract

The shared repository contract lives beside the DB repositories and runs against
both memory and Postgres implementations.

It currently proves:

- conversation idempotency;
- message idempotency;
- cross-subject history denial;
- reset command behavior;
- assistant turn idempotency and completion;
- context snapshots;
- usage record and usage summary behavior;
- tool invocation records;
- host command result records;
- audit records;
- ordered history reads.

Memory repositories run this contract in `npm test`. Postgres repositories run
the same contract in `npm run test:db:container` after migrations are applied.

## Browser E2E

The normal browser lane is intentionally memory-backed. It proves browser and
service integration without paying a database lifecycle cost on every run.

It covers:

- widget boot in mock-stream mode;
- real widget to real service streaming with fake provider and memory
  persistence;
- tool activity rendering;
- host command success and failure rendering;
- selected model and host context passing through public widget seams;
- stream error dismissal;
- mobile viewport smoke and key control geometry.

The persistent browser lane is smaller. It proves persistence-sensitive behavior
through public seams only:

- stream send through the real widget and real service;
- history read through `/chat/history/:conversationId`;
- usage summary through `/usage`;
- reset through `DELETE /chat/history/:conversationId`.

Persistent E2E must not assert raw database rows. Row, migration, and schema
checks stay in `packages/db`.

## Component DOM Tests

`happy-dom` is the accepted DOM implementation for Vitest widget interaction
tests. It is pinned exactly and used with repo-owned helpers, React `act`, fake
`ChatClient`, and fake `HostBridge`.

Testing Library and jest-dom are not installed. Adding either one requires a
separate dependency decision, exact version pins, and matcher setup in the repo.

## Container Strategy

The repository has two kinds of containers.

Testcontainers owns dependency containers such as Postgres. Those containers are
ephemeral, isolated, migrated by the test runner, and used only by explicit DB
and persistent E2E lanes.

`infra/docker/dev-test.Dockerfile` owns the app test container. It pins Node and
npm, installs dependencies from the lockfile, installs Playwright Chromium, and
builds the repo. `npm run verify:container` runs the accepted full suite inside
that app container.

The app test container mounts the Docker socket and sets the Testcontainers host
override so tests inside the app container can start sibling dependency
containers. This gives us environment parity for the app runtime without forcing
every local edit through Docker.

## Devcontainer Policy

A devcontainer is useful for interactive parity, but it is not the release gate.
If we add `.devcontainer/`, it should reuse the same pinned runtime and Docker
socket assumptions as the dev/test app container, then run normal local commands
inside that environment.

The decision is:

- developers may use host-local commands for speed;
- developers may use a devcontainer for workstation parity;
- CI and release must use `npm run verify:container`;
- the devcontainer must not become a second, divergent test environment.

## Adding Tests

When adding a test, choose the smallest honest level:

| Behavior                                            | Default Test Level   | Preferred Double                                   |
| --------------------------------------------------- | -------------------- | -------------------------------------------------- |
| Pure protocol, mapper, parser, policy, or DTO logic | Unit or contract     | Inline fixture or builder                          |
| Browser transport behavior                          | Unit or contract     | Fake `fetch`, controlled stream                    |
| Core use case behavior                              | Use-case contract    | Fake ports and memory repositories                 |
| Service route behavior                              | Service route        | In-process app, fake provider, memory repositories |
| Widget interaction                                  | Component or browser | Fake `ChatClient`, fake `HostBridge`               |
| DB adapter behavior                                 | DB contract          | Testcontainers Postgres                            |
| Full browser plus service persistence               | Persistent E2E       | Fake provider, Testcontainers Postgres             |

Do not add a larger test to compensate for a missing seam. Add the seam or a
small test helper first.

## Governance Rules

- No real model provider calls in ordinary tests.
- No real product network calls in ordinary tests.
- No real Postgres outside `test:db:container` and `test:e2e:persistent`.
- No `page.waitForTimeout()`.
- No whole-widget-tree snapshots as behavior coverage.
- No jest-dom matcher assumptions.
- No new test library without an explicit dependency decision and exact pin.
- Public API type tests should protect browser-facing packages from service,
  runtime, provider, and database details.

## Required Checks Before Merge

Run the smallest useful command while developing. Before accepting a branch,
run:

```sh
npm run verify:container
```

When Docker is not available locally, run as much as possible on the host and
let CI run `verify:container`.
