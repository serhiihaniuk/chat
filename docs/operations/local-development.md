# Local development (no Docker)

Read this when: you want Side Chat running on your machine with one command, no Docker and no Postgres.
Source of truth for: the `scripts/run-local-fake.mjs` launcher — its flags, the three processes and ports, and the fake/openai/azure provider modes.
Not source of truth for: the `SideChatConfig` object (see [configuration.md](configuration.md)), database tooling (see [database.md](database.md)), gate commands (see [verification.md](verification.md)), or the iframe proxy contract (see [embed-widget-iframe.md](embed-widget-iframe.md)).

## Quick start

Run one command from the repo root, then open the host page it prints:

```sh
node scripts/run-local-fake.mjs
```

The launcher prompts for provider and ports, installs dependencies if missing, then starts three dev servers. By default it uses the **fake** provider: an in-memory showcase model, mock tools, and seeded demo chats — no API key, no database. Open the printed **host page** URL (the embedded workbench), not the raw iframe.

## Flags

`scripts/run-local-fake.mjs` reads two flags (`run-local-fake.mjs:79-80`):

| Flag | Effect |
| --- | --- |
| `--yes` | Skip all prompts; use the saved file, env vars, then defaults. Auto-applied when stdin is not a TTY (CI, pipes). |
| `--install` | Force `npm install` before starting, even when `node_modules` exists. |

The launcher saves your answers (including any API key) to `scripts/.run-local-fake.json` (`run-local-fake.mjs:119-136`) and reuses them next run. Keep that file out of git.

## The three processes

The launcher starts three Vite/tsx dev servers over npm workspaces (defaults at `run-local-fake.mjs:57-59`):

| Process | Default URL | Role |
| --- | --- | --- |
| Backend service | `http://127.0.0.1:8787` | Hono API + chosen provider, in-memory persistence. Health at `/healthz`. |
| Widget iframe app | `127.0.0.1:5174` | Vite widget harness; renders only Side Chat. `strictPort`, bind host `0.0.0.0`. |
| Host page (workbench) | `http://127.0.0.1:8080` | Serves `workbench-embed.html`; proxies UI + API; owns the open/close button. |

**Open the host page**, not the iframe app. The host page embeds the widget and owns the open/close toggle; the iframe app alone has no host chrome. The launcher prints both URLs and labels the iframe one "debug only" (`run-local-fake.mjs:880-887`).

### Port rules

The widget never runs on `8080` — that port belongs to the host/workbench origin. The launcher enforces three guards:

- Widget port `8080` is rejected and forced back to `5174` (`run-local-fake.mjs:668-673`).
- A backend/widget port collision auto-bumps the backend (`run-local-fake.mjs:674-681`).
- Backend and widget ports free a busy listener by killing it (`freePort`, `run-local-fake.mjs:200-219`); the host page instead picks the next open port and never kills a running workbench (`chooseOpenPort`, `run-local-fake.mjs:220-232`).

## Why env is injected, not loaded

The service reads `process.env` synchronously at boot and never auto-loads a `.env` file (`run-local-fake.mjs:21-22`). So the launcher injects every `SIDECHAT_*` key directly into each spawned child (`run-local-fake.mjs:744-781`). To run the service by hand, you must export the same variables yourself. The config object defines which keys exist; see [configuration.md](configuration.md).

## Providers

The launcher offers three providers (prompt at `run-local-fake.mjs:570-636`):

| Provider | Setup | Persistence |
| --- | --- | --- |
| `fake` (default) | None. In-memory showcase model + mock tools. | In-memory |
| `openai` | Prompts for API key, allowed models (first is default), and an optional OpenAI-compatible base URL. | In-memory (no DB URL set) |
| `azure` | Prompts for endpoint, key, api-version, and gpt-4o deployment; boots `apps/partner-ai-service/sidechat.azure.config.ts` via `SIDECHAT_CONFIG_PATH`. | In-memory |

The `fake` and `azure` modes delete `SIDECHAT_DATABASE_URL` so persistence stays in-memory (`run-local-fake.mjs:755`, `:763`). The `openai` mode does not scrub it, but with no database URL set and the `development` profile it also runs in-memory. For Postgres-backed runs, see [database.md](database.md).

### Fake provider defaults

When the provider is `fake`, the launcher sets these defaults (`run-local-fake.mjs:746-759`):

- Profile `development`, policy `allow_all`.
- `SIDECHAT_DEMO_SEED_CONVERSATIONS=true` — seeds demo conversations.
- `SIDECHAT_ENABLE_DEV_TOOLS=true` — enables the `mock_web_search` tool.

Two demo prompts exercise the fake model (`run-local-fake.mjs:894-897`):

| Prompt | What it shows |
| --- | --- |
| `hello` | Markdown reply with slow token streaming. |
| `tool` | Thinking, then `mock_web_search`, then markdown. |
