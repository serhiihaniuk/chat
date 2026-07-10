# Side Chat

Read this when: you want the shortest entrypoint into this repository.
Source of truth for: setup commands and the top-level package map.
Not source of truth for: domain terms, package boundaries, or test policy.

Side Chat is a starter framework for adding an AI assistant to an existing web
product. Teams clone or fork this repository, adapt the source, and own the
resulting application. The host app keeps its UI, auth, data, and permissions;
this starter supplies the widget, service, runtime, tools, streaming, protocol,
and the tests and governance needed to change them safely.

## Features

- **Starter-owned embeddable widget.** A React widget mounts into the team's host
  app over an iframe, isolated from host styles. The adopting team owns the frame,
  proxy, deployment, and any product-specific changes.
- **Server-owned streaming.** Generation runs on the server, not tied to a
  socket: the active tab streams live, a reload reads the finished answer from
  the database, and a user cancel genuinely aborts the provider call.
- **Tool calling.** A built-in tool-calling loop lets the model call registered
  runtime tools, with a clean seam to add your own.
- **Host commands.** A host bridge lets the assistant trigger actions in the host
  app (navigate, fill, run a host-owned command) — not just return text.
- **Provider-neutral.** Pluggable model adapters (OpenAI / Azure / a deterministic
  fake) behind one contract, so product logic never couples to a vendor.
- **Versioned protocol.** A stable browser protocol (`sidechat.v1`) with SSE
  codecs and strict sequence validation between backend and any client.
- **Enterprise-oriented seams.** First-class context redaction, authorization,
  and per-conversation activity streams. Approval is intentionally absent from
  the alpha surface: teams that need it must add a durable workflow and matching
  UI before exposing a mutation that requires a human decision.
- **Adoptable, not invasive.** The host keeps its UI, auth, data, and permissions;
  the framework owns only the assistant.

## Architecture at a glance

Four layers. Dependencies point inward; each layer knows only the contract beside
it. Two contract packages cross the boundaries: `chat-protocol` (browser↔service)
and `ai-runtime-contract` (core↔runtime).

| Layer   | Packages                          | Role                                                           |
| ------- | --------------------------------- | -------------------------------------------------------------- |
| Browser | `side-chat-widget`, `host-bridge` | Render chat; seam to host UI, auth, and commands.              |
| Service | `apps/partner-ai-service`         | Hono root: routes, SSE transport, server-owned turn runner.    |
| Core    | `partner-ai-core`                 | Product workflow, policy, `RuntimeEvent` → `sidechat.v1`.      |
| Runtime | `agent-runtime`                   | Run one prepared turn against a provider; emit `RuntimeEvent`. |

A message travels inward to a provider; events travel back out, translated once
per boundary. Live turns flow over SSE; the conversation list, history, and model
catalog come over TanStack Query.

```txt
host app
  -> side-chat-widget   createSideChatApiClient
  -> chat-protocol      ChatStreamRequest (sidechat.v1)
  -> partner-ai-service POST /chat/runs  ->  forks a server-owned fiber
  -> partner-ai-core    prepare turn + run generation
  -> ai-runtime-contract AiRuntimeRequest
  -> agent-runtime      run executor against provider + runtime tools
```

For the whole system on one page, read
[docs/architecture/system-map.md](docs/architecture/system-map.md).

## Engineering decisions worth a look

These are the parts that show judgment, not just feature wiring.

- **Connection-bound, server-owned streaming.** Generation runs on a
  server-owned fiber that outlives the socket; live events flow through an
  in-memory per-instance registry, and Postgres holds the durable final state —
  the claude.ai model, chosen over a durable event log for simplicity
  (ADR [0007](docs/adr/0007-connection-bound-streaming.md)). Cross-instance
  cancel, activity, and host-command result signals ride PostgreSQL
  `LISTEN/NOTIFY`, no Redis.
- **Three event vocabularies, mapped once per boundary.** Provider stream parts →
  `RuntimeEvent` → `sidechat.v1`. Each conversion happens in exactly one place, so
  no layer leaks the layer beneath it.
- **Strict package boundaries, enforced by tooling.** Provider SDKs stay inside
  `agent-runtime`; the widget is Effect-free and provider-free; `hono` lives only
  in the service. These are invariants, not conventions.
- **Effect v4 throughout the core/server path**, with Promise / `ReadableStream`
  conversions confined to transport edges.

## How this repo is built with AI

This codebase is built with heavy AI assistance, under a harness that keeps AI
output at production standard instead of letting it drift.

- **Agent rulebook + context cards.** [AGENTS.md](AGENTS.md) and per-package
  READMEs give agents a mandatory reading path, boundary rules, and a clean
  final-state policy, so changes land inside the architecture.
- **Reusable agent skills.** `.agents/skills` holds code-quality, documentation,
  and testing-architecture skills with eval prompts and readability rubrics —
  prompting turned into a repeatable, reviewable process.
