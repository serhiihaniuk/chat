# Package Boundaries

Read this when: a change adds an import, a dependency, or a network call that crosses a package, protocol, runtime, or persistence seam.
Source of truth for: which package may import what, the data hand-offs between layers, and which gate script enforces each rule.
Not source of truth for: the turn lifecycle ([assistant-turn.md](./assistant-turn.md)), package roles and entry files ([system-map.md](./system-map.md)), event vocabularies ([runtime-and-protocol-events.md](./runtime-and-protocol-events.md)), or how to add a tool/provider/guard ([extension-seams.md](./extension-seams.md)).

Side Chat keeps four layers with dependencies pointing inward: Browser (`side-chat-widget`, `host-bridge`) -> Service (`apps/partner-ai-service`) -> Core (`partner-ai-core`) -> Runtime (`agent-runtime`). Two contract packages cross the seams: `chat-protocol` (browser <-> service) and `ai-runtime-contract` (core <-> runtime). Each layer owns a narrow set of dependencies; a provider SDK, `pg`, or `hono` reaching the wrong layer is a boundary break.

These rules are not conventions you must remember. Fifteen scripts under `scripts/check-*.mjs` parse every import and fail CI on a violation, so the build catches the mistake before review. Run them with `npm run lint:custom`; see [verification.md](../operations/verification.md) for all gate commands, and [ADR 0013](../adr/0013-governance-harness.md) for why governance is executable rather than conventional.

## Boundary matrix

Each row lists what a package may import, what it must never import, and the script that enforces the deny list. `@side-chat/*` names use the short form. Allow sets come from `check-dependency-policy.mjs:13-114`; deny regexes from `check-boundaries.mjs:15-90`; ownership rules from `check-runtime-boundaries.mjs:21-50`.

| Layer / package                                 | May import                                                                                                     | Must NOT import                                                                                                                 | Enforced by                                                               |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `chat-protocol` (browser<->service contract)    | `shared`, TS primitives                                                                                        | react, react-dom, hono, ai, `@ai-sdk/*`, pg, drizzle-orm, effect, every other `@side-chat/*`                                    | `check-boundaries`, `check-dependency-policy`                             |
| `ai-runtime-contract` (core<->runtime contract) | `shared`, effect                                                                                               | hono, react, pg, drizzle-orm, ai/`@ai-sdk/*`, `partner-ai-core`, `agent-runtime`, `chat-protocol`, widget, db                   | `check-boundaries`, `check-dependency-policy`                             |
| `agent-runtime` (runtime impl)                  | `ai-runtime-contract`, `shared`, effect, ai, `@ai-sdk/*`                                                       | hono, react, pg, drizzle-orm, `chat-protocol`, widget, db                                                                       | `check-boundaries`, `check-runtime-boundaries`, `check-dependency-policy` |
| `partner-ai-core` (core workflow)               | `ai-runtime-contract`, `chat-protocol`, `shared`, effect                                                       | hono, react, pg, drizzle-orm, ai/`@ai-sdk/*`, `agent-runtime`, widget, db                                                       | `check-boundaries`, `check-dependency-policy`                             |
| `apps/partner-ai-service` (composition root)    | core, agent-runtime, both contracts, db, shared, hono, effect, `@effect/platform-node`                         | `side-chat-widget`                                                                                                              | `check-boundaries`, `check-dependency-policy`                             |
| `apps/side-chat-service` (v7 greenfield wing)   | AI SDK, Workflow, Hono, and its package-private hexagonal layers                                               | application importing outer layers; adapter coupling; Workflow physics hidden outside `workflows`; production importing doubles | `check-side-chat-service-architecture`, `check-dependency-policy`         |
| `side-chat-widget` (widget/UI)                  | `chat-protocol`, `host-bridge`, `shared`, react, react-dom, `@tanstack/react-query`, `@base-ui/react`, UI libs | hono, effect, pg, drizzle-orm, `@ai-sdk/*`, shadcn, `partner-ai-core`, `agent-runtime`, `ai-runtime-contract`, db               | `check-boundaries`, `check-widget-layers`, `check-dependency-policy`      |
| `host-bridge` (browser host seam)               | `chat-protocol`, `shared`                                                                                      | react, react-dom, hono, pg, drizzle-orm, ai/`@ai-sdk/*`, the three inner packages, widget, db                                   | `check-boundaries`, `check-dependency-policy`                             |
| `db` (persistence)                              | `shared`, drizzle-orm, pg, drizzle-kit, effect, `@types/pg`                                                    | react, hono, ai/`@ai-sdk/*`, `partner-ai-core`, `agent-runtime`, `ai-runtime-contract`, `chat-protocol`, widget                 | `check-boundaries`, `check-runtime-boundaries`, `check-dependency-policy` |
| `shared` (primitives)                           | TS-only deps (allow set empty)                                                                                 | every product, provider, db, hono, or react dependency                                                                          | `check-dependency-policy`                                                 |

