# widget-harness

Read this when: editing the browser harness or Playwright scenarios.
Source of truth for: this harness's ownership, public surface, and local
boundaries.
Not source of truth for: production host app behavior.

## Owns

- Vite app for widget development.
- Vite host proxy for local iframe embedding scenarios.
- Mock-stream, legacy local-service, and v7 workflow-service harness modes.
- Fake host bridge behavior for browser scenarios.
- Playwright-visible harness pages.

## Does Not Own

- A production host application.
- Service/product policy.
- Provider configuration.
- Widget package internals beyond harness integration.

## Public Surface

Harness app entrypoint, browser mode selection, and E2E scenarios.

## Main Flows

```txt
harness mode -> widget props/client/host bridge -> visible browser scenario
host proxy -> /side-chat-frame iframe UI + /side-chat-api service API
```

Use `?mode=workflow-service&authToken=local-test-token&conversationId=conversation-1`
to exercise the native `useChat` transport against the v7 service. This mode is
separate from `local-service`, which remains the legacy protocol regression path.

## Boundary Rules

- Keep scenarios readable and user-visible.
- Do not encode production deployment assumptions.
- Use fake provider/mock stream only as explicit development/test modes.

## Tests

- `src/**/*.test.ts`
- E2E specs under `e2e`

## Canonical Docs

- `docs/architecture/widget-and-host-integration.md`
- `docs/operations/verification.md`
