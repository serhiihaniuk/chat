# Local Development

Read this when: you want the service and widget harness running locally without Docker or credentials.
Source of truth for: local service, widget harness, and design-token configurator commands and ports.
Not source of truth for: deployment configuration ([configuration.md](configuration.md)), database tooling ([database.md](database.md)), or verification commands ([verification.md](verification.md)).

## Quick start

From the repository root:

```sh
npm run dev
```

The launcher first builds the service's testing Workflow bundle, then starts:

| Process           | Default URL                              | Purpose                                                                         |
| ----------------- | ---------------------------------------- | ------------------------------------------------------------------------------- |
| Side Chat service | `http://127.0.0.1:3000`                  | Hono/Nitro API with the credential-free `fake` config and local Workflow world. |
| Widget harness    | `http://127.0.0.1:5175/?workspaceId=...` | Vite page connected to the service.                                             |

The launcher waits for both HTTP surfaces and prints the complete widget URL. `Ctrl+C` terminates both child processes. It does not install dependencies, prompt for provider credentials, mutate config, or start PostgreSQL.

## Run the design-token configurator

Start the docs app independently from the service and widget harness:

```sh
npm run dev:docs
```

Open `http://127.0.0.1:5174`. The app discovers every custom property declared in
`packages/side-chat-widget/styles.css`, groups the tokens for editing, and applies
safe temporary overrides to real widget components inside an isolated Shadow DOM.
Search, modified-only filtering, group reset, global reset, and JSON export operate
only in the browser. The configurator does not send requests or persist overrides.

Run a production bundle check with `npm run build --workspace @side-chat/docs`.

## Zed TypeScript diagnostics

The repository uses native TypeScript 7 for command-line checks and the JavaScript
TypeScript 6 compatibility implementation for editor tooling that still speaks the
`tsserver` protocol. Project-local Zed settings therefore point `vtsls` at
`node_modules/@typescript/old/lib`. Do not point it at `node_modules/typescript/lib`:
the installed `@typescript/typescript6` compatibility package exposes forwarding
shims there, not the complete standard-library and `tsserver` SDK expected by
`vtsls`.

After changing dependencies or this setting, restart Zed's TypeScript language
server so it reloads the workspace SDK. `npm run typecheck` remains the canonical
repository-wide compiler result.

## Port overrides

Set these before launching:

| Environment variable          | Default | Meaning                   |
| ----------------------------- | ------: | ------------------------- |
| `SIDECHAT_LOCAL_SERVICE_PORT` |  `3000` | Service listener port.    |
| `SIDECHAT_LOCAL_WIDGET_PORT`  |  `5175` | Widget harness Vite port. |

The docs app uses fixed port `5174` with Vite `strictPort`. Stop the process that
owns that port before starting the configurator; it never selects another port.

Only valid integer ports from 1 through 65535 are accepted; invalid values fall back to the defaults. Vite uses `strictPort`, so a collision fails visibly rather than selecting a different port.

## Local identity and provider

The launcher selects `SIDECHAT_CONFIG=fake`. The widget URL uses the fake config's local bearer and workspace (`local-test-token`, `local-workspace`) and disables client tools in the default harness link. The scripted model and in-memory product store require no external credentials. Local-development composition seeds `conversation-1` for that static identity; the seed is not a test-harness fixture or a production database migration.

The local Workflow world owns its own development data directory/configuration. Production durability and database behavior require the PostgreSQL workflows described in [database.md](database.md) and the lifecycle tests in [verification.md](verification.md).

## Run another configuration

For OpenAI or Azure, run the service workspace directly with the required environment references for the chosen `sidechat*.config.ts`, then point the widget harness at that service. Do not put real credentials in command history, docs, URLs, or the fake launcher.

Configuration names and environment keys are documented in [configuration.md](configuration.md). The service workspace commands are listed in [`apps/side-chat-service/README.md`](../../apps/side-chat-service/README.md).
