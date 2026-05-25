# Agent Guide

## Architecture guardrails

Read `docs/CONTEXT.md` and `docs/architecture/overview.md` before changing
package boundaries. The production source of truth is
`docs/architecture/production-system-design.md`.

Core/server workflows are Effect-first:

- `packages/partner-ai-core` exposes `streamChatEffect(input)` through Effect
  services/layers.
- `packages/agent-runtime` exposes `streamEffect(request)` as its only
  assistant-turn stream surface.
- Do not add package-level Promise or `AsyncIterable` facades for those
  workflows. Convert Effect streams only at transport edges such as HTTP/SSE.
- Expected failures inside Effect workflows use `Effect.fail`, `Effect.try`, or
  `Effect.tryPromise`. A raw `throw` is a defect, not product control flow.

Ownership rules:

- Context-board construction, squashing, redaction, authorization, manifests,
  and persistence belong in `partner-ai-core` workflows with app-owned ports.
  `agent-runtime` receives only the prepared `RuntimeContextBoard` and renders
  it for the model.
- Concrete tools live in the app/service adapter layer as ports. Inject tools
  into `agent-runtime` through the `RuntimeTool` protocol; do not make
  `agent-runtime` a product tool catalog.
- AI SDK and provider-native stream parts stay inside `packages/agent-runtime`.
  `chat-protocol`, `chat-client`, and `side-chat-widget` must never expose AI
  SDK UI messages or provider DTOs.
- Browser/client/widget public APIs stay plain TypeScript/React-friendly and
  must not require consumers to run Effect programs.

Constants use exported uppercase constant objects and uppercase properties
(`RUNTIME_EVENT_TYPES.OUTPUT_DELTA`, not repeated string literals or camel-case
constant properties).

## Agent skills

### Side Chat testing architecture

Use this skill when writing, reviewing, or refactoring tests in the Side Chat
monorepo. Covers Vitest unit, contract, service, and integration tests; Testing
Library widget tests; Playwright harness tests; sidechat.v1 protocol contracts;
package boundary leakage; fake providers; memory repositories; and deterministic
test strategy.

This skill follows the portable Agent Skills `SKILL.md` folder shape.
See `.agents/skills/side-chat-testing-architecture/SKILL.md`.