### Single-owner dependencies

Three runtime dependencies and one ambient API have exactly one home. `check-runtime-boundaries.mjs:21-50` fails any other layer that touches them:

- `hono` / `@hono/node-server` -> only `apps/partner-ai-service`.
- `pg` / `drizzle-orm` -> only `db`.
- `ai` / `@ai-sdk/*` -> only `agent-runtime`. The widget's `src/shared/ai/` quarantine may import the bare `ai` package (no `@ai-sdk/*`).
- `process.env` -> only the active service's configuration subsystem (`apps/partner-ai-service/src/config/` or `apps/side-chat-service/src/config/`) and `*.test.ts`. Everything else receives resolved settings.

### Cross-cutting import rules

These apply to every `*/src/` file, on top of the per-package deny lists:

- No relative import that crosses a package; import the package name instead (`check-boundaries.mjs:121-132`).
- No relative import that crosses a top-level `src/<folder>` in the same package; use the `#<folder>/...` subpath (`check-boundaries.mjs:134-150`).
- Outbound network (`fetch`, `new WebSocket`, `new EventSource`) only in `apps/partner-ai-service/src/outbound/`, `packages/agent-runtime/src/adapters/`, or `side-chat-widget/src/shared/ai/prompt-input.tsx` (`check-outbound-rules.mjs:12-22`).

## Data hand-offs

Data changes shape at each seam so no layer leaks another's types. The widget never sees a RuntimeEvent or a Drizzle row; the runtime never sees a protocol DTO. For the event vocabularies themselves, see [runtime-and-protocol-events.md](./runtime-and-protocol-events.md).

- Hono request objects -> `StreamChatInput` at the HTTP boundary.
- Core assembles policy, trusted context, and history into final `AiRuntimeRequest.messages` before the runtime port.
- AI SDK stream parts -> provider-neutral `RuntimeEvent`s inside `agent-runtime`.
- `RuntimeEvent`s -> browser-safe `sidechat.v1` events in `partner-ai-core`.
- Drizzle/Postgres rows stay behind repository adapters in `db`.
- Widget message and activity state derives only from `sidechat.v1` events and host-bridge messages.

## Gate-script catalog

`scripts/run-custom-lints.mjs` runs these fifteen checks in order. Italicized checks guard imports and dependencies; the rest guard code shape, versions, generated files, and docs. `check-human-readability.mjs` is a docs gate, not an import check.

