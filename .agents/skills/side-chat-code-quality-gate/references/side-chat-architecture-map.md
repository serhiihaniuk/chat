# Side Chat Architecture Map

Use this when code quality intersects package boundaries or ownership.

## Package ownership

```txt
apps/partner-ai-service
  HTTP, config parsing, adapter composition, startup, transport conversion, app-owned tools

packages/chat-protocol
  sidechat.v1 DTOs, constants, validators, SSE codec, generated schema, sequence checks

packages/chat-client
  browser-safe typed stream client

packages/host-bridge
  host context and command boundary

packages/partner-ai-core
  product harness: policy, context, turn lifecycle, manifests, tool exposure decisions, typed product workflows

packages/agent-runtime
  one prepared assistant turn: provider/model execution, runtime tool protocol, AI SDK ToolLoopAgent adapter, normalized runtime events

packages/db
  Drizzle/Postgres schema and repository adapters

packages/side-chat-widget
  React widget, FSD layers, activity UI, prompt, panel, protocol-backed state

packages/testing
  shared test utilities only; production source must not import it
```

## Things that must not leak

- AI SDK provider-native parts outside `agent-runtime`.
- AI SDK UI messages through `sidechat.v1`.
- Hono objects outside service adapters.
- Drizzle/Postgres rows outside `packages/db`.
- Effect runtime details through browser/client/widget public APIs.
- Provider DTOs or raw tool errors through protocol events.
- Test-support files inside production workflow folders.

## Widget layer direction

```txt
app -> widgets -> features -> entities -> shared
```

Higher layers may import lower layers. Lower layers must not import higher layers. Same-level slices must not import each other. `shared` must not import product packages or higher widget layers.

## Dependency ownership reminders

- Hono belongs in `apps/partner-ai-service`.
- pg/Drizzle belong in `packages/db`.
- AI SDK provider/runtime imports belong in `packages/agent-runtime`, except allowed widget usage of the `ai` package under `shared/ai`.
- `process.env` production reads belong in `apps/partner-ai-service/src/config/`.
- Cross-package relative imports are forbidden.

## Refactor direction

Move decisions toward their owner:

- policy/context/tool exposure -> `partner-ai-core`;
- provider/model/tool-loop mechanics -> `agent-runtime`;
- HTTP/config/outbound adapters -> `apps/partner-ai-service`;
- protocol contracts -> `chat-protocol`;
- widget state/rendering -> `side-chat-widget`;
- persistence mechanics -> `db`.

Do not violate ownership merely to make a local file shorter.
