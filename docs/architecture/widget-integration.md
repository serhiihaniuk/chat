# Widget Integration

The widget is owned source under `packages/side-chat-widget` and is organized by application, domain, UI primitives, and assets:

- `application/` wires client streams, host bridge inputs, and state projection.
- `domain/message`, `domain/composer`, `domain/panel`, and `domain/model` hold focused product state.
- `ui/primitives` holds copied-in primitive components.
- `assets/images` is the owned image/icon home.

The widget imports only browser-safe packages and public package entrypoints. It has no dependency on partner AI core, agent runtime, DB, Hono, Drizzle, Effect, provider SDKs, or forbidden UI-kit packages.