- **Deterministic governance gates.** `scripts/run-custom-lints.mjs` runs ~14
  custom checks: package boundaries, runtime/Effect separation, dependency and
  version policy, vocabulary consistency, and a **human cognitive-load budget**
  (bounded complexity and nesting). Non-compliant AI output fails before review.
- **Docs as a quality gate.** Durable docs carry a reader/source contract and a
  prose-density limit, both enforced — this very file is checked by that gate.

The point: AI as a force multiplier under engineering control, optimized for the
next human maintainer rather than for the model.

## Tech stack

| Area     | Choices                                                         |
| -------- | --------------------------------------------------------------- |
| Language | TypeScript (strict), Node 24, Effect v4                         |
| AI       | AI SDK 6, provider-neutral runtime, tool-calling loop           |
| Backend  | Hono service, Drizzle ORM, PostgreSQL (`LISTEN/NOTIFY`)         |
| Frontend | React 19, TanStack Query, Tailwind, iframe-isolated widget      |
| Tooling  | oxlint, oxfmt, Vitest, Playwright, testcontainers, custom lints |

## Adopt this starter

This repository is the product starting point, not an npm library that hides its
internals. Pick the shortest path that matches the change your team needs:

| Contributor path      | Start with                                                                                                                                                                          | Customize next                                                                                                                        |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| New to the repo       | Run the fake local stack below, then read the [Walkthrough](docs/README.md#reading-paths).                                                                                          | Edit the typed [`sidechat.config.ts`](apps/partner-ai-service/sidechat.config.ts) and keep the fake provider while learning the flow. |
| Product integrator    | Read the [iframe embedding guide](docs/operations/embed-widget-iframe.md) and [configuration guide](docs/operations/configuration.md).                                              | Wire the host proxy, real auth verifier, provider credentials, Postgres, and host bridge.                                             |
| Framework contributor | Read the [system map](docs/architecture/system-map.md), [package boundaries](docs/architecture/package-boundaries.md), and [extension seams](docs/architecture/extension-seams.md). | Change core, runtime, protocol, or persistence behind their owning contracts and run the full gate.                                   |

Keep `sidechat.v1` deliberate even when your team owns both ends: it is the
browser/service trust boundary and protects the widget from server internals.

## Run it locally

```sh
npm install
npm run dev --workspace @side-chat/partner-ai-service
npm run dev --workspace @side-chat/widget-harness -- --host 127.0.0.1
```

Or start the backend + widget with one command (no Docker, no API key,
in-memory persistence, seeded demo chats):

```sh
node scripts/run-local-fake.mjs --yes
```

This starts only the two servers; **your own app is the host** — proxy `/side-chat-api`
and `/side-chat-frame` to them and embed the iframe (see
[docs/operations/embed-widget-iframe.md](docs/operations/embed-widget-iframe.md)). Do not
put secret values in docs or committed examples. See
[docs/operations/local-development.md](docs/operations/local-development.md).

## Verify

| Command                | Proves                                              |
| ---------------------- | --------------------------------------------------- |
| `npm run format:check` | Oxfmt style is stable.                              |
| `npm run lint:oxlint`  | Oxlint rules and TypeScript-aware lint pass.        |
| `npm run typecheck`    | Strict TypeScript contracts compile.                |
| `npm test`             | Deterministic Vitest scenarios pass.                |
| `npm run lint:custom`  | Side Chat boundary and readability governance pass. |
| `npm run verify`       | The local full gate passes.                         |

Supported runtimes are Node `>=24.15.0 <25.0.0` and npm `>=11.12.0 <12.0.0`. For a
reproducible run on the pinned fixture runtime:

```sh
npx -p node@24.16.0 -p npm@11.15.0 npm run verify
```

## Where to read next

| Need                     | Document                                                                           |
| ------------------------ | ---------------------------------------------------------------------------------- |
| Documentation map        | [docs/README.md](docs/README.md)                                                   |
| Whole system on one page | [docs/architecture/system-map.md](docs/architecture/system-map.md)                 |
| Assistant turn lifecycle | [docs/architecture/assistant-turn.md](docs/architecture/assistant-turn.md)         |
| Package boundaries       | [docs/architecture/package-boundaries.md](docs/architecture/package-boundaries.md) |
| Canonical terms          | [docs/domain/vocabulary.md](docs/domain/vocabulary.md)                             |
| Agent rules              | [AGENTS.md](AGENTS.md)                                                             |

## Maintainer

Built and maintained by **Serhii Haniuk** — senior software engineer working
across frontend, backend, and AI infrastructure.

- LinkedIn: [linkedin.com/in/serhiihaniuk](https://linkedin.com/in/serhiihaniuk)
- GitHub: [github.com/serhiihaniuk](https://github.com/serhiihaniuk)
- Email: serhii.haniuk@gmail.com
