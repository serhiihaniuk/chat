# Target Architecture Summary

Status: supporting summary

The canonical system design now lives in [../../SYSTEM-DESIGN.md](../../SYSTEM-DESIGN.md). Read that file for the full architecture narrative and first-principles explanation.

This file stays intentionally compact so architecture details do not drift across multiple documents.

## One-Sentence Target

A modular monolith with vertical slices and lightweight ports/adapters: the chat product contract is typed in TypeScript, the widget consumes a stable `sidechat.v1` protocol, Hono translates HTTP, Effect clarifies typed workflow boundaries where useful, AI SDK stays in provider adapters, and Postgres stays behind stored-procedure-backed DB access.

## Target Boundary Map

```txt
Embedded Workbench Host
  -> side-chat-widget package
    -> shared sidechat.v1 protocol
      -> Hono inbound adapter
        -> application use cases
          -> ports
            -> AI SDK model adapter
            -> conversation repository adapter
            -> usage adapter
            -> Workbench tools adapter
            -> report adapter
            -> observability/config/auth/rate/billing adapters
```

## Boundary Rules To Preserve

- The browser consumes `sidechat.v1`, not provider-native stream parts.
- Hono stays an inbound adapter.
- AI SDK stays a provider adapter.
- Effect is used for typed errors, dependencies, resource lifetime, and workflows where that meaning is useful.
- The widget stays reusable and host-agnostic.
- The host app owns its dashboard UI and host command behavior.
- Dashboard data access stays behind an explicit API/DB boundary.
- Runtime Postgres access goes through `packages/db` and stored procedures/functions.

## Current Transition Notes

- Current code is mapped in [current.md](./current.md).
- Refactor order and stop rules live in [transition-roadmap.md](./transition-roadmap.md).
- The Workbench tools adapter inside the chat API is an explicit monorepo transition point.
- Effect adoption is intentionally narrow until it clarifies real workflow/dependency boundaries.

## Deep References

- [../../SYSTEM-DESIGN.md](../../SYSTEM-DESIGN.md)
- [../learning/hexagonal-architecture.md](../learning/hexagonal-architecture.md)
- [../learning/effect-ts.md](../learning/effect-ts.md)
- [../learning/ai-sdk-streaming-and-tools.md](../learning/ai-sdk-streaming-and-tools.md)
- [../learning/frontend-backend-boundaries.md](../learning/frontend-backend-boundaries.md)
