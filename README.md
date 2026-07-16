# Side Chat

Read this when: you want the shortest entry point into this repository.
Source of truth for: setup commands and the top-level package map.
Not source of truth for: domain terms, lifecycle details, or package boundaries.

Side Chat is a pre-alpha starter for embedding an AI assistant in an existing web
product. The host keeps its UI, authentication, data, and permissions. This
repository supplies the React widget, durable service, client-tool bridge,
persistence, local harness, and verification gates.

## Architecture

There is one retained execution path:

```txt
host app
  -> side-chat-widget
  -> AI SDK UI message stream over HTTP
  -> apps/side-chat-service
  -> Workflow DevKit durable turn
  -> AI SDK 7 model and server tools
  -> PostgreSQL product records + Workflow journal
```

| Area                          | Ownership                                                                                            |
| ----------------------------- | ---------------------------------------------------------------------------------------------------- |
| `apps/side-chat-service`      | Hono routes, configuration, auth, durable workflows, AI SDK providers and tools, shutdown, telemetry |
| `packages/db`                 | Drizzle schema, migrations, product repositories, activity notifications                             |
| `packages/stream-profile`     | Browser-safe error, finish, metadata, header, and data-part vocabulary                               |
| `packages/host-bridge`        | Browser page context and native client-tool capability/dispatch seam                                 |
| `packages/side-chat-widget`   | React UI, conversation state, native stream projection, reconnect, approvals, client tools           |
| `test-harness/widget-harness` | Local host page and browser verification surface                                                     |

The browser validates service data at its boundary. Provider details remain in
the service. The widget does not import server, database, Hono, or provider
internals. See [the system map](docs/architecture/system-map.md) and
[package boundaries](docs/architecture/package-boundaries.md).

## Run locally

Requirements: Node `>=24.15.0 <25.0.0` and npm `>=11.12.0 <12.0.0`.

```sh
npm install
npm run dev
```

`npm run dev` builds the testing service, starts the deterministic fake service
on port 3000, and starts the widget harness on port 5175. No provider key or
Docker is required. The launcher prints the exact browser URL.

For persistent database work, read
[local development](docs/operations/local-development.md) and
[database operations](docs/operations/database.md).

## Verify

| Command                     | Proves                                            |
| --------------------------- | ------------------------------------------------- |
| `npm run format:check`      | Formatting is stable.                             |
| `npm run lint:oxlint`       | TypeScript-aware lint passes.                     |
| `npm run typecheck`         | Strict TypeScript contracts compile.              |
| `npm test`                  | Deterministic Vitest scenarios pass.              |
| `npm run build`             | Project references and production service build.  |
| `npm run lint:custom`       | Repository boundaries and governance pass.        |
| `npm run test:e2e`          | Workflow widget browser scenarios pass.           |
| `npm run test:db:container` | Disposable PostgreSQL integration scenarios pass. |
| `npm run verify`            | Complete local non-container gate.                |

Pinned verification:

```sh
npx -p node@24.16.0 -p npm@11.15.0 npm run verify
```

## Read next

- [Documentation map](docs/README.md)
- [Canonical vocabulary](docs/domain/vocabulary.md)
- [Assistant turn lifecycle](docs/architecture/assistant-turn.md)
- [Widget and host integration](docs/architecture/widget-and-host-integration.md)
- [Verification guide](docs/operations/verification.md)
- [Agent instructions](AGENTS.md)

## Maintainer

Built and maintained by **Serhii Haniuk**.

- [LinkedIn](https://linkedin.com/in/serhiihaniuk)
- [GitHub](https://github.com/serhiihaniuk)
- serhii.haniuk@gmail.com
