# Side Chat

Read this when: you need the shortest entrypoint into this repository.
Source of truth for: setup commands and the top-level package map.
Not source of truth for: domain terms, package boundaries, or test policy.

Side Chat is an adoptable enterprise assistant foundation for ordinary web
applications. It owns the browser protocol, React widget and browser API
adapter, host bridge, deployable service composition, product core, agent
runtime, service adapters, persistence boundary, and test harnesses.

It does not own a consuming host application. Host apps integrate through the
widget, host bridge, and service API.

```txt
host app -> side-chat-widget API/client -> chat-protocol
  -> partner-ai-service -> partner-ai-core -> agent-runtime -> provider/tools
```

## Read First

| Need                      | Document                                           |
| ------------------------- | -------------------------------------------------- |
| Documentation map         | `docs/README.md`                                   |
| Product identity          | `docs/architecture/system-map.md`                  |
| Canonical terms           | `docs/domain/vocabulary.md`                        |
| Assistant turn lifecycle  | `docs/architecture/assistant-turn.md`              |
| Extension seams           | `docs/architecture/extension-seams.md`             |
| Boundary rules            | `docs/architecture/package-boundaries.md`          |
| Runtime & protocol events | `docs/architecture/runtime-and-protocol-events.md` |
| Widget & host integration | `docs/architecture/widget-and-host-integration.md` |
| Iframe embedding          | `docs/operations/embed-widget-iframe.md`           |
| Local development         | `docs/operations/local-development.md`             |
| Configuration             | `docs/operations/configuration.md`                 |
| Database tooling          | `docs/operations/database.md`                      |
| Verification commands     | `docs/operations/verification.md`                  |
| Agent rules               | `AGENTS.md`                                        |

## Local Commands

```sh
npm install
npm run dev --workspace @side-chat/partner-ai-service
npm run dev --workspace @side-chat/widget-harness -- --host 127.0.0.1
```

For a no-Docker iframe stack with in-memory persistence, use:

```sh
node scripts/run-local-fake.mjs --yes
```

Keep port `8080` for the real host Workbench app. The fake launcher defaults to
the fake provider, local mock tools, in-memory persistence, and a few seeded
demo conversations unless `SIDECHAT_DEMO_SEED_CONVERSATIONS=false`.

Open the **host page** the launcher prints, not the raw iframe. The iframe path
below is debug-only:

```txt
http://127.0.0.1:5174/side-chat-frame/?mode=local-service&authToken=local-compose-token&workspaceId=workspace_local
```

Do not put secret values in docs or committed examples. Local service settings
are injected by the launcher; the service does not auto-load `.env` (see
[docs/operations/local-development.md](docs/operations/local-development.md)).

## Verification

| Command                | Proves                                              |
| ---------------------- | --------------------------------------------------- |
| `npm run format:check` | Oxfmt style is stable.                              |
| `npm run lint:oxlint`  | Oxlint rules and TypeScript-aware lint pass.        |
| `npm run typecheck`    | Strict TypeScript contracts compile.                |
| `npm test`             | Deterministic Vitest scenarios pass.                |
| `npm run lint:custom`  | Side Chat boundary and readability governance pass. |
| `npm run verify`       | The local full gate passes.                         |

Supported local runtimes are Node `>=24.15.0 <25.0.0` and npm
`>=11.12.0 <12.0.0`. The repo keeps Node `24.16.0` and npm `11.15.0` as
the recommended fixture runtime for reproducible checks:

```sh
npx -p node@24.16.0 -p npm@11.15.0 npm run verify
```
