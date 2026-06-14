# side-chat-widget

Read this when: editing the embeddable React widget.
Source of truth for: this package's ownership, public surface, and local
boundaries.
Not source of truth for: backend workflow or protocol definitions.

## Owns

- Public React widget API.
- FSD layers for chat, conversation, prompt, panel, and shared UI.
- Protocol event projection into widget message/activity state.
- Host bridge usage from browser UI.

## Does Not Own

- `sidechat.v1` protocol definitions.
- Agent runtime, provider, or tool execution.
- Service persistence or auth.
- Effect workflows.

## Public Surface

`src/index.ts` exports the side-chat widget API.

`@side-chat/side-chat-widget/testing` exports widget model projection helpers
for harness tests. It is not a host application API.

## Main Flows

```txt
user submit -> optimistic widget state -> chat-client stream
  -> protocol events -> widget messages/activity
```

## Boundary Rules

- Do not import Effect, Hono, DB, provider SDKs, or runtime internals.
- Keep stream mechanics in feature/model code, not prompt/footer rendering.
- Treat `src/shared/ai/**` as copied visual primitives, not project style.

## Tests

Widget unit/model tests and harness E2E tests.

## Canonical Docs

- `docs/architecture/widget-and-host-integration.md`
- `docs/architecture/runtime-and-protocol-events.md`
- `packages/side-chat-widget/src/shared/ai/README.md`
