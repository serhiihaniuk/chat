# Requirements

Read this when: you need the intended product and quality requirements.
Source of truth for: Side Chat behavior, safety, durability, readability, and adoption requirements.
Not source of truth for: package ownership, implementation plans, or provider-specific details.

## Product behavior

- Side Chat is an embeddable assistant foundation for ordinary web applications.
- A host app can embed the widget, provide governed page context and client tools, and receive a stable streamed assistant experience.
- The service authenticates and scopes every conversation, turn, stream, cancel, tool result, and approval request by tenant, workspace, and subject.
- A valid turn produces the native AI SDK UI-message stream profiled by `@side-chat/stream-profile`.
- Invalid setup fails as a safe HTTP error before the public stream starts.
- Each `requestId` starts at most one durable turn and Workflow run; exact retries reuse it.
- Conversations expose one authoritative product snapshot. Live stream state reconciles into durable history after terminal.
- Success, failure, cancellation, timeout, and content filtering remain distinguishable terminal outcomes.

## Tools, context, and execution

- Workflow DevKit owns durable execution, waits, replay journal, queueing, and crash recovery.
- AI SDK 7 owns model streaming and native text, reasoning, source, file, tool, approval, and terminal parts.
- Server tools execute inside the service and are selected from a closed configured registry.
- Server tools that require human approval suspend on a durable approval hook before execution.
- Client tools execute only in the originating browser tab under high-entropy capability authority; passive watchers cannot invoke them.
- Client-tool and approval outputs bind to one owned durable wait and resume it at most once.
- Optional host context is validated, bounded, and rendered as untrusted user-provided reference material. It never becomes identity, authorization, or system instructions.
- Provider SDK values, prompts, private context, raw errors, Workflow records, and database rows never cross into browser packages.

## Durability and capacity

- New turns acquire bounded per-process admission before any durable product write.
- Overload returns `503` with retry guidance and leaves no message, turn, Workflow run, or tool authority residue.
- Exact replays bypass new admission and attach to the existing durable run.
- Every admitted turn reaches one durable terminal product state, including after cancellation, timeout, or process restart.
- Product terminal projection and its activity notification commit atomically.
- Workflow journal retention skips active runs and legal holds and is safe under concurrent maintenance.

## Security and privacy

- Request authority is checked before persistence, private context, replay, cancellation, or tool output is exposed.
- Secrets are not committed, copied into docs, serialized into Workflow input, logged, or sent to the browser.
- Raw client-tool capabilities stay in the originating tab; only their digest may enter durable authority records.
- Public errors use a closed, content-free vocabulary. Raw provider, database, prompt, and tool errors stay private.
- Activity notifications contain identity/lifecycle data only, never conversation content or tool payloads.
- Untrusted input is validated at its owning HTTP, host-bridge, stream-profile, or database boundary.

## Quality and architecture

- Code is readable by a lower-context human maintainer and follows named, top-down lifecycle stages.
- Keep policy, execution, persistence, transport, projection, rendering, and error mapping in their owning layers.
- Browser packages remain free of Node-only modules, database clients, Workflow internals, and provider SDK DTOs.
- Hono and provider execution stay in the service; PostgreSQL/Drizzle stay in `@side-chat/db`.
- Public wire additions use native AI SDK parts first; a Side Chat `data-*` part requires a schema, consumer, and privacy review.
- Docs have one owner per topic and describe current code, not implementation history.
- Widget controls and terminal/tool/approval states remain keyboard and screen-reader accessible.

## Adoption

- Adopters can find where to configure models, add server/client tools, provide host context, add telemetry, and customize rendering.
- Model and reasoning choices are constrained to the authenticated service catalog.
- The repository ships a local widget harness, not a first-party production host application.
- Copied visual primitives under `packages/side-chat-widget/src/shared/ai/**` are quarantined and are not a style or architecture source.

## Out of scope

- A first-party production host application.
- Provider-native browser contracts.
- Raw model-callable multi-agent orchestration.
- Production deployment guidance for infrastructure that has not been selected.
