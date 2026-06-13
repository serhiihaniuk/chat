# Partner AI Core

Read this when: editing product stream-chat workflow, policy, context
preparation, protocol mapping, or core ports.
Source of truth for: this package's ownership, public surface, and local
boundaries.
Not source of truth for: HTTP adapters, database implementation, provider
execution, or widget UI.

## Owns

- `streamChatEffect(input)`.
- Product authorization, policy, context, turn lifecycle, and protocol mapping.
- App-owned ports needed by the stream-chat use case.
- Typed product failures and terminal protocol semantics.
- Effect Layer wiring for core services.

## Does Not Own

- Hono routes or HTTP response writing.
- Drizzle/Postgres implementation.
- Provider SDKs or AI SDK stream parts.
- Widget message/activity rendering.
- Concrete app tools.

## Public Surface

- `streamChatEffect(input)`
- `createPartnerAiCoreLayer(...)`
- Product workflow types and port contracts needed by service adapters.

The package does not expose parallel Promise or `AsyncIterable` facades. Edge
transports convert the Effect stream at their own boundary.

## Main Flow

```txt
StreamChatInput
-> authorize workspace/project scope
-> decide allowed profile/model/tools
-> run turn guards before private context/tools
-> ensure conversation
-> persist user message
-> prepare context and runtime request
-> map RuntimeEvents into sidechat.v1 events
-> emit exactly one terminal event
```

## Boundary Rules

- Context-board construction, redaction, manifests, and persistence decisions
  belong here.
- Agent runtime receives only prepared context and runtime request data.
- Core uses ports for outside IO.
- Expected failures use Effect's error channel.
- Browser-visible output is only `sidechat.v1` protocol events.

## Tests

```sh
npm run typecheck --workspace @side-chat/partner-ai-core
npx vitest run packages/partner-ai-core/src/application/stream-chat/stream-chat.test.ts
npx vitest run apps/partner-ai-service/src/inbound/http/app.test.ts
```

## Related Docs

- `docs/domain/lifecycle.md`
- `docs/architecture/capability-model.md`
- `docs/architecture/stream-chat-flow.md`
- `docs/architecture/boundaries.md`
