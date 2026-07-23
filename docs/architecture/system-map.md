# System map

Read this when: locating an owner, entry point, or cross-package flow.

Source of truth for: current runtime components and their responsibilities.

Not source of truth for: lifecycle order, import rules, wire contracts, or operational commands.

Side Chat is one modular service plus browser packages. AI SDK 7 provides the native message/tool model, Workflow DevKit provides durable execution and replay, and PostgreSQL stores product state and the Postgres World journal.

## Runtime components

| Component                     | Owns                                                                                                                           | Primary entry points                                                                           |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------- |
| `apps/side-chat-service`      | HTTP, auth, turn policy, admission, native stream scrubbing, Workflow bundles, providers, configuration, and process lifecycle | `src/index.ts`, `src/composition/route/production.ts`, `src/workflows/production/chat-turn.ts` |
| `packages/side-chat-server`   | Public authentication, durable actor, server-tool, approval-policy, integration, and adopter-manifest contracts                | `src/index.ts`                                                                                 |
| `packages/db`                 | Product schema/repositories, activity notifications, client-tool and approval rows, Workflow journal maintenance               | `src/index.ts`, `src/repositories/postgres-drizzle/index.ts`                                   |
| `packages/stream-profile`     | Browser-safe error, finish, reasoning, metadata, and client-tool capability vocabulary                                         | `src/index.ts`                                                                                 |
| `packages/side-chat-widget`   | React UI, authenticated browser requests, native stream projection, conversation selection, replay, and activity refresh       | `src/index.ts`                                                                                 |
| `packages/host-bridge`        | Host context providers and browser client-tool capability/dispatch types                                                       | `src/index.ts`                                                                                 |
| `packages/shared`             | Neutral JSON, branding, and record helpers                                                                                     | `src/index.ts`                                                                                 |
| `test-harness/widget-harness` | Browser integration host and Playwright coverage                                                                               | `src/index.ts`, `e2e/`                                                                         |

## Development-only surfaces

`apps/docs` is the local design-system configurator. It reads the widget's public
stylesheet as source data, renders public widget UI exports inside an isolated
Shadow DOM, and applies temporary CSS custom-property overrides to that preview.
It does not call the service, read provider configuration, or persist product data.

The configurator entry point is `apps/docs/src/index.tsx`. Its token catalog is
derived from `packages/side-chat-widget/styles.css`, so a new declared token appears
without a second hand-maintained registry.

## Service structure

`apps/side-chat-service/src` is organized by ownership:

- `sidechat.ts`: adopter manifest that registers the available integrations once.
- `auth`: configured request-authorizer adapters written or selected by adopters.
- `integrations`: concrete external adapters and the server tools that use them.
- `application/ports`: application-owned interfaces with production and deterministic substitutions.
- `application/turn`: admission-aware preparation, stream safety, terminal release, cancellation, and tool decision policy.
- `adapters/http`: Hono validation, auth, routes, SSE encoding, and error mapping.
- `adapters/persistence`: PostgreSQL mappings and explicit in-memory local/test state.
- `adapters/providers`: AI SDK OpenAI and Azure model creation.
- `adapters/capacity`: bounded per-process FIFO admission.
- `config`: readable config declarations, environment resolution, and validation.
- `composition/route`: production and test wiring plus process-owned resources.
- `composition/workflow`: dependencies reconstructed inside Workflow/step realms.
- `workflows`: durable turn, tool, approval, timeout, and finalization mechanics.
- `testing`: deterministic models and test support excluded from production composition.

## Main request flow

1. `POST /api/chat` authenticates, validates the request, and resolves model/tool policy.
2. Application preflight checks idempotency and conversation availability.
3. Per-process admission is acquired before any durable message or turn write.
4. The service creates the product turn, starts a durable Workflow run, and binds `runId`.
5. The Workflow claims the product turn before provider execution, runs AI SDK `WorkflowAgent`, and journals native model/tool parts.
6. The route returns the native UI message stream through replay normalization, safety scrubbing, SSE encoding, and idle keepalive.
7. The Workflow commits the terminal product projection. The route-side terminal handle releases local admission exactly once.

Exact request replay resolves the existing turn and run before admission, then reattaches without starting another Workflow. See [assistant-turn.md](assistant-turn.md).

## Browser flow

1. `<SideChatWidget workflowChat={...}>` loads catalogs and a coherent conversation snapshot through authenticated JSON routes.
2. The widget sends or reconnects through `WorkflowChatTransport`.
3. One widget-owned conversation session folds native `UIMessage` parts into visible state.
4. The subject activity stream invalidates affected queries; it never becomes transcript authority.
5. Optional host context is collected only for an opted-in request. Optional client tools execute only in the originating tab that retains the run-scoped capability.

See [widget-and-host-integration.md](widget-and-host-integration.md).

## Persistence split

Two schemas share one physical PostgreSQL database:

- `sidechat`: conversations, messages, assistant turns, usage, client-tool dispatches, approvals, activity notifications, and legal-hold metadata.
- `workflow`: durable runs, steps, events, waits, and Postgres World queue state.

The product schema owns user-visible state and authorization. The Workflow schema owns execution and replay. Reconciliation joins their narrow identities; neither schema substitutes for the other. See [turn-terminal-reconciliation.md](turn-terminal-reconciliation.md) and [operations/database.md](../operations/database.md).

## External boundaries

- Model providers are reached only from provider adapters reconstructed in the Workflow step realm.
- PostgreSQL is reached through `packages/db` or service persistence adapters that map application ports to those repositories.
- Browser callers see authenticated JSON resources, the native AI SDK UI message stream, and the small activity SSE vocabulary.
- Host pages integrate only through widget props and `@side-chat/host-bridge`.
