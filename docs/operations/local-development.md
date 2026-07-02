# Local development (no Docker)

Read this when: you want Side Chat running on your machine with one command, no Docker and no Postgres.
Source of truth for: the `scripts/run-local-fake.mjs` launcher — its flags, the two processes and ports, and the fake/openai/azure provider modes.
Not source of truth for: the `SideChatConfig` object (see [configuration.md](configuration.md)), database tooling (see [database.md](database.md)), gate commands (see [verification.md](verification.md)), or the iframe proxy contract (see [embed-widget-iframe.md](embed-widget-iframe.md)).

## Quick start

Run one command from the repo root; it starts the backend and widget for your own app to embed:

```sh
node scripts/run-local-fake.mjs
```

The launcher prompts for provider and ports, installs dependencies if missing, then starts two dev servers (backend + widget UI). By default it uses the **fake** provider: it boots the standalone no-secrets config (`apps/partner-ai-service/sidechat.fake.config.ts`) — an in-memory showcase model, mock tools, and seeded demo chats; no API key, no database. It does **not** start a host page — your own app is the host. Wire your app's dev proxy to the two servers it prints; see [embed-widget-iframe.md](embed-widget-iframe.md).

## Flags

`scripts/run-local-fake.mjs` reads two flags (`run-local-fake.mjs:79-80`):

| Flag        | Effect                                                                                                           |
| ----------- | ---------------------------------------------------------------------------------------------------------------- |
| `--yes`     | Skip all prompts; use the saved file, env vars, then defaults. Auto-applied when stdin is not a TTY (CI, pipes). |
| `--install` | Force `npm install` before starting, even when `node_modules` exists.                                            |

The launcher saves your answers (including any API key) to `scripts/.run-local-fake.json` (`run-local-fake.mjs:119-136`) and reuses them next run. Keep that file out of git.

## The two processes

The launcher starts two Vite/tsx dev servers over npm workspaces:

| Process         | Default URL             | Role                                                                                                 |
| --------------- | ----------------------- | ---------------------------------------------------------------------------------------------------- |
| Backend service | `http://127.0.0.1:8787` | Hono API + chosen provider. Health at `/healthz`.                                                    |
| Widget UI       | `http://127.0.0.1:5174` | Vite widget harness; renders only Side Chat under the frame path. `strictPort`, bind host `0.0.0.0`. |

Your own app is the host. Proxy `/side-chat-api` to the backend and `/side-chat-frame` to the widget UI, then embed the iframe — see [embed-widget-iframe.md](embed-widget-iframe.md). The launcher prints both targets and a ready-to-paste iframe `src`.

### Port rules

The widget never runs on `8080` — that port is usually your own app's. The launcher enforces these guards:

- Widget port `8080` is rejected and forced back to `5174`.
- A backend/widget port collision auto-bumps the backend.
- Both ports free a busy listener by killing it (`freePort`), so a restart binds cleanly.

## Why env is injected, not loaded

The service reads `process.env` synchronously at boot and never auto-loads a `.env` file (`run-local-fake.mjs:21-22`). So the launcher injects every `SIDECHAT_*` key directly into each spawned child (`run-local-fake.mjs:744-781`). To run the service by hand, you must export the same variables yourself. The config object defines which keys exist; see [configuration.md](configuration.md).

## Providers

The launcher offers three providers (prompt at `run-local-fake.mjs:570-636`):

| Provider         | Setup                                                                                                                                               | Persistence               |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- |
| `fake` (default) | None. In-memory showcase model + mock tools.                                                                                                        | In-memory                 |
| `openai`         | Prompts for API key and an optional OpenAI-compatible base URL; boots the default `sidechat.config.ts` (its declared models apply).                 | In-memory (no DB URL set) |
| `azure`          | Prompts for endpoint, key, api-version, and gpt-4o deployment; boots `apps/partner-ai-service/sidechat.azure.config.ts` via `SIDECHAT_CONFIG_PATH`. | In-memory                 |

All three modes delete `SIDECHAT_DATABASE_URL` so persistence stays in-memory. For Postgres-backed runs, see [database.md](database.md).

### Fake provider defaults

When the provider is `fake`, the launcher sets these defaults (`run-local-fake.mjs:746-759`):

- Profile `development` (the config maps `configured` policy to `allow_all` there).
- `SIDECHAT_DEMO_SEED_CONVERSATIONS=true` — seeds demo conversations.
- The `mock_web_search` tool is declared in the fake config itself.

Two demo prompts exercise the fake model (`run-local-fake.mjs:894-897`):

| Prompt  | What it shows                                    |
| ------- | ------------------------------------------------ |
| `hello` | Markdown reply with slow token streaming.        |
| `tool`  | Thinking, then `mock_web_search`, then markdown. |
