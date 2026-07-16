# Local Development

Read this when: you want the service and widget harness running locally without Docker or credentials.
Source of truth for: `npm run dev` / `scripts/run-local-fake.mjs`, its processes, ports, and local fake configuration.
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
| Widget harness    | `http://127.0.0.1:5175/?mode=service...` | Vite page connected to the service.                                             |

The launcher waits for both HTTP surfaces and prints the complete widget URL. `Ctrl+C` terminates both child processes. It does not install dependencies, prompt for provider credentials, mutate config, or start PostgreSQL.

## Port overrides

Set these before launching:

| Environment variable          | Default | Meaning                   |
| ----------------------------- | ------: | ------------------------- |
| `SIDECHAT_LOCAL_SERVICE_PORT` |  `3000` | Service listener port.    |
| `SIDECHAT_LOCAL_WIDGET_PORT`  |  `5175` | Widget harness Vite port. |

Only valid integer ports from 1 through 65535 are accepted; invalid values fall back to the defaults. Vite uses `strictPort`, so a collision fails visibly rather than selecting a different port.

## Local identity and provider

The launcher selects `SIDECHAT_CONFIG=fake`. The widget URL uses the fake config's local bearer and workspace (`local-test-token`, `local-workspace`) and disables client tools in the default harness link. The scripted model and in-memory product store require no external credentials.

The local Workflow world owns its own development data directory/configuration. Production durability and database behavior require the PostgreSQL workflows described in [database.md](database.md) and the lifecycle tests in [verification.md](verification.md).

## Run another configuration

For OpenAI or Azure, run the service workspace directly with the required environment references for the chosen `sidechat*.config.ts`, then point the widget harness at that service. Do not put real credentials in command history, docs, URLs, or the fake launcher.

Configuration names and environment keys are documented in [configuration.md](configuration.md). The service workspace commands are listed in [`apps/side-chat-service/README.md`](../../apps/side-chat-service/README.md).
