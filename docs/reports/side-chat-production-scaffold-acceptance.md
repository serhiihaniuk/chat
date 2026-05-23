# Side Chat Production Scaffold Acceptance Report

Date: 2026-05-23

## Verdict

The side-chat production scaffold passes the day-one acceptance gate.

The accepted scope is an embeddable side-chat product scaffold with protocol, client, widget, service, backend core, assistant runtime, DB contract, local harness, operational docs, and governance checks. It intentionally does not ship a consuming host app, production auth provider, external telemetry exporter, durable backend host-command result workflow, live provider smoke test, billing/rate limiting, or stream replay store.

## Verification Evidence

- `npm run verify`: pass, 23 Vitest files and 83 tests.
- `npm audit --audit-level=high`: pass; audit still reports 4 moderate `drizzle-kit`/`esbuild` advisories that require a breaking `npm audit fix --force`.
- `docker compose config`: pass.
- `docker compose build partner-ai-service`: not run to completion because the local Docker daemon socket was unavailable.
- Source scope scan: no accidental product implementation of `[Open]` or `[Deferred]` behavior outside accepted ADR/documentation references.
- Git policy: each story landed on `main` after verification and was pushed. One stale team auto-merge (`99bbced`) was repaired by forward revert commit `3762755`.

## System Design Initial Acceptance

| Criterion                                                                          | Status | Evidence                                                                                                                                                                                                                                             |
| ---------------------------------------------------------------------------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Top-level folders match the design or deviations are documented.                   | Pass   | Source folders are `apps`, `packages`, `test-harness`, `docs`, `scripts`, and `.github`; local/runtime folders `.git`, `.omx`, `node_modules`, and `.env` are not source deliverables.                                                               |
| No host app exists.                                                                | Pass   | Only `apps/partner-ai-service` exists under `apps`; browser development is isolated under `test-harness/widget-harness`.                                                                                                                             |
| `npm install` works from the root.                                                 | Pass   | `node_modules` and `package-lock.json` are present; verification uses root workspace commands.                                                                                                                                                       |
| Version pin contract is present.                                                   | Pass   | `package.json` pins `node` 24.16.0, `npm` 11.15.0, and `packageManager` `npm@11.15.0`; `.nvmrc` contains 24.16.0; `scripts/check-version-pins.mjs` runs in `npm run verify`.                                                                         |
| `npm run verify` exists.                                                           | Pass   | Root script runs format, ESLint, no-emit typecheck, Vitest, and custom governance checks.                                                                                                                                                            |
| Root TypeScript references include every app/package.                              | Pass   | `tsconfig.json` references all workspace packages, app, and harness.                                                                                                                                                                                 |
| Strict TypeScript is enabled and checked.                                          | Pass   | `tsconfig.base.json` enables strict options; `scripts/check-typescript-rules.mjs` runs in verify.                                                                                                                                                    |
| Type-aware ESLint and custom governance run through lint.                          | Pass   | `npm run lint` chains `lint:eslint` and `lint:custom`; verify runs the same surfaces.                                                                                                                                                                |
| Code-quality budgets are enforced.                                                 | Pass   | `scripts/check-code-quality.mjs` covers file/function budgets, nested ternaries, TODO/FIXME policy, and duplicated product magic strings.                                                                                                            |
| DB schema contract exists.                                                         | Pass   | `packages/db/migrations/0000_side_chat_day_one.sql`, Drizzle schema, schema-contract files, repository ports, memory repositories, idempotency, tenant isolation, usage/tool/host/audit tests, and least-privilege migration assertions are present. |
| `chat-protocol` has request, event, codec, and sequence tests.                     | Pass   | Tests exist under `packages/chat-protocol/src/sidechat-v1` and fixtures.                                                                                                                                                                             |
| Public package APIs have declaration/type checks.                                  | Pass   | Workspace package exports and `types` fields are enforced by `scripts/check-package-exports.mjs`; strict no-emit typecheck validates API surfaces.                                                                                                   |
| `backend-core` has fake-runtime stream use-case tests.                             | Pass   | `packages/backend-core/src/stream-chat.test.ts` covers auth, policy, event sequencing, terminal events, and observability integration.                                                                                                               |
| `assistant-runtime` has fake provider, tool registry, and provider registry tests. | Pass   | Tests exist under `packages/assistant-runtime/src/fake`, `registry`, `tools`, and `runtime`; SC-18 also adds mocked OpenAI Responses adapter tests.                                                                                                  |
| `partner-ai-service` can serve a fake streaming response.                          | Pass   | `apps/partner-ai-service/src/http/app.test.ts` and `src/config/service-config.test.ts` verify fake-provider SSE responses.                                                                                                                           |
| `side-chat-widget` can render against a mocked client stream.                      | Pass   | `packages/side-chat-widget/src/side-chat-widget.test.ts` covers stream projection and composer behavior; `test-harness/widget-harness` adds mock/local-service modes.                                                                                |
| Widget and chat-client public APIs are plain TypeScript/React-friendly.            | Pass   | Boundary checks keep Effect/backend/service/runtime packages out of browser client and widget surfaces.                                                                                                                                              |
| Widget UI is owned source with no forbidden UI-kit dependency/import.              | Pass   | Dependency and boundary checks forbid `lucide-react`, `ai-elements`, `shadcn`, and `@repo/shadcn-ui`; widget code uses owned components.                                                                                                             |
| Boundary checks fail on forbidden imports.                                         | Pass   | `scripts/check-boundaries.mjs`, runtime boundary checks, and governance fixture checks run in verify.                                                                                                                                                |
| Dependency/version checks fail on bad strategic packages.                          | Pass   | `scripts/check-dependency-policy.mjs`, `scripts/check-version-pins.mjs`, and governance fixtures run in verify.                                                                                                                                      |
| Runtime-boundary checks fail on domain/use-case leakage.                           | Pass   | `scripts/check-runtime-boundaries.mjs` runs in verify.                                                                                                                                                                                               |
| Outbound-rule checks fail on direct external calls from use cases/tools.           | Pass   | `scripts/check-outbound-rules.mjs` runs in verify.                                                                                                                                                                                                   |
| Test-placement checks fail on misplaced tests.                                     | Pass   | `scripts/check-test-placement.mjs` runs in verify; generated `dist` tests were removed after no-emit verification restored the intended path.                                                                                                        |
| README explains the product boundary in one screen.                                | Pass   | `README.md` names the owned product boundary and the non-owned host app boundary, and links the ops runbook.                                                                                                                                         |

