# Side Chat

Side Chat is an embeddable assistant product. This repository owns the product protocol, browser client, React widget, host bridge contract, backend core, assistant runtime, concrete adapters, database boundary, and test harnesses.

It does **not** own a consuming host application or demo dashboard. External host apps integrate through the stable boundary:

```txt
external host app -> side-chat-widget -> chat-client -> chat-protocol -> partner-ai-service -> backend-core -> assistant-runtime -> adapters
```

The browser/backend contract is product-owned and must not expose provider-native stream parts, AI SDK internals, database rows, or host-app implementation details. See `docs/architecture/production-system-design.md` for the source of truth.

Local service smoke runs through the fake-provider compose path:

```sh
docker compose up --build partner-ai-service
```

Operational rollout, rollback, and verification steps live in `docs/ops/side-chat-production-runbook.md`.
