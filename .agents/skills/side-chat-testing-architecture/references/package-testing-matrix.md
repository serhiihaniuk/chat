# Package Testing Matrix

Package boundaries are architecture. Tests should protect those boundaries instead of bypassing them.

| Package | Owns | Primary test types | Preferred doubles | Avoid |
|---|---|---|---|---|
| `packages/chat-protocol` | Product DTOs, validation, event types, SSE encoding, generated schema, protocol fixtures | unit, contract, fixture/schema | protocol fixtures | provider/UI/DB/HTTP leakage |
| `packages/chat-client` | Browser-safe typed stream transport and SSE decoding | unit, integration-style transport | fake fetch/transport, controlled stream | React state, backend framework leakage, real network |
| `packages/host-bridge` | External host integration contract | unit, contract | fake host messages | production host assumptions |
| `packages/side-chat-widget` | React UI/state, trimmed FSD structure | component, static render, harness E2E | fake chat client, fake host bridge | hook internals, CSS selectors, backend implementation details |
| `packages/partner-ai-core` | Domain rules, policy, use cases, ports, typed errors, Effect service wiring | unit, use-case, port contract | fake ports, memory repos, fake providers | Hono/Drizzle/Postgres/provider SDK leakage |
| `packages/agent-runtime` | AI SDK runtime, provider registry, provider adapters, fake provider, runtime tools, normalized runtime events | unit, contract, adapter tests | fake provider, fake tools | leaking provider-native events |
| `apps/partner-ai-service` | Hono routes, HTTP concerns, config, auth/policy/persistence adapters, service composition | route, service, integration | memory repos, fake providers | Hono internals outside route boundary, real Postgres by default |
| `packages/db` | Drizzle schema, migrations, repository contracts, memory repos, Postgres adapters | repository contract, opt-in DB integration | memory repos, local Postgres | DB rows leaking into protocol |
| `packages/testing` | Shared test builders and protocol helpers | unit | minimal builders | opaque global fixtures |
| `test-harness/widget-harness` | Local Vite/Playwright browser verification | Playwright E2E | harness server, route for browser edge cases | arbitrary sleeps, brittle selectors |

## Package-specific priorities

### `packages/chat-protocol`

Test:

- `sidechat.v1` DTO contract
- request validation success and failure cases
- protocol fixtures
- schema generation and compatibility
- SSE event encoding shape
- no provider-native stream parts
- no AI SDK UI messages
- no database rows
- no HTTP framework objects

### `packages/chat-client`

Test:

- typed request construction
- SSE decoding
- malformed event handling
- abort/cancellation behavior
- retry behavior only if implemented as client behavior
- browser-safe public API
- no React coupling
- no backend framework leakage

### `packages/host-bridge`

Test:

- host command shape
- host context boundary
- validation of host-originated messages
- safe handling of missing/invalid host data
- no production host app assumptions

### `packages/side-chat-widget`

Test:

- user-visible widget behavior
- accessible interactions
- loading, disabled, error, empty, and streaming states
- integration with `chat-client` through a seam
- integration with `host-bridge` through a seam
- no hook internals just to prove hooks were called

### `packages/partner-ai-core`

Test:

- domain rules
- use-case behavior
- policy enforcement
- typed error mapping
- port interactions at public boundaries
- Effect service wiring as behavior, not internals
- no Hono, Drizzle, Postgres, provider SDK, or HTTP leakage

### `packages/agent-runtime`

Test:

- provider registry behavior
- provider adapter normalization
- fake provider determinism
- runtime tool behavior
- normalized runtime events
- cancellation/error paths
- no provider-native event leakage outside runtime boundary

### `apps/partner-ai-service`

Test:

- HTTP route behavior
- auth/policy enforcement
- config parsing failures
- persistence adapter integration through ports
- mapping domain errors to HTTP/SSE responses
- service composition
- no HTTP framework objects leaking into protocol/core contracts

### `packages/db`

Test:

- repository contracts
- memory repository behavior
- real Postgres adapter behavior in opt-in integration suite
- migration/schema compatibility
- no database rows leaking into `sidechat.v1`
