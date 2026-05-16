# Transition Roadmap

Status: transition plan

This roadmap turns the current architecture into the target architecture without adding product features. The work should stay teachable: every refactor should name the boundary being improved and explain why.

## Stop Rules

Do not start implementation refactors until the docs are in place.

Do not widen scope into:

- multi-conversation lifecycle
- npm package publishing hardening
- real model-picker semantics
- new dashboard routes
- broad Effect rewrite
- direct browser-to-database access

Those are outside the current goal.

## Phase 0: Brownfield Truth Map

Deliver [current.md](./current.md) and keep it honest. It should remain the place where future readers can see which parts are already clean and which parts are transitional.

Acceptance:

- it includes current / target / why / risk for the seven required resources
- it names direct chat API dashboard DB access as transitional coupling
- it names `apps/dashboard-data-api` as the intended host dashboard data service

## Phase 1: Architecture Source Of Truth

Deliver [../../SYSTEM-DESIGN.md](../../SYSTEM-DESIGN.md) as the first-principles architecture guide. Keep [target.md](./target.md) as a compact target summary that points back to the canonical design.

Acceptance:

- `SYSTEM-DESIGN.md` explains modular monolith, vertical slices, and lightweight ports/adapters
- it defends the typed Node/TypeScript chat boundary
- it describes Effect as a workflow/dependency/error/resource tool, not style decoration
- it keeps AI SDK as adapter/protocol material
- it keeps the reusable widget separate from the host dashboard
- `target.md` does not duplicate the full architecture narrative

## Phase 2: Split Hono Without Changing Behavior

Implementation status: completed for the first transition pass. Hono routing is now split into route modules, response helpers, and composition modules while preserving the public API behavior.

Original problem: `apps/side-chat-api/src/inbound/hono/index.ts` was doing too many jobs. The first split is complete; the remaining risk is future route/composition drift if new behavior is added without keeping the boundary small.

Target shape:

```txt
apps/side-chat-api/src/inbound/hono/
  app.ts
  routes/
    health-models.ts
    chat-stream.ts
    history-usage.ts
    reports.ts
  response/
    protocol-errors.ts
    sse.ts
  composition/
    default-deps.ts
    memory-repositories.ts
    workbench-tools.ts
    reports.ts
```

Rules:

- Hono stays under `apps/side-chat-api/src/inbound/hono`.
- Route modules parse HTTP and translate responses.
- Route modules call application use cases through dependencies.
- Composition modules may wire adapters, but they should not hide use-case logic.
- No product behavior changes in this phase.

Verification:

- targeted API tests for health, models, history, usage, stream invalid request, stream success
- `npm run lint`
- `npm run typecheck`
- `npm test`

## Phase 3: Clarify Workbench Tool Data Boundary

Implementation status: completed for the first transition pass. Workbench tool construction and dashboard data access now live behind `apps/side-chat-api/src/adapters/workbench/workbench-tools-adapter.ts` instead of the Hono route file.

Current problem: chat API composition currently reaches advisory dashboard DB access directly to support AI tools, while host dashboard reads use `apps/dashboard-data-api`.

Target:

- `apps/dashboard-data-api` remains the intended dashboard data API for host reads.
- AI tools access Workbench data through a named `WorkbenchToolsPort` adapter.
- That adapter may internally use `packages/db` while the repo is still a monorepo, but the dependency is explicit and documented.
- Hono route setup does not own dashboard query policy.

Possible target files:

```txt
apps/side-chat-api/src/adapters/workbench/
  workbench-tools-adapter.ts
  workbench-surface-context.ts
  workbench-citations.ts
```

This phase is about naming and isolating the boundary, not changing dashboard behavior.

Verification:

- existing stream/tool tests continue to pass
- add or update tests for Workbench tool adapter behavior if code moves
- `npm run lint`
- `npm run typecheck`
- `npm test`

## Phase 4: Make Effect Teachable In One Use Case

Implementation status: advanced narrowly. The Hono SSE response boundary runs an explicit Effect program through `runEffectBoundary`, and `streamChatEffect` now decodes the request body with Effect Schema into a typed `InvalidRequest` application error. The full typed service/layer version of `streamChat` remains a later refactor.

Current problem: Effect exists, and the request decode is now part of the Effect flow, but most port dependencies are still passed as plain function arguments rather than Effect services/layers.

Target:

- define application-level expected errors as typed values
- define service requirements for meaningful ports/dependencies
- run the workflow at the inbound boundary
- preserve async stream behavior and cancellation
- keep pure helpers as pure functions

The first pass should be narrow. For example:

```txt
Hono route
  -> runEffectBoundary(program)
  -> streamChat program
  -> services/layers provide ports
  -> typed application errors translated at inbound boundary
```

Do not convert formatting helpers, sorting helpers, constants, or small deterministic transforms to Effect.

Verification:

- stream-chat tests cover expected errors
- cancellation behavior is not regressed
- `npm run lint`
- `npm run typecheck`
- `npm test`

## Phase 5: Align Protocol Docs And Tests

Implementation status: completed for the first transition pass. The current architecture and learning docs now explain `sidechat.v1`, and the existing shared-protocol plus widget stream tests remain the automated guardrails.

Current strength: `packages/shared-protocol` already owns `sidechat.v1`.

Target:

- protocol docs explain the event lifecycle
- sequence tests remain the guardrail for exactly one terminal event
- widget stream tests prove the browser consumes protocol events without provider SDK details

Verification:

- protocol tests
- widget stream event tests
- `npm run lint`
- `npm run typecheck`
- `npm test`

## Phase 6: Repair End-To-End Verification

Implementation status: completed for the first transition pass. Playwright now starts chat API, dashboard data API, embedded host app, and widget demo; the tests assert current UBS Workbench labels and treat the model picker as a demo alias affordance.

Original issue: recent end-to-end tests were stale against the UBS Workbench UI and did not start `apps/dashboard-data-api`.

Target:

- Playwright starts the chat API, dashboard data API, embedded host app, and widget demo when needed
- tests assert current labels such as `Advisory Workbench`
- tests understand the model picker as a demo affordance rather than treating it as real provider switching

This phase should happen after docs and architecture refactors, not before, unless visual regression confidence becomes the blocker.

## Refactor Order

Recommended order:

1. Docs and inventory.
2. Hono file split with no behavior changes.
3. Workbench tool adapter extraction.
4. Effect workflow boundary around the chat use case.
5. Protocol and widget documentation alignment.
6. End-to-end verification repair.

This order works because it starts with the least behavioral risk and moves toward the most cross-cutting changes only after the architecture is documented.
