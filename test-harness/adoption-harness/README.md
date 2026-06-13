# adoption-harness

Read this when: editing cross-package adopter golden-path tests.
Source of truth for: adoption-harness ownership, public surface, and local
boundaries.
Not source of truth for: production deployment or browser-only widget harness
behavior.

## Owns

- Vitest scenarios that prove adopter-shaped flows across service, core,
  runtime, protocol, client, and widget state seams.
- Deterministic in-process service composition for adoption checks.

## Does Not Own

- Browser harness pages or Playwright scenarios.
- Production host app deployment behavior.
- Provider SDK behavior beyond normalized fake-runtime events.

## Public Surface

No runtime API. `src/index.ts` exists only to satisfy workspace package shape.

## Main Flows

```txt
adopter service config -> policy/context/runtime -> sidechat.v1 events
  -> chat-client decoding -> widget state projection
```

## Boundary Rules

- Use deterministic in-memory repositories and fake providers.
- Assert public seams and durable records, not Hono or provider internals.
- Keep browser-visible scenarios in `test-harness/widget-harness`.

## Tests

`src/**/*.test.ts`

## Related Docs

- `docs/architecture/stream-chat-flow.md`
- `docs/architecture/testing-and-verification.md`