## Story Completion Ledger

| Story       | Priority | Main commit | Acceptance note                                                                                |
| ----------- | -------- | ----------- | ---------------------------------------------------------------------------------------------- |
| SC-00/SC-01 | P0       | `f2f845c`   | Root workspace, pins, package graph, governance, CI verify gate.                               |
| SC-02/SC-03 | P0       | `b3cb306`   | Normalized authority/auth context and DB schema contracts before protected work.               |
| SC-04       | P0       | `9918e9c`   | Owned `sidechat.v1` protocol contract and SSE codec.                                           |
| SC-05       | P0       | `96076de`   | Backend-core stream use case with normalized auth, fake runtime, and terminal sequencing.      |
| SC-06       | P0       | `b5dee95`   | Assistant-runtime fake provider, runtime, provider registry, and tool registry.                |
| SC-07       | P0       | `781f7f7`   | Partner AI service HTTP/SSE walking skeleton.                                                  |
| SC-08       | P1       | `81ba7f5`   | Typed chat client and chunked SSE handling.                                                    |
| SC-09       | P1       | `6d2a64d`   | Host bridge context, capabilities, dispatcher, and local command-result helpers.               |
| SC-10       | P1       | `5dd0da6`   | React widget shell, composer, feed, and protocol projection.                                   |
| SC-11       | P1       | `51c62e3`   | Widget harness mock-stream and local-service modes.                                            |
| SC-12       | P1       | `06cb4ec`   | DB migration, schema, repository contracts, memory implementation, and least-privilege checks. |
| SC-13       | P1       | `d1dda92`   | ADR 0001 keeps host-command results client/local-harness only for day one.                     |
| SC-14       | P1       | `fa546ca`   | Service persistence composition with idempotent messages, turns, context, usage, and audit.    |
| SC-15       | P1       | `a54051e`   | Auth/tenancy profile fails closed before persistence or model work.                            |
| SC-16       | P1       | `985615c`   | Typed policy skeletons and production fail-closed/configured modes.                            |
| SC-17       | P1       | `0673dc5`   | Observability, audit, redaction, trace/request/turn correlation.                               |
| SC-18       | P2       | `1dab5ed`   | ADR 0002 and mocked OpenAI Responses provider adapter behind the runtime registry.             |
| SC-19       | P2       | `d8f3d0d`   | Production image, local compose path, health/readiness, env config, and ops runbook.           |
| SC-20       | P2       | This report | Final scaffold acceptance audit.                                                               |

## Documented Deviations And ADRs

- Durable `host_command_results` DB schema/repository support exists only as day-one schema-contract capacity. Product behavior remains client/local-harness only by ADR 0001; no service route, protocol behavior, widget durable assumption, DB write workflow, or state-changing backend host-command workflow is accepted.
- The OpenAI Responses adapter is mocked in default tests and selected by registry. Live provider traffic still needs secret injection, data-use review, production config, and live integration tests under ADR 0002 follow-up work.
- The production service profile is deliberately fail-closed. Production auth, entitlement/rate-limit provider, external telemetry exporter, persistent repository adapter, backup/restore drills, and deployment target selection remain follow-up work.
- Docker static configuration is verified, but the image build could not be run in this local environment because the Docker daemon socket was unavailable.
- The team runtime produced one stale auto-merge commit after SC-18. It was not used as acceptance evidence and was repaired by commit `3762755`.

## Follow-Up Decisions

- ADR: production authority provider and service-token rotation model.
- ADR: production entitlement/rate-limit adapter and denial taxonomy.
- ADR: live provider rollout, provider data-use retention, and OpenAI integration smoke policy.
- ADR: persistent repository adapter, migration runner, backup/restore, and deployment database topology.
- ADR: if needed, durable backend host-command result product behavior beyond the ADR 0001 day-one local/client decision.
- ADR: stream replay/event store if resumable streams become a product requirement.
