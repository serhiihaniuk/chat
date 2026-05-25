# Widget And Service E2E Plan

Date: 2026-05-25

## Goal

Exercise the actual browser widget against the actual `partner-ai-service`
process while keeping expensive or non-deterministic dependencies mocked.

The e2e lane must prove this path:

```txt
Playwright browser -> widget-harness -> SideChatWidget -> chat-client -> Hono service -> partner-ai-core -> agent-runtime -> mocked model/provider -> mocked DB
```

## Test Environment

Playwright starts two isolated local servers:

- widget harness on `127.0.0.1:5174`;
- partner AI service on `127.0.0.1:3101`.

The service runs with:

- `SIDECHAT_PROFILE=development`;
- `SIDECHAT_PROVIDER=fake`, which is the mocked model provider;
- `SIDECHAT_ENABLE_DEV_TOOLS=true`, which is allowed only in development;
- no `SIDECHAT_DATABASE_URL`, which selects memory repositories as the mocked DB;
- `SIDECHAT_AUTH_BEARER_TOKEN=local-compose-token`;
- `SIDECHAT_POLICY_MODE=allow_all`;
- e2e-only tenant/workspace ids.

This keeps the backend real while avoiding OpenAI credentials and Postgres.

## Required Coverage

The e2e spec covers the product behavior, not implementation details:

- harness loads in `mock-stream` mode for fast UI smoke;
- service `/healthz` reports mocked model and memory persistence;
- widget sends a message through `local-service`;
- `/chat/stream` returns `200`;
- user and assistant messages render in the real widget;
- one Thinking / Thought for N seconds section is visible from the real service
  stream;
- `/usage` records tokens through the memory repository;
- `mock-stream` mode renders registered-tool activity fixtures through the same
  widget projection used by service streams;
- service integration tests cover the runtime -> partner-ai-core ->
  `sidechat.activity` tool mapping with running/completed rows;
- `sidechat.activity` renders a single ordered timeline;
- tool activity renders through the widget tool component with parameters,
  result, error, and sources in an open-by-default expandable row;
- only the current activity row appears running;
- completed activity rows do not reorder or visually reactivate after later
  events.

The e2e lane also covers:

- conversation id continuity and `/chat/history` assertions;
- reset/new-chat e2e behavior;
- host command dispatch and failed host command rendering;
- model picker selecting multiple allowed mocked profiles;
- context selection changing host context sent to the backend;
- mobile viewport smoke;
- visual regression checks for clipped/overlapping controls.

## Commands

Run only the e2e lane:

```sh
npm run test:e2e
```

Run the full repository gate separately:

```sh
npm run verify
```
