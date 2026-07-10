# ADR 0004: sidechat.v1 Is The Product Protocol

Status: accepted (rebaselined 2026-07-01, expanded 2026-07-02)

## Context

The widget, the service, test fixtures, and future partner integrations all
speak over one wire. Between any two of them, ad hoc DTOs drift silently — and
wire drift surfaces as production breakage in the least debuggable place: a
browser rendering events it half-understands.

## What it buys here

| Capability                              | In this repo                                                                                                                                                                                                    | Without it                                                                          |
| --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| **One strictly validated contract.**    | Hand-written validators whitelist fields per event and reject unknown types and keys; tests prove DB rows, runtime events, and provider parts are rejected; SSE frame/payload cross-checks stop event spoofing. | Duck-typed payloads where a leaked internal object "mostly works" until it doesn't. |
| **Versioned evolution.**                | Every event and request carries `protocolVersion`; sources live under `src/sidechat-v1/`; old clients fail loudly, not weirdly.                                                                                 | Silent breaking changes discovered by users.                                        |
| **A dependency-free contract package.** | `chat-protocol` depends only on `@side-chat/shared` — no Effect, no React, no zod; safe in any browser bundle.                                                                                                  | The contract dragging server dependencies into every consumer.                      |
| **Activity as product data.**           | The Thinking timeline is driven by `sidechat.activity` events, never provider-native parts or frontend string heuristics.                                                                                       | UI parsing model output with regexes; every provider change breaks the timeline.    |
| **Non-React, non-browser consumers.**   | Plain DTOs + SSE codecs; the widget's own reader consumes the same public codec it ships.                                                                                                                       | A protocol usable only by the bundled widget.                                       |

## Decision

`sidechat.v1` (`packages/chat-protocol`) is the single browser↔service
contract. Service routes, streaming events, widget behavior, the schema JSON,
and OpenAPI artifacts **move together** — a protocol change is a product
change, made deliberately with tests. Event type strings come from centralized
constants, never inline literals.

## Alternatives rejected

- **Zod/io-ts validators** — a runtime dependency and bundle cost against the
  zero-dep goal; hand-written validators are more code but keep the package
  free-standing, and their strictness is itself tested.
- **Reusing provider/AI-SDK stream shapes on the wire** — welds every client
  to a vendor's format; the three-vocabulary design exists to prevent exactly
  this ([runtime-and-protocol-events.md](../architecture/runtime-and-protocol-events.md)).
- **GraphQL / tRPC** — couples consumers to client tooling and fits
  request/response poorly to a one-way SSE streaming contract; the product
  needs a wire spec, not an RPC framework.

## Consequences

Every event shape has one source of truth and strict validation at the trust
boundary. The owned cost: adding an event touches several sync points (union,
validators, codecs, schema, sequence rules), and history proved a miss can slip
through. `protocol-completeness.test.ts` makes an incomplete event addition a
red test.