| Check (`scripts/...`)                        | Rule it enforces                                                                                                                                                                                                                                                                                                                                                        |
| -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `check-version-pins.mjs`                     | Non-`@side-chat` deps pin exact versions; `@side-chat/*` deps pin `0.0.0`; named tool/runtime versions match; `package-lock.json` exists (`:82-110`).                                                                                                                                                                                                                   |
| _`check-dependency-policy.mjs`_              | Each package's `package.json` deps must sit in a closed allow set; `shadcn`/`@repo/shadcn-ui` banned everywhere; an unknown dep or a package with no policy entry fails (`:13-133`).                                                                                                                                                                                    |
| `check-unused-dependencies.mjs`              | Every declared dependency must appear in that package's source text, minus an explicit ignore list (`:92-100`).                                                                                                                                                                                                                                                         |
| `check-package-exports.mjs`                  | Each package is `@side-chat`-scoped, `version 0.0.0`, `private`, `type: module`, with `exports["."]`, `types`, a `typecheck` script, and a root `tsconfig` project reference (`:19-31`).                                                                                                                                                                                |
| _`check-boundaries.mjs`_                     | Per-package forbidden-import lists, no boundary-crossing relative imports (cross-package or cross-`src`-folder) — the matrix above.                                                                                                                                                                                                                                     |
| _`check-side-chat-service-architecture.mjs`_ | The v7 service follows its normative dependency law and physical overlay: application stays inward, adapters do not couple to other implementations, Workflow directives and engine imports stay in `workflows`/composition, and production composition cannot resolve testing doubles.                                                                                 |
| _`check-widget-layers.mjs`_                  | Widget FSD: import only downward through `app > widgets > features > entities > shared`; no cross-slice; `shared` imports no product package; no removed `application/assets/domain/ui` folders; public `index.ts` exports only the widget (`:16-68`).                                                                                                                  |
| _`check-runtime-boundaries.mjs`_             | Single owners: `process.env` -> config adapter; `pg`/`drizzle-orm` -> `db`; `hono` -> service; `ai`/`@ai-sdk/*` -> `agent-runtime` (widget `shared/ai` quarantine excepted) (`:21-50`).                                                                                                                                                                                 |
| _`check-outbound-rules.mjs`_                 | `fetch`/`WebSocket`/`EventSource` only in the approved outbound and provider-adapter folders (`:12-22`).                                                                                                                                                                                                                                                                |
| `check-undefined-optional-contracts.mjs`     | Bans `optionalField(`, `\|\| undefined` coercion, conditional empty-object shapes, and untyped `kind`-probing of repositories (use typed `adapterKind`) (`:36-76`).                                                                                                                                                                                                     |
| `check-code-shape.mjs`                       | TS-AST budgets: cognitive complexity <=12, <=8 nested functions, <=28 functions/file, <=5 source files/dir; `.test-support.` files live under `src/testing/**` (`:8-12`).                                                                                                                                                                                               |
| `check-source-governance.mjs`                | Strict `tsconfig` flags; workspace tsconfigs `composite`; tests colocated under `src`; no tracked `dist`/`build`/`coverage`; source line budgets; repository-authored TS/TSX ban on type assertions, non-null/definite-assignment assertions, explicit `any`, and unchecked TypeScript suppressions (`as const` remains allowed; ignored Fumadocs output is generated). |
| `check-human-readability.mjs`                | Docs gate: required canonical docs exist and banned "truth" docs do not; every durable doc carries the `Read this when / Source of truth for / Not source of truth for` header; paragraph density caps (<=620 chars, <=105 words); READMEs own no vocabulary table (`:11-43`).                                                                                          |
| `check-generated-artifacts.mjs`              | Expected generated artifacts exist; every `*.generated.*` file declares `Generated from:` in its header (`:7-30`).                                                                                                                                                                                                                                                      |
| `check-governance-fixtures.mjs`              | Meta: each check fails on a crafted bad fixture, and every `check-*.mjs` is wired into `run-custom-lints.mjs`, so a forgotten check fails CI (`:269-284`).                                                                                                                                                                                                              |

## Common mistakes the gates catch

Each row is a real break the lints reject, with the fix and the script that flags it:

| Mistake                                                                    | Fix                                                                       | Caught by                               |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------- | --------------------------------------- |
| Relative import into another package (`../../chat-protocol/src/...`)       | Import the package name                                                   | `check-boundaries.mjs:121-132`          |
| Relative import across a `src/<folder>` in one package                     | Use the `#<folder>/...` subpath                                           | `check-boundaries.mjs:134-150`          |
| Reading `process.env` in core or runtime                                   | Inject config through a port from the service config adapter              | `check-runtime-boundaries.mjs:23-28`    |
| `pg`/`drizzle-orm`/`hono`/`@ai-sdk/*` imported in the wrong layer          | Keep each behind its single owner                                         | `check-runtime-boundaries.mjs:30-50`    |
| `fetch`/`WebSocket`/`EventSource` outside an approved folder               | Move the call into `src/outbound/` or a provider adapter                  | `check-outbound-rules.mjs:12-22`        |
| Widget importing `partner-ai-core`, `agent-runtime`, or a contract package | Consume `sidechat.v1` via `chat-protocol` instead                         | `check-boundaries.mjs:69-79`            |
| Widget `shared` layer importing a product `@side-chat/*` package           | Move the dependency up to a feature or entity slice                       | `check-widget-layers.mjs:58-60`         |
| Adding a dependency not in a package's allow set                           | Add it to that package's set in `check-dependency-policy.mjs`, or drop it | `check-dependency-policy.mjs:124-131`   |
| A new `check-*.mjs` not added to the orchestrator                          | Add it to the list in `run-custom-lints.mjs`                              | `check-governance-fixtures.mjs:269-284` |
