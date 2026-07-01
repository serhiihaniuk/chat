# ADR 0002: Modular Monolith With Four Enforced Layers

Status: accepted (rebaselined 2026-07-01, expanded 2026-07-02)

## Context

Side Chat ships as a template repo that teams copy and extend. It needs the
operational simplicity of one deployable — and internals that do not fuse into
a blob, because adopters swap providers, storage, and tools without forking
product logic. Both classic failure modes are on the table: premature
microservices (operational sprawl for a feature-sized product) and the
unstructured monolith (every import reaches everything until nothing is
swappable).

## What it buys here

| Capability | In this repo | Without it |
|---|---|---|
| **One process to run, deploy, and debug.** | `npm run dev` boots Postgres + the app; one Dockerfile; one log stream. | Service sprawl: N deploys, N configs, distributed debugging for a single feature. |
| **Layers with inward-only dependencies.** Browser → Service → Core → Runtime, crossed by two contract packages. | The widget cannot see a DB row; the runtime cannot see a route; each layer knows only the contract beside it ([system-map.md](../architecture/system-map.md)). | Spaghetti imports; changing storage touches UI code. |
| **Boundaries enforced by CI, not convention.** | 14 gate scripts parse every import and dependency; a forbidden import fails before review ([package-boundaries.md](../architecture/package-boundaries.md)). | Boundary erosion, one well-meaning PR at a time. |
| **Future service boundaries, pre-cut.** | Package seams are potential service seams; the contracts already exist. | A rewrite when scale ever forces a split. |
| **Swappable infrastructure.** | Postgres and in-memory repositories pass one shared contract suite; providers swap via config; core is framework-free (hexagonal, Effect-first — ADR 0003). | Fork-to-change; storage and vendors welded into product logic. |

## Decision

Ship one deployable service (`apps/partner-ai-service`) as a modular monolith
over four layers with dependencies pointing inward. Two contract packages cross
the seams: `chat-protocol` (browser↔service) and `ai-runtime-contract`
(core↔runtime).

- Core is hexagonal and framework-free: workflows, policy, ports, typed
  errors. Hono, Drizzle, React, and provider SDKs are rejected inside it;
  Promise/`ReadableStream` conversions live at transport edges only.
- `packages/db` owns persistence. Production uses Postgres + Drizzle; memory
  repositories serve tests and local development. Production without a
  database URL fails closed at boot — never a silent memory fallback.
- The boundary rules are executable: `scripts/check-*.mjs` via
  `npm run lint:custom`, with a meta-gate proving every gate still runs.

## Alternatives rejected

- **Day-one microservices** — operational cost with no scaling need, and
  service boundaries drawn before the domain proved where they belong.
- **One unstructured package** — the blob; nothing swappable, everything
  coupled, the template's whole value proposition gone.
- **Convention-only boundaries** ("we'll be careful") — every eroded codebase
  said that; here a violation is a CI failure, not a review comment.

## Consequences

One process, one deploy, boundaries that hold under pressure — including from
AI-generated changes, which the gates catch mechanically. The owned cost:
every new dependency must land in a gate allowlist (one extra edit per
dependency), and contributors occasionally fight a gate before they understand
why it exists; [package-boundaries.md](../architecture/package-boundaries.md)
exists to make that fight short.
