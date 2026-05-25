# Side Chat

Side Chat is an embeddable assistant product. This repository owns the product protocol, browser client, React widget, host bridge contract, partner AI core, agent runtime, concrete adapters, database boundary, and test harnesses.

It does **not** own a consuming host application or demo dashboard. External host apps integrate through the stable boundary:

```txt
external host app -> side-chat-widget -> chat-client -> chat-protocol -> partner-ai-service -> partner-ai-core -> agent-runtime -> adapters
```

The browser/backend contract is product-owned and must not expose provider-native stream parts, AI SDK internals, database rows, or host-app implementation details. See `docs/architecture/production-system-design.md` for the source of truth.

Local service smoke runs through the configured service path. The current local
workspace runs `partner-ai-service` from `.env`, with OpenAI selected through
`SIDECHAT_PROVIDER=openai`, an allowed model list, and medium reasoning by
default. Do not put secret values in docs or committed examples.

```sh
npm run dev --workspace @side-chat/partner-ai-service
npm run dev --workspace @side-chat/widget-harness -- --host 127.0.0.1
```

Open the harness with a local-service URL such as
`http://127.0.0.1:5173/?mode=local-service&authToken=local-compose-token&workspaceId=workspace_local`.

The fake provider and mock-stream harness mode still exist for deterministic
tests and UI development. They are explicit development paths, not the current
local OpenAI smoke path.

Operational rollout, rollback, and verification steps live in `docs/ops/side-chat-production-runbook.md`.
