# Backend Boundaries

`packages/partner-ai-core` follows hexagonal boundaries:

- `domain/` contains pure authority and product concepts.
- `application/` contains use cases such as `stream-chat`.
- `ports/` contains interfaces for runtime, persistence, authorization, policy, and observability.
- `policies/` contains pure decision logic.
- `errors/` contains typed application errors.
- `services/` contains Effect runtime service tags and layers.

Infrastructure packages and apps implement ports. Backend core must not import Hono, Drizzle, Postgres, React, widget code, browser clients, or provider SDKs.
