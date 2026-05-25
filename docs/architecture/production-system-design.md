# Side-Chat Production System Design

Status: current working system design

This document is the working system design for the side-chat assistant repository.
It started as the clean production repo plan and now tracks the accepted current
implementation direction.

The repository should keep a strict first boundary: stable product protocol,
framework-free Effect-first `partner-ai-core`, AI SDK 6-powered Effect-first
`agent-runtime`, and providers/models/tools as adapters.

Use this as the build source of truth until it is replaced by accepted ADRs and package-level design docs. It is intentionally one large document for early iteration.

## 0. Document Label Contract

Treat every unmarked item in this document as day-one scope for the clean production repo.

Non-day-one material must be explicitly labeled:

| Label | Meaning |
| --- | --- |
| `[Example]` | Illustrative shape or candidate naming. Do not scaffold just because it appears here. |
| `[Optional]` | May be included on day one if it is cheap and useful, but the scaffold is valid without it. |
| `[Deferred]` | Not day-one. Requires a later ADR or accepted product need. |
| `[Open]` | Decision not accepted yet. Do not implement as default. |

When a folder tree, command, tool, provider, schema field, or flow is not labeled, it is expected day-one architecture.

## 0.1 Day-One Version Pins

Version snapshot date: 2026-05-23.

These pins are part of the production scaffold contract. Strategic dependencies must be declared with exact versions in `package.json` and locked in `package-lock.json`; do not use `^`, `~`, `latest`, workspace-wide floating tags, or implicit transitive dependencies for the packages listed here.

Pinning rules:

- Package upgrades require an intentional PR note or ADR when they affect architecture, protocol, runtime behavior, TypeScript, linting, test execution, database access, or public package APIs.
- `npm install` must run from the root and produce a committed lockfile.
- `check-dependency-policy.mjs` and `check-version-pins.mjs` must fail when strategic dependencies are missing, duplicated at conflicting versions, or declared with version ranges.
- Provider packages should be installed only when their adapter exists. When installed, use the pin in this section.
- `[Open]` package choices are not day-one dependencies. They are listed here only to prevent accidental adoption before an ADR.

Runtime and package manager pins:

| Item | Pin | Scope |
| --- | --- | --- |
| Node.js | `24.16.0` | `.nvmrc`, `engines.node`, CI setup, Docker base image selection. |
| npm | `11.15.0` | Root `packageManager` value and CI install behavior. |
| TypeScript | `typescript@6.0.3` | Root compiler and all workspace project references. |
| Node types | `@types/node@24.12.4` | Server packages, scripts, tests, and Node-based tooling. |
| TS runner | `tsx@4.22.3` | Local scripts, codegen, and lightweight Node TypeScript execution. |

Server, service, and agent runtime pins:

| Package | Pin | Scope |
| --- | --- | --- |
| `ai` | `6.0.191` | AI SDK 6 `agent-runtime` engine. |
| `@ai-sdk/provider` | `3.0.10` | Provider/runtime adapter typing when needed directly. |
| `@ai-sdk/openai` | `3.0.65` | OpenAI-compatible provider adapter. |
| `zod` | `4.4.3` | AI SDK provider-utils peer dependency for provider runtime execution. |
| `@ai-sdk/azure` | `3.0.66` | Azure OpenAI provider adapter if accepted by runtime configuration. |
| `@ai-sdk/anthropic` | `3.0.79` | Anthropic provider adapter if accepted by runtime configuration. |
| `[Optional]` `@ai-sdk/gateway` | `3.0.120` | Add only if AI Gateway becomes an accepted deployment/provider path. |
| `hono` | `4.12.22` | `partner-ai-service` HTTP app and inbound routes. |
| `@hono/node-server` | `2.0.3` | Node server adapter for `partner-ai-service`. |
| `effect` | `4.0.0-beta.70` | Day-one Effect v4 package line for server/core workflow programs. |
| `@effect/platform-node` | `4.0.0-beta.70` | Node-specific Effect v4-compatible platform services. |

Effect version rule:

The architecture uses Effect v4 as the server/core workflow discipline. As of the version snapshot date, Effect v4 is published as `4.0.0-beta.70`, so the production repo accepts that beta line explicitly instead of drifting onto Effect 3. Do not mix v4 core packages with Effect 3 peer packages such as `@effect/platform@0.96.1`. If a v4-compatible Effect package is unavailable, either avoid that package on day one or isolate the need behind a small adapter until a compatible package exists.

Effect API rule:

- `partner-ai-core` exposes use cases as Effect programs. The chat stream entrypoint is `streamChatEffect(input)`, with ports supplied through `createPartnerAiCoreLayer(...)`.
- `agent-runtime` exposes one assistant-turn stream surface: `streamEffect(request)`.
- Do not add package-level Promise or `AsyncIterable` facades for core/runtime workflows. Convert to those shapes only at transport edges that require them, such as SSE response writing.
- Expected failures use the Effect error channel. Use `Effect.fail`, `Effect.try`, `Effect.tryPromise`, or yielded failing effects for known product/provider/tool/persistence failures.
- Raw JavaScript `throw` is a defect. Package boundaries may map defects into typed errors as a safety net, but implementation code must not use `throw` as expected control flow.

Database pins:

| Package | Pin | Scope |
| --- | --- | --- |
| `pg` | `8.21.0` | Postgres driver owned by `packages/db`. |
| `@types/pg` | `8.20.0` | Type declarations for DB package and DB tests. |
| `drizzle-orm` | `0.45.2` | Drizzle schema, query, relation, and repository implementation. |
| `drizzle-kit` | `0.31.10` | Migration generation and schema tooling. |

Frontend, widget, and browser harness pins:

| Package | Pin | Scope |
| --- | --- | --- |
| `react` | `19.2.6` | Widget peer dependency and harness runtime. |
| `react-dom` | `19.2.6` | Widget harness/runtime rendering. |
| `@types/react` | `19.2.15` | Widget and harness TypeScript. |
| `@types/react-dom` | `19.2.3` | Widget and harness TypeScript. |
| `vite` | `8.0.14` | Browser harness and package development server/build tooling. |
| `@vitejs/plugin-react` | `6.0.2` | React support for Vite harnesses. |
| `tailwindcss` | `4.3.0` | Tailwind 4 styling engine for widget CSS and browser harnesses. |
| `@tailwindcss/vite` | `4.3.0` | Tailwind 4 Vite integration for local harness/build tooling. |
| `@base-ui/react` | `1.5.0` | Accessible primitive behavior for owned widget UI primitives. |
| `class-variance-authority` | `0.7.1` | Variant definitions for owned UI primitives. |
| `clsx` | `2.1.1` | Class composition helper used by `cn`. |
| `tailwind-merge` | `3.6.0` | Tailwind class conflict merging used by `cn`. |
| `ai-elements` | `1.9.0` | Accepted AI Elements component dependency used by the widget implementation. |
| `lucide-react` | `1.16.0` | Accepted icon dependency for shadcn/AI Elements-derived widget components. |
| `motion` | `12.40.0` | Accepted animation dependency for AI Elements-derived widget interactions. |
| `ai` | `6.0.191` | Runtime package also used for AI UI/tool part types in vendored widget components. |
| `nanoid` | `5.1.11` | Accepted id helper used by AI Elements-derived widget components. |
| `streamdown` | `2.5.0` | Assistant markdown/stream rendering in the widget. |
| `@streamdown/cjk` | `1.0.3` | Streamdown plugin. |
| `@streamdown/code` | `1.1.1` | Streamdown code rendering plugin. |
| `@streamdown/math` | `1.0.2` | Streamdown math plugin. |
| `@streamdown/mermaid` | `1.0.2` | Streamdown Mermaid plugin. |
| `shiki` | `4.1.0` | Code highlighting for assistant output. |
| `cmdk` | `1.1.1` | Command primitive used by exact shadcn-style components. |
| `embla-carousel-react` | `8.6.0` | Carousel primitive used by exact shadcn-style components. |
| `use-stick-to-bottom` | `1.1.4` | Conversation viewport stick-to-bottom behavior. |

UI dependency policy:

- The widget owns its UI primitive source code. It may use Base UI primitives, CVA, Tailwind 4, local `cn` utilities, and the accepted AI Elements/shadcn-derived dependencies listed above.
- Use exact shadcn-style primitives and AI Elements-style chat components as owned widget source where copied/adapted, while retaining the accepted packages needed by those components.
- The local UI dependency ladder is `approved packages -> shared/ui -> shared/ai -> features -> widgets`.
- Do not depend on `shadcn`, `@repo/shadcn-ui`, generated shadcn registry packages, Radix UI packages, or any shared shadcn package at runtime or build time.
- Do not import UI components from paths such as `@repo/shadcn-ui/components/ui/button`.
- If a shadcn-style primitive is useful, install/copy the exact source into `packages/side-chat-widget/src/shared/ui`, keep Base UI as the primitive behavior base, and remove generator/registry metadata afterward.
- If an AI Elements-style chat component is useful, keep the selected source under `packages/side-chat-widget/src/shared/ai`; it may compose `shared/ui` and accepted AI display dependencies, but feature/widget UI must remain the adapter from widget projections to generic AI component props.
- `lucide-react` is the accepted widget icon package for these components.
- Copied/adapted source must be treated as first-party code: colocated tests where useful, repo lint rules, no hidden generator dependency, and license/origin notes when required.

Testing and quality pins:

| Package | Pin | Scope |
| --- | --- | --- |
| `vitest` | `4.1.7` | Unit, integration, contract, and type-adjacent tests. |
| `@effect/vitest` | `4.0.0-beta.70` | Effect v4-aware test helpers where they simplify Effect tests. |
| `playwright` | `1.60.0` | Browser harness and widget smoke/e2e tests. |
| `oxlint` | `1.66.0` | Root type-aware lint engine. |
| `oxlint-tsgolint` | `0.23.0` | Type-aware rule runtime used by Oxlint. |
| `oxfmt` | `0.51.0` | Root formatter. |

Unpinned until accepted:

- `[Open]` protocol schema library: Effect Schema, Zod, Valibot, TypeBox, Standard Schema, or another accepted schema source.
- `[Open]` additional AI SDK providers beyond the accepted day-one provider adapters.
- `[Open]` package publishing/API-surface tools such as API Extractor or `publint`.
- `[Optional]` dependency graph, dead-code, duplicate-code, secret scanning, or smell plugins unless section 21 promotes them after evidence.

## 1. Product Boundary

The repository owns an embeddable side-chat assistant product.

It does not own the consuming host application.

The host app is an external consumer that integrates through:

- the React widget package
- the browser/client package
- the host bridge contract
- the typed chat protocol

The main product boundary is:

```txt
external host app
  -> side-chat-widget
  -> chat-client
  -> chat-protocol
  -> partner-ai-service
  -> partner-ai-core
  -> agent-runtime
  -> model / tool / persistence / auth / telemetry adapters
```

The browser-facing protocol must be stable and product-owned. It must not expose provider-native stream parts, AI SDK internals, database tables, or host-app implementation details.

AI SDK 6 is not the browser contract. It is the engine inside `agent-runtime`. The main assistant path is Agent / ToolLoopAgent-first: named assistants are reusable runtime units with model selection, instructions, registered tool capabilities, stop rules, telemetry, and stream mapping behind one boundary. `streamText` is a low-level primitive, not the product orchestration boundary. OpenAI, Anthropic, Azure OpenAI, AI Gateway, local models, and fake models are provider adapters inside or below that runtime.

## 2. Non-Goals

Do not include these in the clean production spine:

- a host app
- a UBS-specific demo app
- demo dashboard data
- demo-only Caddy/Droplet deployment as production structure
- report/PDF generation unless it becomes a real product requirement
- placeholder auth, billing, rate limiting, or observability that pretends to be production
- large local fixtures unless they directly support protocol, widget, runtime, or backend tests
- extra apps that exist only to showcase the widget
- generated build artifacts in source control

`[Optional]` or `[Deferred]` additions must earn their place through a real development or product need.

## 3. Core Principles

Protocol first.

The browser/backend contract is the product spine.

`partner-ai-core` is framework-free.

The chat use cases should not know about Hono, Express, Fastify, OpenAI SDK objects, pg, Drizzle, React, browser APIs, or AI SDK UI messages.

Hexagonal architecture is the default backend shape.

Use cases sit at the center. External systems sit at the edges. Edges talk to the center through ports owned by the center, and concrete adapters are wired only by composition roots.

Effect v4 is the backend workflow discipline.

Use the pinned Effect v4 package line for typed errors, dependency layers, resource safety, structured concurrency, streams, retries, timeouts, config, and observability in server/core code. Do not force Effect into every UI component or public browser API.

`agent-runtime` is a backend engine, not a product boundary.

AI SDK 6 should power reusable agents, tool loops, provider tools, streaming, and telemetry behind ports. The default assistant execution shape is AI SDK `Agent` / `ToolLoopAgent`; direct `streamText` usage is allowed only as an implementation detail inside `packages/agent-runtime` or for explicitly accepted tiny non-agent utilities. `[Deferred]` AI SDK capabilities such as approvals, structured output, MCP, and reranking must not be scaffolded until accepted. AI SDK must not leak into widget, host, or product protocol code.

Tools are registered agent capabilities, not request instructions.

The runtime/profile/policy composition decides which tools are available to an assistant turn. The `ToolLoopAgent` receives those capabilities and the model decides whether and when to call them. The backend must not infer tool use from prompt keywords, run a tool before the model starts, or append manual "tool returned" system messages as a substitute for the model/tool loop.

Tool registration and tool availability are different states. A tool may exist
in the backend registry without being available to a specific assistant turn.
Production composition must expose only accepted production tools. Development
mock tools and fake providers are non-production configuration and must fail
closed under `SIDECHAT_PROFILE=production`.

Apps are deployable processes only.

An app may compose adapters, parse environment, start servers, and expose HTTP routes. It should not own reusable business logic.

Inbound and outbound are different.

Inbound adapters accept calls into the service, such as HTTP routes and SSE. Outbound adapters call things outside the service, such as auth providers, model providers, telemetry vendors, and Postgres-backed repositories. `[Example]` outbound integrations include MCP servers, CRM, entitlement services, and Redis. Do not hide outbound integrations under vague `utils` or mix them into use cases.

Packages expose public boundaries.

Consumers import from package entrypoints, not internal folders.

The host is external.

The repo defines how a host integrates. It does not ship the host.

Adapters translate, they do not define product truth.

OpenAI, Anthropic, Azure OpenAI, AI Gateway, AI SDK, Postgres, auth providers, and telemetry systems sit outside the core.

Tests protect contracts before implementation detail.

Protocol compatibility, stream sequencing, agent-runtime event mapping, and widget/backend integration tests matter more than snapshotting incidental UI.

### 3.1 Day-One DB Schema Contract

The DB schema contract comes before repository implementation. Migrations implement the accepted contract; they do not discover it by accident.

The first accepted production scaffold must include this contract before any migration, repository, or persistence adapter is treated as complete. The exact SQL can evolve, but these logical tables, lifecycles, authorization fields, idempotency rules, and repository command boundaries are day-one requirements.

Schema ownership:

- Use the dedicated DB schema `sidechat`.
- Application, core, and runtime code must address the database through `packages/db` repository methods, not through table names.
- Table names are part of the migration and Drizzle schema contract. They can be used by `packages/db`, migrations, DB tests, and operations scripts only.
- Repository return types are parsed DTOs, not raw rows.

Day-one persistence technology and topology:

| Decision | Day-one stance |
| --- | --- |
| Database | PostgreSQL. Local development uses local/container Postgres. Day-one deployment may run Postgres on the same server/VM as `partner-ai-service`; managed Postgres remains compatible later because access stays behind `packages/db`. |
| Driver | `pg`, owned by `packages/db`. |
| Query/schema layer | Drizzle, owned by `packages/db`. |
| Runtime topology | `apps/partner-ai-service` composes the DB layer in the same Node server/process. There is no separate persistence app or microservice. |
| App access | `partner-ai-service` may import repository factories/layers from `packages/db`; it must not import Drizzle table objects for ad hoc queries. |
| Core access | `partner-ai-core` sees repository ports only. It must not import `pg`, Drizzle, SQL, or row types. |
| Schema source | This contract defines product meaning. Drizzle schema/migrations are the executable implementation of the accepted contract. |
| Stored functions | `[Deferred]` hardening option for operations that later need DB-enforced authorization or complex atomic invariants. Not day-one runtime shape. |

Identity and tenancy vocabulary:

| Field | Meaning |
| --- | --- |
| `workspace_id` | Tenant/workspace boundary. Required on every protected row. Opaque product id, not an Azure-specific id. |
| `subject_id` | Conversation visibility scope. Usually the normalized user/principal id, but may be a service subject if auth design requires it. |
| `actor_id` | Current authenticated actor that performed an action. Often the same as `subject_id`, but kept separate for delegated/admin/service actions. |
| `conversation_key` | Host/client supplied opaque thread key, such as `default`, a page/resource key, or a host-owned thread id. Not a secret. |
| `request_id` | Idempotency key for one user request/assistant turn. Generated by client/service boundary and unique inside workspace scope. |

Column type policy:

| Column kind | Contract |
| --- | --- |
| Internal record ids | `uuid` primary keys generated by the service or database, but always returned as opaque strings to TypeScript. |
| Workspace, subject, actor, provider, model, tool, command, and request ids | `text` with length checks where practical. They are provider-neutral product ids. |
| Timestamps | `timestamptz`; repository command inputs accept explicit `now` for deterministic tests and transaction consistency. |
| Status/lifecycle fields | `text` plus check constraints generated from the accepted lifecycle values. Avoid PostgreSQL enum types unless an ADR accepts their migration cost. |
| Token/count fields | Non-negative integers. Use `bigint` if provider usage limits make overflow plausible. |
| JSON metadata | `jsonb` with object-shape validation at the repository/protocol boundary. |
| Hash fields | Stable text hash plus documented algorithm in the DB package contract. |

Day-one lifecycle values:

| Lifecycle | Allowed values |
| --- | --- |
| `conversation.status` | `active`, `archived`, `reset` |
| `message.role` | `system`, `user`, `assistant`, `tool` |
| `assistant_turn.status` | `running`, `completed`, `user_aborted`, `timed_out`, `provider_failed`, `tool_failed`, `persistence_failed` |
| `tool_invocation.status` | `running`, `completed`, `failed`, `cancelled`, `skipped` |
| `host_command_result.status` | `emitted`, `applied`, `rejected`, `unsupported`, `failed`, `timed_out` |

Day-one resume modes:

| Resume mode | Day-one support |
| --- | --- |
| Resume completed conversation later | Supported through `conversations`, ordered `messages`, and `conversation_key`. |
| Retry same user request after network failure | Supported through `request_id` idempotency and existing turn/message lookup. |
| Reopen UI after a completed turn | Supported through history read plus terminal assistant turn status. |
| Reconnect to an active stream | Best-effort status only on day one. Full event replay requires `[Deferred]` stream event store. |
| Continue exact provider stream after process crash | `[Deferred]`. Day one marks stale running turns as terminal failure or timeout and lets the client retry idempotently. |

Day-one logical tables:

| Table | Responsibility | Required contract |
| --- | --- | --- |
| `sidechat.conversations` | Authorized thread of user/assistant messages. | `conversation_id`, `workspace_id`, `subject_id`, `conversation_key`, `status`, `created_by_actor_id`, `created_at`, `updated_at`, `last_message_at`. Unique `(workspace_id, subject_id, conversation_key)`. |
| `sidechat.messages` | Durable message timeline attached to a conversation. | `message_id`, `conversation_id`, `workspace_id`, `role`, `content_text`, `metadata_json`, `sequence_index`, `created_at`. Unique `(conversation_id, sequence_index)`. |
| `sidechat.assistant_turns` | One accepted user request and assistant response lifecycle. | `assistant_turn_id`, `request_id`, `conversation_id`, `workspace_id`, `subject_id`, `actor_id`, `user_message_id`, `assistant_message_id`, `runtime_profile`, `system_prompt_version`, `context_strategy_version`, `tool_registry_version`, `model_provider`, `model_id`, `status`, `finish_reason`, `error_code`, `started_at`, `completed_at`. Unique `(workspace_id, request_id)`. |
| `sidechat.turn_context_snapshots` | Redacted host/runtime context used to produce one assistant turn. | `context_snapshot_id`, `assistant_turn_id`, `workspace_id`, `context_schema_version`, `host_surface_id`, `host_context_hash`, `capabilities_hash`, `context_redacted_json`, `created_at`. Unique `(assistant_turn_id)`. |
| `sidechat.usage_records` | Token/cost/accounting data for each provider model call inside a turn. | `usage_record_id`, `assistant_turn_id`, `workspace_id`, `runtime_step_index`, `model_provider`, `model_id`, `provider_request_id`, `input_tokens`, `output_tokens`, `reasoning_tokens`, `cached_input_tokens`, `total_tokens`, `cost_units`, `created_at`. Unique `(assistant_turn_id, runtime_step_index)`. |
| `sidechat.tool_invocations` | Auditable record of a model-callable tool run. | `tool_invocation_id`, `assistant_turn_id`, `workspace_id`, `runtime_step_index`, `tool_call_id`, `tool_name`, `status`, `input_hash`, `output_hash`, `input_redacted_json`, `output_redacted_json`, `error_code`, `started_at`, `completed_at`. Unique `(assistant_turn_id, tool_call_id)`. |
| `sidechat.host_command_results` | Record of commands emitted to the external host and the host's result. | `host_command_id`, `assistant_turn_id`, `workspace_id`, `command_id`, `command_type`, `resource_id`, `status`, `result_code`, `command_redacted_json`, `result_redacted_json`, `created_at`, `resolved_at`. Unique `(assistant_turn_id, command_id)`. |
| `sidechat.audit_events` | Append-only security and product audit trail for protected actions. | `audit_event_id`, `workspace_id`, `subject_id`, `actor_id`, `event_type`, `target_type`, `target_id`, `metadata_json`, `request_id`, `created_at`. |

Required relationships:

| Relationship | Constraint |
| --- | --- |
| Message to conversation | `messages.conversation_id` references `conversations.conversation_id`; repository reads also verify matching `workspace_id`. |
| Assistant turn to conversation | `assistant_turns.conversation_id` references `conversations.conversation_id`. |
| Assistant turn user message | `assistant_turns.user_message_id` references `messages.message_id` and must point to a `user` message in the same conversation. |
| Assistant turn assistant message | `assistant_turns.assistant_message_id` references `messages.message_id` when completed and must point to an `assistant` message in the same conversation. |
| Context snapshot to assistant turn | `turn_context_snapshots.assistant_turn_id` references `assistant_turns.assistant_turn_id`. |
| Usage to assistant turn | `usage_records.assistant_turn_id` references `assistant_turns.assistant_turn_id`. |
| Tool invocation to assistant turn | `tool_invocations.assistant_turn_id` references `assistant_turns.assistant_turn_id`. |
| Host command to assistant turn | `host_command_results.assistant_turn_id` references `assistant_turns.assistant_turn_id`. |

Required indexes and constraints:

| Area | Requirement |
| --- | --- |
| Conversation lookup | Unique index on `(workspace_id, subject_id, conversation_key)`. |
| Message ordering | Unique index on `(conversation_id, sequence_index)` and read index on `(conversation_id, sequence_index desc)`. |
| Turn idempotency | Unique index on `(workspace_id, request_id)`. |
| Turn history | Index on `(conversation_id, started_at desc)`. |
| Context snapshot lookup | Unique index on `(assistant_turn_id)` and read index on `(workspace_id, host_context_hash)`. |
| Usage per runtime step | Unique index on `(assistant_turn_id, runtime_step_index)`. |
| Tool idempotency | Unique index on `(assistant_turn_id, tool_call_id)`. |
| Host command idempotency | Unique index on `(assistant_turn_id, command_id)`. |
| Audit investigation | Indexes on `(workspace_id, created_at desc)` and `(target_type, target_id, created_at desc)`. |
| Tenant isolation | Every child table carries `workspace_id`; repository outputs must verify it matches the requested workspace. |

JSON metadata boundaries:

- `metadata_json`, `context_redacted_json`, `input_redacted_json`, `output_redacted_json`, `command_redacted_json`, and `result_redacted_json` may store extensible metadata and redacted payload summaries.
- JSON fields must not be the only location for authorization fields, lifecycle state, reportable usage fields, provider/model ids, indexed ids, or error codes.
- Raw provider requests, raw tool secrets, bearer tokens, access tokens, refresh tokens, and full unredacted external responses must not be persisted in JSON metadata.
- If a field is needed for querying, authorization, retention, billing, or operational dashboards, it becomes a typed column before production.

Deferred schema areas:

| `[Deferred]` entity | Add when |
| --- | --- |
| `[Deferred]` stream event store | Resumable stream replay is accepted. |
| `[Deferred]` conversation summary store | Long conversation compaction becomes necessary for context-window management. |
| `[Deferred]` approval request store | Human approval flow is accepted as product behavior. |
| `[Deferred]` external connector cache | Tool results need durable caching or replay. |
| `[Deferred]` durable memory store | Cross-conversation memory is accepted as product behavior. |
| `[Deferred]` billing ledger | Billing moves from usage capture to enforceable financial accounting. |

Required day-one repository command contract:

These commands are implemented inside `packages/db` with Drizzle transactions/queries over Postgres. The method names below are product contracts for repository behavior, not SQL function names.

| Repository command | Inputs | Returns | Responsibility |
| --- | --- | --- | --- |
| `createOrGetConversation` | `workspace_id`, `subject_id`, `actor_id`, `conversation_key`, `now` | Conversation DTO | Create or return a conversation scoped to workspace, subject, and conversation key. |
| `appendMessage` | `workspace_id`, `conversation_id`, `role`, `content_text`, `metadata_json`, `idempotency_key`, `now` | Message DTO | Append a message with monotonic sequence within a conversation. Repeated idempotency key returns the existing message. |
| `startAssistantTurn` | `workspace_id`, `subject_id`, `actor_id`, `request_id`, `conversation_id`, `user_message_id`, `runtime_profile`, prompt/context/tool versions, `model_provider`, `model_id`, `now` | Assistant turn DTO | Create or return an idempotent running turn for a request id. |
| `recordTurnContextSnapshot` | `workspace_id`, `assistant_turn_id`, `context_schema_version`, `host_surface_id`, context/capability hashes, `context_redacted_json`, `now` | Context snapshot DTO | Store the redacted host/runtime context used for the turn before model execution. |
| `completeAssistantTurn` | `workspace_id`, `assistant_turn_id`, `assistant_message_id`, `finish_reason`, `now` | Assistant turn DTO | Mark a running turn completed and link the assistant message. |
| `failAssistantTurn` | `workspace_id`, `assistant_turn_id`, `status`, `error_code`, `now` | Assistant turn DTO | Mark a running turn failed, aborted, or timed out with a typed terminal status. |
| `recordUsage` | `workspace_id`, `assistant_turn_id`, `runtime_step_index`, `model_provider`, `model_id`, `provider_request_id`, token fields, `cost_units`, `now` | Usage DTO | Upsert token/cost metadata for one provider model call. |
| `recordToolInvocation` | `workspace_id`, `assistant_turn_id`, `runtime_step_index`, `tool_call_id`, `tool_name`, `status`, hash/redacted fields, `error_code`, timestamps | Tool invocation DTO | Upsert auditable tool invocation state without storing secrets. |
| `recordHostCommandResult` | `workspace_id`, `assistant_turn_id`, `command_id`, `command_type`, `resource_id`, `status`, `result_code`, redacted fields, timestamps | Host command DTO | Upsert emitted host command and final host result state. |
| `readConversationHistory` | `workspace_id`, `subject_id`, `conversation_id`, `limit`, `before_sequence_index` | Ordered message DTO list | Return authorized recent messages for prompt/history use. |
| `resetConversation` | `workspace_id`, `subject_id`, `conversation_id`, `actor_id`, `request_id`, `now` | Reset summary DTO | Tombstone or redact authorized conversation data according to retention policy. |
| `appendAuditEvent` | `workspace_id`, `subject_id`, `actor_id`, `event_type`, `target_type`, `target_id`, `request_id`, `metadata_json`, `now` | Audit event DTO | Append a security/product audit event. |

Repository command rules:

- Commands accept explicit `workspace_id`; none infer tenancy from connection state.
- Commands that read or mutate conversation data accept `subject_id` and must reject cross-subject access.
- Commands are idempotent where the caller can retry after network or stream interruption.
- Commands return parsed DTOs and never expose raw Drizzle rows to partner-ai-core.
- Commands map `pg`/Drizzle errors into stable DB adapter errors, which are then mapped into partner-ai-core persistence errors.
- Commands must not return raw SQL errors, table names, or internal constraint names to user-facing protocol errors.

Least-privilege role model:

| Role | Grants |
| --- | --- |
| `sidechat_owner` | Owns schema, tables, and migrations in controlled environments. Not used by runtime app. |
| `sidechat_migrator` | Can run migrations and direct schema/table DDL in CI/deploy migration jobs. Not used by runtime app. |
| `sidechat_runtime` | Can connect and perform least-privilege table reads/writes required by `packages/db` Drizzle repositories. No DDL, no ownership, no cross-schema grants. |
| `sidechat_readonly_ops` | `[Optional]` operational read-only role for controlled diagnostics, never used by product runtime. |

Runtime DB rules:

- Runtime repositories use Drizzle through `packages/db` only.
- Runtime roles receive only the table privileges required by repository commands.
- Migrations and `packages/db` are the only production code paths allowed to know table names.
- Raw SQL is allowed only in migrations, DB tests, and tightly scoped `packages/db` query helpers when Drizzle cannot express the operation cleanly.
- Drizzle rows are untrusted until parsed into repository return types.
- `workspace_id` and `subject_id` or equivalent normalized auth scope must be part of every protected read/write.
- Request idempotency must prevent duplicate messages, turns, usage records, host commands, and tool side effects.
- If a request includes host context that affects assistant behavior, a redacted context snapshot must be recorded before model execution.
- JSON metadata is allowed only for extensible metadata, not for fields needed by authorization, lifecycle, indexing, or reporting.

Retention and deletion contract:

- `resetConversation` must remove prompt-visible message content from future reads.
- Usage and audit records may remain after reset if they no longer contain prompt/user content and retention policy allows them.
- Audit events are append-only; correction is represented by another audit event.
- Hard deletion, legal hold, export, and cross-workspace retention policies are `[Deferred]` until product/compliance requirements are accepted.

### 3.2 Conversation History, Context, And Resume Contract

History is more than messages. The product must be able to explain what the assistant saw, which version of the runtime produced an answer, which tools ran, and whether a user can safely continue from the last turn.

Day-one history contract:

| History area | Day-one responsibility |
| --- | --- |
| Conversation identity | Stable `conversation_id` plus host/client `conversation_key` scoped by `workspace_id` and `subject_id`. |
| Message timeline | Ordered, durable user/assistant/system/tool messages with monotonic `sequence_index`. |
| Turn lifecycle | One assistant turn per accepted `request_id`, with terminal status and error code when applicable. |
| Context snapshot | Redacted host/runtime context used for the turn, stored before model execution when context affects behavior. |
| Runtime versions | `runtime_profile`, `system_prompt_version`, `context_strategy_version`, and `tool_registry_version` on the turn. |
| Tool and host actions | Tool invocations and host command results attached to the assistant turn for audit and idempotency. |
| Usage | Provider/model usage records attached to the turn, not inferred from messages later. |

Day-one context contract:

- Context used by the model is assembled by `partner-ai-core` workflows from authorized conversation history, current host context, assistant profile, model selection, available tool capabilities, and product policy.
- Host context must include freshness and schema version when it can change assistant behavior.
- App/service adapters provide IO ports for history, persistence, host context, and summaries. They do not decide context policy.
- The core records a redacted context snapshot and stable hashes through ports, not unbounded raw host state.
- The context builder should produce an internal manifest containing included message ids, context snapshot hash, assistant profile/version ids, available tool capability ids, tool registry version, model id, and budget decisions.
- `agent-runtime` receives only the prepared `RuntimeContextBoard` and renders it into model-facing messages.
- The internal manifest can stay in application/runtime logs on day one. Persisting full prompt manifests is `[Deferred]` unless debugging/compliance requires it.
- Cross-conversation memory, user preference learning, vector retrieval, and conversation summaries are `[Deferred]` until accepted as product behavior.

Resume behavior:

| Scenario | Expected behavior |
| --- | --- |
| User opens an existing conversation | Client reads conversation history and last known turn state. |
| Client retries after losing connection | Same `request_id` must not duplicate messages, turns, tool calls, host commands, or usage records. |
| Same `request_id` already completed | Service returns or streams the existing completed result path without calling the model again. |
| Same `request_id` is still running | Day one may return an in-progress/status response. Full stream replay is `[Deferred]`. |
| Same `request_id` failed or timed out | Service returns the terminal failure. A new attempt uses a new `request_id`. |
| Service starts with stale running turns | Startup or maintenance marks stale turns as timed out/provider-failed according to policy. |

What else must be considered before implementation:

- history window limits and context budget policy
- stale host context rules
- abort/cancel semantics
- request id generation and propagation from client to service
- deduplication of tool calls and host commands
- redaction policy for host context, tool IO, provider errors, and audit metadata
- retention policy for conversation content versus audit/usage records
- migration/backfill strategy when context schema versions change
- diagnostics for "why did the assistant answer this way" without storing unsafe raw prompts

## 4. Top-Level Repository

```txt
side-chat/
  apps/
    partner-ai-service/

  packages/
    chat-protocol/
    partner-ai-core/
    agent-runtime/
    chat-client/
    side-chat-widget/
    host-bridge/
    db/
    testing/

  test-harness/
    widget-harness/

  infra/
    local/
    docker/
    production/

  docs/
    architecture/
    decisions/
    operations/

  scripts/

  package.json
  package-lock.json
  tsconfig.base.json
  vitest.config.ts
  .oxlintrc.json
  README.md
```

## 5. Top-Level Responsibilities

| Path | Responsibility | Must not own |
| --- | --- | --- |
| `apps/` | Deployable runtime entrypoints and composition roots. | Product protocol definitions, reusable domain logic, widget internals. |
| `packages/` | Reusable internal/public libraries with explicit public APIs. | Process startup, environment-specific deployment logic. |
| `test-harness/` | Dev/test-only runnable harnesses for browser integration, widget solo development, and cross-package smoke tests. | Product host app logic, real customer workflows, demo dashboards, deployable production services. |
| `infra/` | Local and production infrastructure definitions. | Application/domain logic. |
| `docs/` | Durable architecture, decisions, and operations documentation. | Temporary scratchpads, stale prototype narratives. |
| `scripts/` | Repo automation, governance checks, code generation. | Runtime application code. |

## 6. Dependency Direction

Allowed dependency direction:

```txt
chat-protocol
  <- host-bridge
  <- partner-ai-core
  <- agent-runtime
  <- chat-client
  <- db
  <- side-chat-widget
  <- apps/partner-ai-service

partner-ai-core
  <- agent-runtime
  <- apps/partner-ai-service

agent-runtime
  <- apps/partner-ai-service

chat-client
  <- side-chat-widget

host-bridge
  <- side-chat-widget

db
  <- apps/partner-ai-service

testing
  -> may depend on protocol/core/runtime/client/widget for test utilities only
```

Suggested package dependency matrix:

| Package | May depend on | Must not depend on |
| --- | --- | --- |
| `chat-protocol` | External schema/runtime libs only. | React, HTTP framework, AI SDK, pg, Drizzle, widget, `partner-ai-core`. |
| `host-bridge` | `chat-protocol` if reusing host context/command types. | React, API server, DB, provider SDKs. |
| `partner-ai-core` | `chat-protocol`, Effect v4. | Hono/Fastify/Express, React, pg, Drizzle, AI SDK, provider SDK objects. |
| `agent-runtime` | `partner-ai-core`, `chat-protocol`, Effect v4, AI SDK/runtime-only provider packages. | HTTP framework, React, pg, Drizzle, widget internals, host app state. |
| `chat-client` | `chat-protocol`; `[Optional]` protocol validation helpers. | React, widget UI, partner-ai-core, pg, Drizzle, provider SDKs, required Effect runtime in public API. |
| `side-chat-widget` | `chat-client`, `chat-protocol`, `host-bridge`, React peer deps, Base UI primitives, CVA/Tailwind class helpers, accepted AI Elements/shadcn-derived widget dependencies. | API server internals, DB, provider SDKs, agent-runtime internals, shadcn registry packages, Radix UI packages. |
| `db` | `pg`, Drizzle, `chat-protocol` for persisted DTO types if needed, Effect v4 for resource/transaction safety. | React, HTTP framework, widget, provider SDKs, partner-ai-core. |
| `apps/partner-ai-service` | `partner-ai-core`, `agent-runtime`, `chat-protocol`, `db`, Effect v4 runtime/layers, concrete adapter libraries. | Widget internals, host app code. |
| `testing` | Test-facing utilities from other packages. | Production runtime startup. |

### 6.1 Hexagonal Architecture Contract

Hexagonal architecture means the product behavior is protected from delivery mechanisms and external systems.

The center owns decisions. The edges own translation.

In this repository, the center is mostly `packages/partner-ai-core`, plus the core orchestration parts of `packages/agent-runtime`. The edges are HTTP/SSE, model providers, databases, auth systems, entitlement systems, telemetry vendors, `[Deferred]` MCP servers, browser transports, and host applications.

Core vocabulary:

| Term | Meaning in this repo |
| --- | --- |
| Domain | Pure concepts and rules that describe the product. No IO, no SDKs, no framework objects. |
| Application use case | A workflow that coordinates domain rules and ports to produce a product result. |
| Port | An interface or Effect service required by the center to do work outside itself. The center defines the port. |
| Inbound adapter | A delivery adapter that receives an external call and invokes a use case, such as HTTP routes or SSE endpoints. |
| Outbound adapter | An infrastructure adapter that implements a port by calling an external system, such as Postgres, Azure SSO, Redis, telemetry, or a provider API. |
| Composition root | The only place that wires concrete adapters into ports and starts a runtime process. |

Rules:

- Domain files contain product concepts, invariants, pure transformations, and policy inputs/outputs.
- Domain files do not import HTTP frameworks, React, AI SDK, provider SDKs, DB clients, process env, browser APIs, or app composition.
- Application use cases orchestrate a user-visible workflow. They may call ports/services, apply policies, map errors, and emit protocol-ready outcomes.
- Application use cases do not instantiate concrete clients, read environment variables, open database connections, call `fetch` directly, or know provider-native event shapes.
- Ports are declared by the center, not by adapters. If the use case needs persistence, auth, billing, model execution, observability, clock, ids, or an external tool, it depends on a port.
- Port signatures use domain/product types and typed application errors. They must not expose `pg`, Drizzle, HTTP request/response objects, AI SDK provider objects, vendor DTOs, or raw unparsed JSON.
- Inbound adapters parse and validate transport input, build use-case input, call the use case, and map output/errors back to the transport.
- Inbound adapters do not own business policy, provider choice, entitlement decisions, conversation rules, or stream sequencing rules.
- Outbound adapters translate a port call into a concrete external call and translate the response back into port/domain types.
- Outbound adapters do not own use-case decisions. They may own retry, timeout, low-level error mapping, authentication to the external system, and response validation for that system.
- Composition roots may import both center and edge code. This privilege is local to `apps/partner-ai-service/src/composition` and process startup files.
- Shared utilities must not become a hidden business layer. If code has product meaning, put it under the owning domain/application/policy area.

Dependency direction:

```txt
inbound adapter -> application use case -> port/service -> outbound adapter
                                     ^                  |
                                     |                  |
                                domain/policies    composition wires
```

The source-code dependency is still inward:

```txt
outbound adapter imports the port it implements
application use case imports the port it needs
port does not import the adapter
domain does not import the use case
composition imports everything needed to wire the runtime
```

When to introduce a port:

- the use case needs data or behavior from outside the center
- the implementation may differ between local, test, staging, and production
- the dependency has failure, latency, retries, credentials, quotas, or resource lifecycle
- the dependency should be fakeable in use-case tests

Do not introduce a port for a pure helper, a local calculation, a one-line mapper, or a UI-only concern.

Testing rules:

- domain and policy tests use plain inputs and outputs
- application use-case tests use fake ports/services
- inbound adapter tests assert parsing, auth context extraction, status codes, headers, and stream framing
- outbound adapter tests assert request construction, response parsing, error mapping, retries, and timeouts
- composition tests assert that production/test layers can be built without exercising real providers by default

Common violations:

- a use case imports `pg`, Drizzle, `fetch`, Hono, AI SDK, or a provider SDK
- a provider-native stream part appears in `chat-protocol`, `chat-client`, or `side-chat-widget`
- an HTTP route chooses entitlement or model policy instead of calling a use case
- an assistant tool owns a raw external client instead of using an outbound service
- an adapter defines a port after the fact to mirror its own implementation
- a port returns vendor DTOs or raw database rows
- `Date.now`, random ids, process env, browser storage, or network calls appear in domain/application code without an injected service
- generic `utils` or `helpers` folders accumulate product behavior with unclear ownership

## 7. Folder Templates

Use these templates before inventing a new folder shape. The goal is that an AI agent can tell whether a file is a contract, pure rule, runtime implementation, adapter, layer, or test by its path and suffix.

### 7.1 Capability Template

Use this inside `partner-ai-core`, `agent-runtime`, `chat-client`, and widget domain/application areas when a capability has more than one or two files.

```txt
<capability>/
  index.ts                  public exports for this capability inside the package
  <capability>.types.ts     local public types
  <capability>.errors.ts    typed expected failures, if any
  <capability>.policy.ts    pure rules, if any
  <capability>.service.ts   Effect service tag or service interface, if this is a dependency
  <capability>.live.ts      live Effect layer or runtime implementation, if needed
  <capability>.test.ts      colocated tests for the main behavior
```

Keep pure rules separate from IO. If a file talks to the network, database, provider SDK, filesystem, clock, or process environment, it is not a policy file.

### 7.2 Inbound Adapter Template

Use this for things that receive calls into the service.

```txt
inbound/<transport>/<capability>/
  <capability>.route.ts       route/controller/handler
  <capability>.request.ts     transport request parsing
  <capability>.response.ts    transport response mapping
  <capability>.test.ts        colocated route/adapter tests
```

`[Example]` inbound capabilities: HTTP chat stream route, history route, health route, webhook receiver.

### 7.3 Outbound Adapter Template

Use this for things that call external systems.

```txt
outbound/<system>/<capability>/
  <capability>.client.ts      low-level external API client
  <capability>.adapter.ts     implementation of a core/runtime port
  <capability>.config.ts      config for this external system
  <capability>.errors.ts      external-system error mapping
  <capability>.layer.ts       Effect live/test layer
  <capability>.test.ts        colocated adapter tests
```

`[Example]` outbound systems: CRM, document search, market data, entitlement service, Azure SSO/JWT, Redis rate limit, telemetry exporter.

### 7.4 Assistant Tool Template

Use this when exposing an external capability to the assistant as a model-callable tool.

```txt
tools/<tool-name>/
  <tool-name>.tool.ts         AI SDK/runtime tool definition
  <tool-name>.schema.ts       tool input/output schema
  <tool-name>.policy.ts       permission, [Deferred] approval, and safety rules
  <tool-name>.mapper.ts       external result -> assistant-safe output
  <tool-name>.test.ts         colocated tests
```

The tool file may depend on tool registry/runtime types. It should not own the external client. External calls belong to outbound adapters or Effect services that the tool uses.

### 7.5 Test Placement Rule

Tests are colocated by default:

```txt
thing.ts
thing.test.ts
```

Use a package-level `test-harness/` only for reusable test apps, browser harnesses, or cross-package fixtures that are not owned by one source file. Avoid top-level `test/` folders for ordinary unit tests.

### 7.6 Split Rule

If a folder grows beyond roughly seven source files, or contains more than one reason to change, split it by capability before adding more files. Prefer this shape. Concrete tool/provider names in this snippet are `[Example]` names unless accepted elsewhere as day-one product capabilities:

```txt
tools/
  registry/
  workbench-query/
  host-command/

providers/
  registry/
  openai/
  anthropic/
```

over large flat folders like `tools/*.ts` or `providers/*.ts`.

## 8. App: `apps/partner-ai-service`

The only initial app should be the deployable browser-facing Partner AI service. It exposes the product chat HTTP/SSE boundary, but its name should reflect the larger assistant service responsibility rather than a narrow chat route.

It owns:

- process startup
- environment parsing
- HTTP framework setup
- HTTP routes
- SSE response writing
- adapter composition
- outbound service adapter wiring
- graceful shutdown
- runtime health checks

It does not own:

- protocol schema truth
- chat use-case logic
- agent-runtime internals
- widget state
- host UI behavior
- database table access rules

Folder structure:

```txt
apps/partner-ai-service/
  package.json
  tsconfig.json
  src/
    server.ts
    config/
      env.ts
      runtime-config.ts
      feature-flags.ts
    inbound/
      http/
        app.ts
        server.ts
        middleware/
          request-id.ts
          auth-context.ts
          require-auth.ts
          cors.ts
          error-logging.ts
        routes/
          chat-stream.ts
          chat-history.ts
          chat-usage.ts
          models.ts
          health.ts
        response/
          sse.ts
          protocol-errors.ts
          http-errors.ts
    composition/
      container.ts
      container.test.ts
      layers/
        partner-ai-core.layer.ts
        agent-runtime.layer.ts
        persistence.layer.ts
        auth.layer.ts
        rate-limit.layer.ts
        billing.layer.ts
        telemetry.layer.ts
        outbound.layer.ts
      registries/
        provider-registry.ts
        tool-registry.ts
        model-registry.ts
    outbound/
      auth/
        auth-context.ts
        auth-verifier.ts
        static-auth-adapter.ts
        jwt-auth-adapter.ts
        azure-sso-auth-adapter.ts
      rate-limit/
        in-memory-rate-limit-adapter.ts
        redis-rate-limit-adapter.ts
      billing/
        allow-all-billing-adapter.ts
        entitlement-billing-adapter.ts
      telemetry/
        logger.ts
        metrics.ts
        tracing.ts
      persistence/
        db-conversation-repository.ts
        db-usage-repository.ts
      tools/
        crm/
          crm-client.ts
          crm-tool-adapter.ts
          crm-tool-adapter.test.ts
        documents/
          document-search-client.ts
          document-search-tool-adapter.ts
          document-search-tool-adapter.test.ts
        market-data/
          market-data-client.ts
          market-data-tool-adapter.ts
          market-data-tool-adapter.test.ts
      http-clients/
        create-service-client.ts
        service-client-error.ts
        service-client-error.test.ts
    shared/
      unknown-record.ts
      async-disposable.ts
```

Tests are colocated with the unit they cover:

```txt
src/inbound/http/routes/chat-stream.ts
src/inbound/http/routes/chat-stream.test.ts
src/composition/container.ts
src/composition/container.test.ts
src/outbound/auth/jwt-auth-adapter.ts
src/outbound/auth/jwt-auth-adapter.test.ts
```

Key file responsibilities:

| File or folder | Responsibility |
| --- | --- |
| `src/server.ts` | Reads config, builds container, starts HTTP server, registers shutdown hooks. |
| `config/env.ts` | Parses raw environment variables and fails loudly for invalid production config. |
| `config/runtime-config.ts` | Converts parsed env into typed app runtime config. |
| `inbound/http/app.ts` | Creates the HTTP app and registers middleware/routes. |
| `inbound/http/middleware/auth-context.ts` | Hono middleware that extracts request credentials, calls the configured auth verifier, normalizes `AuthContext`, and attaches it to the Hono request context. |
| `inbound/http/middleware/require-auth.ts` | Hono middleware/route guard that rejects protected routes before protocol parsing, model calls, tools, or persistence run. |
| `routes/chat-stream.ts` | Validates HTTP/protocol headers, parses request body, invokes stream use case. |
| `response/sse.ts` | Converts typed protocol events to SSE bytes. |
| `composition/container.ts` | Small composition root that combines layer builders and starts the app runtime. |
| `composition/layers/*` | Effect layer builders for core, runtime, persistence, auth, billing, rate limiting, telemetry, and outbound services. |
| `composition/registries/*` | Runtime registries for providers, tools, models, and other selectable capabilities. |
| `outbound/auth/*` | Concrete authentication/verifier adapters, including Azure SSO/JWT/gateway/dev-static where accepted. They verify external credentials and return normalized identity claims; they do not own product authorization policy. |
| `outbound/persistence/*` | Connects partner-ai-core repositories to `packages/db`. |
| `outbound/tools/*` | External business-system tool adapters exposed to `agent-runtime` through explicit ports/tool registry entries. |
| `outbound/http-clients/*` | Shared low-level HTTP client helpers for outbound integrations only. |

Effect v4 role in this app:

- parse and validate environment/config with typed errors
- compose production and test layers
- run the HTTP process with managed resources and graceful shutdown
- attach request id, trace id, logs, metrics, and spans to request lifecycles
- translate Effect application failures into HTTP responses or `sidechat.v1` error events

## 9. Package: `packages/chat-protocol`

This package owns the browser/backend product contract.

It owns:

- protocol version
- request schema
- stream event schemas
- canonical assistant activity event schema
- host context and host command wire shapes
- error event shapes
- usage metadata
- SSE encoding/decoding
- stream sequence rules
- compatibility fixtures
- protocol schema source of truth, preferably Effect Schema if accepted by ADR
- `[Deferred]` approval request/resolution event shapes, only when human approval flow is accepted

It does not own:

- HTTP server implementation
- AI SDK or model provider implementation
- widget rendering
- database access
- business workflow orchestration
- Effect runtime requirements for browser consumers

Folder structure:

```txt
packages/chat-protocol/
  package.json
  tsconfig.json
  src/
    index.ts
    sidechat-v1/
      version.ts
      routes.ts
      headers.ts
      primitives.ts
      message.ts
      model.ts
      usage.ts
      citation.ts
      host-context.ts
      host-command.ts
      request.ts
      request.test.ts
      events/
        started-event.ts
        delta-event.ts
        activity-event.ts
        completed-event.ts
        error-event.ts
        history-event.ts
        event-union.ts
        event-union.test.ts
      errors.ts
      sse-codec.ts
      sse-codec.test.ts
      sequence.ts
      sequence.test.ts
      validation.ts
      artifacts.ts
    generated/
      json-schema/
        sidechat-v1.schema.json
      openapi/
        partner-ai-service.openapi.json
    fixtures/
      success-stream.json
      error-stream.json
      malformed-stream.json
      fixtures.test.ts
```

`[Deferred]` approval extension files, if approval becomes day-one product behavior:

```txt
packages/chat-protocol/src/sidechat-v1/
  approval.ts
  events/
    approval-requested-event.ts
    approval-resolved-event.ts
  fixtures/
    approval-stream.json
```

The source schemas are the source of truth. JSON Schema/OpenAPI are generated artifacts. If Effect Schema is accepted, this package may use Effect Schema as the canonical schema language, but public consumers should still be able to use plain TypeScript types and generated JSON Schema/OpenAPI without adopting Effect runtime patterns.

## 10. Package: `packages/partner-ai-core`

This package owns the product/application core for Partner AI.

It owns:

- application use cases as Effect v4 programs
- pure domain concepts
- ports
- policies
- application error model
- mapping agent-runtime events to product protocol events
- service tags/layers for dependencies used by use cases

It does not own:

- HTTP framework
- AI SDK objects
- provider SDK objects
- Postgres clients
- React state
- browser APIs
- process environment parsing
- concrete production layers

Folder structure:

```txt
packages/partner-ai-core/
  package.json
  tsconfig.json
  src/
    index.ts
    domain/
      conversation.ts
      message.ts
      assistant-turn.ts
      agent-event.ts
      model-selection.ts
      tool-call.ts
      citation.ts
      usage.ts
      host-command.ts
    application/
      stream-chat/
        stream-chat.ts
        stream-chat.test.ts
        stream-chat-input.ts
        stream-chat-services.ts
        request-normalizer.ts
        event-factory.ts
        agent-event-mapper.ts
        terminal-event-policy.ts
        usage-policy.ts
        citation-policy.ts
        host-command-policy.ts
        stream-observer.ts
      history/
        read-history.ts
        read-history.test.ts
        reset-history.ts
        reset-history.test.ts
      models/
        list-models.ts
      usage/
        read-usage.ts
    ports/
      agent-runtime-port.ts
      conversation-repository.ts
      usage-repository.ts
      host-context-port.ts
      host-command-state-port.ts
      auth-port.ts
      rate-limit-port.ts
      billing-port.ts
      observability-port.ts
      clock-port.ts
      id-generator-port.ts
    services/
      agent-runtime-service.ts
      conversation-repository-service.ts
      usage-repository-service.ts
      auth-service.ts
      rate-limit-service.ts
      billing-service.ts
      observability-service.ts
      clock-service.ts
      id-generator-service.ts
    policies/
      model-availability-policy.ts
      model-availability-policy.test.ts
      conversation-access-policy.ts
      stream-sequence-policy.ts
    errors/
      application-error.ts
      unauthorized-error.ts
      rate-limited-error.ts
      billing-denied-error.ts
      model-unavailable-error.ts
      persistence-error.ts
```

Key responsibilities:

| File or folder | Responsibility |
| --- | --- |
| `domain/*` | Pure product concepts and type helpers. No IO. |
| `application/stream-chat/stream-chat.ts` | Main assistant turn orchestration as an Effect program. |
| `agent-event-mapper.ts` | Maps agent-runtime events into `chat-protocol` events. |
| `terminal-event-policy.ts` | Guarantees exactly one terminal stream event. |
| `ports/agent-runtime-port.ts` | Framework-free port for running assistant turns. |
| `services/*` | Effect service tags for dependency injection and test/production layer composition. |
| `ports/*` | Interfaces required by core. No concrete implementations. |
| `errors/*` | Typed application errors for adapters to map. |

`[Deferred]` approval files, if approval becomes day-one product behavior:

```txt
packages/partner-ai-core/src/
  domain/
    approval.ts
  application/stream-chat/
    approval-policy.ts
```

Effect v4 role in `partner-ai-core`:

- model every use case as `Effect<Success, ApplicationError, Services>`
- make core ports Effect-shaped for async/failing dependencies instead of Promise-shaped
- expose assistant output as `Stream<SidechatStreamEvent, PartnerAiCoreError>`
- keep expected failures in the typed error channel, not as unknown thrown exceptions
- use services/layers instead of manually threading large dependency objects through every use case
- use `Stream` for assistant event streams and SSE-ready event production
- use `Scope`/resource safety for any acquired resources exposed through services
- adapt Promise-based HTTP, DB, telemetry, and policy libraries in app/service adapters before they enter core
- keep pure domain helpers plain TypeScript when no Effect capability is needed

## 11. Package: `packages/agent-runtime`

This package owns AI SDK 6-powered assistant orchestration.

Day-one owns:

- assistant profile defaults
- AI SDK 6 Agent / ToolLoopAgent integration as the primary assistant execution boundary
- Effect v4 runtime programs around agent execution
- Effect-based runtime tool protocol and registry
- model provider protocol and private provider resolution
- provider adapters
- usage/raw finish reason mapping
- DevTools/trace integration
- fake provider for deterministic tests if not placed in `packages/testing`

Deferred capabilities:

- `[Deferred]` approval integration, until human approval is accepted as product behavior
- `[Deferred]` MCP tool adaptation, until external MCP servers are approved trust zones
- `[Deferred]` structured final output configuration, until the product requires schema-validated final plans/answers
- `[Deferred]` reranking integration, until retrieval exists

It does not own:

- HTTP routes
- product protocol schemas
- widget rendering
- host app state
- DB clients
- app process startup
- browser-facing Effect APIs

Folder structure:

```txt
packages/agent-runtime/
  README.md
  package.json
  tsconfig.json
  src/
    index.ts
    runtime/
      agent-runtime.ts
      agent-runtime.test.ts
      contract/
        runtime-request.ts
        runtime-event.ts
        runtime-error.ts
        runtime-stream.ts
      turn/
        assistant-profile.ts
        prepare-runtime-turn.ts
        provider-selection.ts
        tool-selection.ts
        prompt-rendering.ts
      ai-sdk/
        tool-loop-agent-runner.ts
        ai-sdk-tool-adapter.ts
        ai-sdk-tool-adapter.test.ts
        runtime-tool-executor.ts
        reasoning-activity.ts
        stream-part-mapper.ts
        tool-activity-mapper.ts
    tools/
      runtime-tool.ts
      tool-registry.ts
      tool-registry.test.ts
    providers/
      model-provider.ts
      openai/
        openai-model-provider.ts
        openai-model-provider.test.ts
      fake/
        fake-model-provider.ts
        fake-model-provider.test.ts
    testing/
      mock-runtime-tool.ts
      scripted-language-model.ts
```

Concrete product tools do not live under `packages/agent-runtime/src/tools/`.
They live in the consuming app as ports/adapters, then get injected through the
runtime tool protocol.

`[Example]` provider folders. Day one requires the provider protocol, fake
provider, and one accepted real provider adapter; these names are candidates,
not automatic scaffold scope:

```txt
packages/agent-runtime/src/providers/
  openai/
  anthropic/
  azure-openai/
  ai-gateway/
  local/
```

`[Deferred]` extension folders:

```txt
packages/agent-runtime/src/
  approvals/
  mcp/
  structured-output/
```

Key file responsibilities:

| File or folder | Responsibility |
| --- | --- |
| `runtime/agent-runtime.ts` | Entry point that builds the runtime from injected providers/tools/profiles and exposes the Effect `streamEffect` surface. |
| `runtime/contract/*` | Public request, event, error, and stream contracts. |
| `runtime/turn/*` | Decides profile, provider/model, allowed tools, and final prompt messages before the model starts. |
| `runtime/ai-sdk/tool-loop-agent-runner.ts` | Creates and runs AI SDK `ToolLoopAgent` instances from resolved provider/model, rendered messages, and selected tool capabilities. |
| `runtime/ai-sdk/ai-sdk-tool-adapter.ts` | Converts runtime tools into AI SDK tools. |
| `runtime/ai-sdk/runtime-tool-executor.ts` | Interprets app-owned RuntimeTool Effects for AI SDK callbacks, including abort and declared timeout handling. |
| `runtime/ai-sdk/*-mapper.ts`, `reasoning-activity.ts` | Maps AI SDK stream parts into internal `RuntimeEvent` values. |
| `tools/*` | Runtime tool protocol and reusable registry. Concrete product tools live in the consuming app as ports/adapters. |
| `providers/model-provider.ts` | Defines provider adapters as model/option resolvers, not assistant-turn orchestrators. |
| `providers/<real-provider>/*` | Accepted real provider behavior only. Concrete provider name is chosen by ADR/config. |
| `providers/fake/*` | Deterministic provider for tests and local no-credential runs. |
| `[Deferred] approvals/*` | Human-in-the-loop approval mechanics before sensitive tool execution. |
| `[Deferred] mcp/*` | MCP client/tool adaptation with explicit security policy. |
| `[Deferred] structured-output/*` | Typed final answer/command/citation outputs after tool loops. |

AI SDK orchestration rule:

- The main product assistant path is AI SDK 6 `Agent` / `ToolLoopAgent` first. If a flow has a reusable assistant profile, tools, provider selection, stop rules, telemetry, or future approval/structured-output hooks, it belongs behind an Agent-compatible runtime boundary.
- `streamText` is a low-level primitive. It may appear inside the Agent/ToolLoopAgent implementation, tests, or explicitly accepted tiny non-agent utilities such as title generation, summarization, or classification. It must not become the public runtime orchestrator for chat.
- `partner-ai-service` and `partner-ai-core` must call the `agent-runtime` port through `AgentRuntimePort.streamEffect`, not `streamText`, provider SDKs, raw provider HTTP, or package-level compatibility wrappers.
- Do not hand-roll a recursive model -> tool -> model loop unless an ADR proves AI SDK Agent / ToolLoopAgent cannot express the required behavior.
- Tool availability is derived from runtime composition, assistant profile, product policy, and trusted context. It is not a user-controlled request field.
- Registered runtime tools are app-owned capabilities that satisfy the Effect-based runtime tool protocol. They are converted into AI SDK tools inside `agent-runtime`; the model chooses a tool and its input through the `ToolLoopAgent`.
- Runtime tools must not expose `shouldInvoke`, `createInput`, or pre-model progress hooks. Those fields make the backend choose and run tools before the agent acts.
- Tool output returns to the model through the AI SDK tool loop. The runtime observes AI SDK `tool-input-start`, `tool-call`, `tool-result`, and `tool-error` stream parts and maps them into normalized runtime activity events.
- Awaiting AI SDK `agent.stream(...)` only opens the provider/tool-loop stream handle. It must not be treated as buffering the full assistant answer; the answer continues through `result.fullStream` and is mapped as parts arrive.
- Do not call OpenAI/Anthropic/Azure/etc. through raw `fetch` for normal assistant execution unless an ADR documents the provider gap, the allowed file boundary, and the removal condition.
- Product policy may run before/after the AI SDK call: auth, tenancy, model availability, conversation persistence, host context trust, usage recording, protocol mapping, and terminal-event guarantees.
- AI SDK UI messages and provider-native stream parts remain internal runtime details; the browser still receives only `chat-protocol` events.
- Runtime constants use exported constant objects with uppercase property names, such as `RUNTIME_EVENT_TYPES.OUTPUT_DELTA`; do not reintroduce string literals for protocol, runtime, error, route, provider/model, tool, or environment names.

Runtime event shape:

```txt
RuntimeEvent
  | runtime.started
  | runtime.output_delta
  | runtime.activity
  | runtime.completed
  | runtime.error
```

These events are internal. `partner-ai-core` maps them into `sidechat.v1`.

`[Deferred]` runtime events:

```txt
AgentRuntimeEvent
  | approval-requested
  | approval-resolved
```

Effect v4 role in `agent-runtime`:

- wrap AI SDK agent/tool-loop execution in typed Effect programs
- keep the AI SDK ToolLoopAgent runner as an Effect `Stream` internally
- expose only `streamEffect` as the package runtime surface
- use `Stream` for text, reasoning, tool, host-command, completion events, and `[Deferred]` approval events if approval is accepted
- require runtime tools to execute through Effect at the interface level
- use structured concurrency for parallel tool/retrieval work that must be cancelled together
- use timeouts, retries, schedules, and typed provider/tool errors around model and tool calls
- use application and core layers for service composition, and use the runtime provider protocol for OpenAI, Anthropic, Azure OpenAI, AI Gateway, local, and fake providers
- attach telemetry spans around each assistant step, provider call, tool call, stream lifecycle, and `[Deferred]` approval wait if approval is accepted
- keep AI SDK objects and provider-native chunks internal to this package

## 12. Package: `packages/chat-client`

This package owns the browser/client transport layer.

It owns:

- typed fetch client
- SSE stream reader
- request construction helpers
- history and usage client calls
- retry/error behavior
- plain Promise/AsyncIterable APIs for browser and non-React consumers

It does not own:

- React state
- widget UI
- partner-ai-core use cases
- provider APIs
- Effect runtime requirements for consumers

Folder structure:

```txt
packages/chat-client/
  package.json
  tsconfig.json
  src/
    index.ts
    client/
      create-chat-client.ts
      create-chat-client.test.ts
      chat-client-types.ts
      stream-chat.ts
      history.ts
      usage.ts
      models.ts
    transport/
      fetch-transport.ts
      request-headers.ts
      response-errors.ts
      abort.ts
    stream/
      stream-reader.ts
      stream-reader.test.ts
      frame-buffer.ts
      malformed-event-policy.ts
    retry/
      retry-policy.ts
      retry-policy.test.ts
      backoff.ts
    errors/
      chat-client-error.ts
```

Effect v4 role in the client:

- no required Effect runtime in the public API
- `[Optional]` internal schema validation is acceptable if it does not force consumers to run Effect programs
- expose browser-friendly `Promise` and `AsyncIterable` APIs
- keep errors as client error classes or discriminated unions, not Effect-only types

`[Deferred]` approval client file, if approval becomes product behavior:

```txt
packages/chat-client/src/client/
  approvals.ts
```

## 13. Package: `packages/side-chat-widget`

This package owns the reusable React widget.

It owns:

- React components
- widget state orchestration
- protocol-event-to-UI projection
- composer behavior
- panel behavior
- host bridge integration at the widget boundary
- `[Optional]` iframe-ready sizing signals if packaged as an embeddable shell

It does not own:

- host app routes
- host app state
- database access
- provider SDKs
- agent-runtime internals
- HTTP server routes
- required Effect runtime knowledge for host apps

Folder structure:

The widget UI uses the trimmed Feature-Sliced Design shape defined in
`docs/architecture/widget-ui-system-design.md`. This package intentionally uses
only `widgets`, `features`, `entities`, and `shared`; it does not use FSD
`pages`, `processes`, or `app` layers.

```txt
packages/side-chat-widget/
  package.json
  tsconfig.json
  src/
    index.ts
    styles.css
    widgets/
      side-chat/
        index.ts
        model/
          side-chat-widget.types.ts
        ui/
          side-chat-widget.tsx
    features/
      chat/
      conversation/
      panel/
      prompt/
    entities/
      chat/
        model/
          activity.ts
      panel/
    shared/
      ui/
        badge.tsx
        button.tsx
        button-group.tsx
        carousel.tsx
        collapsible.tsx
        command.tsx
        dialog.tsx
        dropdown-menu.tsx
        hover-card.tsx
        input.tsx
        input-group.tsx
        scroll-area.tsx
        select.tsx
        separator.tsx
        tooltip.tsx
        textarea.tsx
        spinner.tsx
      ai/
        code-block.tsx
        chain-of-thought.tsx
        conversation.tsx
        image.tsx
        inline-citation.tsx
        message.tsx
        model-selector.tsx
        prompt-input.tsx
        reasoning.tsx
        shimmer.tsx
        sources.tsx
        suggestion.tsx
        tool.tsx
      lib/
        cn.ts
        unknown-record.ts
```

`[Deferred]` approval widget files, if approval becomes product behavior:

```txt
packages/side-chat-widget/src/features/approval/
  model/
    approval-state.ts
  ui/
    approval-part.tsx
```

Effect v4 role in the widget:

- prefer plain React hooks, reducer state, and pure domain helpers
- do not expose Effect programs from widget public props or hooks
- do not require external host apps to understand Effect
- use protocol/client outputs as plain events and state transitions
- only consider Effect internally if a real widget workflow becomes complex enough to justify it

UI source ownership rule:

- `shared/ui/*` owns copied/adapted shadcn-style primitives as source code.
  Components may use `@base-ui/react/*`, `class-variance-authority`, Tailwind 4
  classes, `shared/lib/cn`, `lucide-react`, and accepted behavior dependencies
  needed for exact component parity.
- `shared/ai/*` owns copied/adapted AI Elements-style conversation, message,
  reasoning, chain-of-thought activity, tool, image, source, citation,
  suggestion, model selector, and prompt input pieces as source code. These
  components may compose `shared/ui`,
  `shared/lib/cn`, React, Tailwind classes, `ai-elements`, `ai`, `motion`,
  Streamdown packages, and the other accepted widget UI/runtime dependencies.
- Widget or feature UI owns the product adapter layer: it maps widget state and
  protocol projections into generic `shared/ai` props.
- `shared/ui` and `shared/ai` must not import widget state, product features,
  product entities, `chat-client`, `host-bridge`, provider SDKs, service
  internals, database code, or agent-runtime internals.
- No widget source imports `shadcn`, `@repo/shadcn-ui`, generated shadcn registry
  packages, Radix UI packages, or generated code that must be re-run by the
  consuming host app.

Primitive implementation shape:

```tsx
import { Button as ButtonPrimitive } from "@base-ui/react/button";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "../lib/cn";
```

Keep variant definitions beside the primitive, export only through the package/widget public entrypoints that are intended for consumers, and treat copied component code as editable first-party source.

## 14. Package: `packages/host-bridge`

This package defines the contract between the widget and an external host app.

It owns:

- host context provider types
- host command dispatcher types
- host capability descriptors
- command result types
- `[Optional]` helpers for validating supported resources/commands
- `[Optional]` iframe postMessage contract if iframe embedding is supported

It does not own:

- React widget rendering
- host app state
- backend execution
- provider APIs

Folder structure:

```txt
packages/host-bridge/
  package.json
  tsconfig.json
  src/
    index.ts
    host-context-provider.ts
    host-command-dispatcher.ts
    host-capability.ts
    host-resource.ts
    command-result.ts
    validation.ts
    validation.test.ts
    helpers/
      supports-command.ts
      supports-command.test.ts
      supports-resource.ts
      create-unsupported-result.ts
```

`[Optional]` iframe bridge files, if iframe embedding is supported:

```txt
packages/host-bridge/src/
    iframe/
      embed-messages.ts
      embed-messages.test.ts
      parent-origin-policy.ts
      resize-message.ts
      command-bridge.ts
```

Host command and host context wire schemas may live in `chat-protocol`. `host-bridge` adds ergonomic integration types and helpers for external host apps.

## 15. Package: `packages/db`

This package owns database access.

It implements the day-one DB schema contract from section 3.1. The contract is accepted before repositories and migrations are written.

It owns:

- schema contract types and repository command contract types
- Postgres client/pool construction with `pg`
- Drizzle schema, relations, migrations, and query helpers
- repository implementations
- `[Deferred]` stored-function facades if a later hardening ADR accepts them
- DB row parsing
- test harnesses for DB security and migrations
- Effect services/layers for DB resources and transactions

It does not own:

- HTTP routes
- partner-ai-core use-case orchestration
- widget state
- provider APIs
- `agent-runtime` behavior

Folder structure:

```txt
packages/db/
  package.json
  tsconfig.json
  drizzle.config.ts
  src/
    index.ts
    schema-contract/
      db-identity-contract.ts
      db-lifecycle-contract.ts
      db-role-contract.ts
      conversation-contract.ts
      message-contract.ts
      assistant-turn-contract.ts
      turn-context-snapshot-contract.ts
      usage-contract.ts
      tool-invocation-contract.ts
      host-command-contract.ts
      audit-contract.ts
      repository-command-contract.ts
    drizzle/
      schema.ts
      relations.ts
      tables/
        conversations.table.ts
        messages.table.ts
        assistant-turns.table.ts
        turn-context-snapshots.table.ts
        usage-records.table.ts
        tool-invocations.table.ts
        host-command-results.table.ts
        audit-events.table.ts
    client/
      create-pool.ts
      create-drizzle.ts
      db-executor.ts
      transaction.ts
      db-layer.ts
    repositories/
      conversation-repository.ts
      conversation-repository.test.ts
      usage-repository.ts
      usage-repository.test.ts
    queries/
      conversation-queries.ts
      message-queries.ts
      assistant-turn-queries.ts
      turn-context-snapshot-queries.ts
      usage-queries.ts
      tool-invocation-queries.ts
      host-command-queries.ts
      audit-queries.ts
    rows/
      conversation-row.ts
      message-row.ts
      assistant-turn-row.ts
      turn-context-snapshot-row.ts
      usage-row.ts
      tool-invocation-row.ts
      host-command-row.ts
      audit-row.ts
    parsing/
      parse-conversation-row.ts
      parse-message-row.ts
      parse-assistant-turn-row.ts
      parse-turn-context-snapshot-row.ts
      parse-usage-row.ts
      parse-tool-invocation-row.ts
      parse-host-command-row.ts
      parse-audit-row.ts
    errors/
      db-error.ts
    services/
      db-service.ts
  migrations/
    0001_schema_contract.sql
    0002_runtime_roles_and_grants.sql
    migrations.test.ts
    schema-security.test.ts
```

Effect v4 role in DB:

- manage pool lifecycle as a scoped resource
- represent DB failures with typed errors
- wrap transactions in resource-safe Effect programs
- provide repository live layers for partner-ai-core repository services
- keep `pg`, Drizzle, SQL, and row details out of partner-ai-core and agent-runtime

## 16. Package: `packages/testing`

This package owns shared test utilities.

It owns:

- deterministic fake provider/model
- protocol builders
- mock stream helpers
- contract assertions
- browser/client test fixtures

It does not own:

- production code paths
- product behavior not used by tests
- runtime app startup

Folder structure:

```txt
packages/testing/
  package.json
  tsconfig.json
  src/
    index.ts
    builders/
      request-builder.ts
      event-builder.ts
      message-builder.ts
      host-context-builder.ts
      builders.test.ts
    fake-provider/
      fake-provider-adapter.ts
      fake-provider-adapter.test.ts
      fake-stream-script.ts
    assertions/
      assert-valid-stream.ts
      assert-terminal-event.ts
      assert-no-provider-leak.ts
      assert-no-ai-sdk-leak.ts
    mock-server/
      create-mock-chat-server.ts
      scripted-stream-response.ts
    fixtures/
      protocol-fixtures.ts
```

`[Deferred]` approval test builder, if approval becomes product behavior:

```txt
packages/testing/src/builders/
  approval-builder.ts
```

## 17. Infrastructure

Infrastructure should distinguish local development from production.

Folder structure:

```txt
infra/
  local/
    docker-compose.yml
    postgres.env.example
    README.md
  docker/
    Dockerfile.partner-ai-service
    docker-entrypoint.sh
  production/
    README.md
    terraform/
      main.tf
      variables.tf
      outputs.tf
    k8s/
      partner-ai-service.deployment.yaml
      partner-ai-service.service.yaml
      partner-ai-service.hpa.yaml
    secrets/
      README.md
```

Production infrastructure should cover managed database, secret manager, logs/metrics/traces, autoscaling, rollback, migration execution, backup/restore, and external rate limiting dependency if needed.

## 18. Documentation

Docs should be durable and small enough to stay accurate.

Folder structure:

```txt
docs/
  architecture/
    overview.md
    protocol.md
    partner-ai-core-boundaries.md
    agent-runtime.md
    widget-integration.md
    data-persistence.md
    observability.md
  decisions/
    ADR-0001-modular-monolith.md
    ADR-0002-product-protocol.md
    ADR-0003-no-host-app.md
    ADR-0004-partner-ai-core-package.md
    ADR-0005-database-boundary.md
    ADR-0006-ai-sdk-agent-runtime.md
  operations/
    local-dev.md
    ci.md
    deploy.md
    migrations.md
    rollback.md
    incident-response.md
```

## 19. Scripts

Scripts should make repository rules executable.

```txt
scripts/
  check-boundaries.mjs
  check-dependency-policy.mjs
  check-version-pins.mjs
  check-package-exports.mjs
  check-runtime-boundaries.mjs
  check-outbound-rules.mjs
  check-source-governance.mjs
  check-generated-artifacts.mjs
  verify.mjs
  generate-protocol-artifacts.mjs
  create-migration.mjs
```

Governance checks should fail when product protocol, `partner-ai-core`, widget, DB, and `agent-runtime` boundaries drift.

Command shape:

| Command | Responsibility |
| --- | --- |
| `npm run lint` | Oxlint plus architecture governance scripts. |
| `npm run typecheck` | `tsc -b` across root project references. |
| `npm test` | Colocated unit/integration/contract tests that do not need browser automation. |
| `npm run test:e2e` | Browser harness tests only. |
| `npm run verify` | Install-safe full local/CI gate: lint, typecheck, tests, generated artifact checks, package export checks. |

Script responsibilities:

| Script | Responsibility |
| --- | --- |
| `check-boundaries.mjs` | Forbidden imports across packages, layers, and inbound/outbound boundaries. |
| `check-dependency-policy.mjs` | Dependency allowlists, pinned versions, package-level runtime/dev dependency placement. |
| `check-version-pins.mjs` | Exact-version enforcement for strategic packages listed in section 0.1; no `^`, `~`, `latest`, or duplicated conflicting versions. |
| `check-package-exports.mjs` | Public entrypoint discipline and no deep imports by consumers. |
| `check-runtime-boundaries.mjs` | No framework/provider/DB/browser/env objects crossing into domain, use cases, ports, protocol, client, or widget public APIs. |
| `check-outbound-rules.mjs` | External-service calls live under outbound adapters or approved provider/runtime adapter folders, not in use cases or tool definitions. |
| `check-source-governance.mjs` | Test placement, source line budgets, tracked artifact bans, strict tsconfig inheritance, project references, double-assertion bans, and local `ToolLoopAgent` shadow bans. |
| `check-generated-artifacts.mjs` | Generated JSON Schema/OpenAPI/declaration artifacts are current. |

## 20. TypeScript Discipline

TypeScript is part of the architecture. It should make illegal states and illegal dependencies hard to express, not merely compile JavaScript.

### 20.1 Project Structure

Use project references from the root:

```txt
tsconfig.base.json          shared strict compiler options
tsconfig.json               root references only
apps/*/tsconfig.json        app typecheck config
packages/*/tsconfig.json    package typecheck config
packages/*/tsconfig.build.json
                            declaration/build config when different from tests
```

Rules:

- every app/package has its own `tsconfig.json`
- root `tsconfig.json` references every app/package
- package builds emit declarations when the package has a public API
- test files are included in typecheck, excluded from package declaration builds
- path aliases may point to package public entrypoints, not deep internals

### 20.2 Compiler Defaults

The base config should default to:

```json
{
  "compilerOptions": {
    "strict": true,
    "exactOptionalPropertyTypes": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true,
    "noPropertyAccessFromIndexSignature": true,
    "useUnknownInCatchVariables": true,
    "isolatedModules": true,
    "verbatimModuleSyntax": true
  }
}
```

Platform options may differ by package. Browser libraries and bundled packages may use bundler-style module resolution. Node-only service packages may use Node-style module resolution. Strictness options should not differ without a documented ADR.

### 20.3 Type Safety Rules

Forbidden by default:

- `any`
- `as any`
- double assertions such as `value as unknown as T`
- `@ts-ignore`
- non-null assertions for normal control flow
- untyped `catch (error)` handling beyond `unknown`
- unvalidated `JSON.parse` results crossing a boundary
- public exports that expose provider SDK, AI SDK UI message, DB row, HTTP framework, or Effect runtime internals where forbidden by package boundary

Allowed with constraints:

- `unknown` at external boundaries, followed by schema parsing or narrowing
- `@ts-expect-error` only in type tests, with a short reason
- type assertions only next to a proven runtime check, schema parser, or narrow interop boundary
- non-null assertions only in tests or after a local invariant helper that throws a typed defect

### 20.4 Public API Typing

Every package public entrypoint must be declaration-safe:

- exports come from `src/index.ts`
- public types are named and intentional
- public APIs avoid leaking internal helper types
- public APIs avoid deep conditional types that make consumer errors unreadable
- browser-facing packages expose plain TypeScript types, `Promise`, `AsyncIterable`, callbacks, and React props
- server/core packages may expose Effect programs when the consumer is another server package

Package API checks should catch accidental deep imports and accidental public exports.

### 20.5 Runtime Boundary Validation

TypeScript does not validate runtime input. Parse data at every IO boundary:

| Boundary | Required validation |
| --- | --- |
| HTTP request body/query/headers | `chat-protocol` schemas or route-local schemas. |
| SSE incoming frames | `chat-protocol` event parser. |
| Environment variables | config schema before app startup. |
| DB rows | row parser before repository returns data. |
| External service responses | outbound adapter parser before returning to core/runtime. |
| Model/provider tool input/output | agent-runtime tool schemas. |
| Browser storage/postMessage | client/widget/host-bridge parser before state mutation. |

If a value comes from outside the current trust boundary, it starts as `unknown`.

### 20.6 Exhaustiveness

Discriminated unions are preferred for:

- protocol events
- assistant activity states
- `agent-runtime` events
- application errors
- host commands
- tool states
- provider selections

Switches over these unions must be exhaustive. Missing cases should fail typecheck or lint.

### 20.7 Type-Aware Oxlint

Oxlint should run with type information for source files. Required rule families:

- no unsafe `any` usage
- no floating promises
- no misused promises
- consistent type imports/exports
- exhaustive switch checks
- no unnecessary conditions
- restricted template expressions
- no direct package-internal imports across package boundaries
- no forbidden framework/provider/DB imports outside allowed folders

Lint should be architecture-aware, not only style-aware.

### 20.8 Type Tests

Use type tests where public contracts matter:

```txt
src/index.type.test.ts
src/sidechat-v1/events/event-union.type.test.ts
```

Type tests should prove:

- public APIs do not expose forbidden internal/provider/runtime types
- invalid protocol shapes fail at compile time where possible
- model/provider catalog types preserve allowed model ids
- host commands remain discriminated and exhaustive
- generated declaration files are consumer-safe

Prefer `expectTypeOf` or a dedicated type-test runner. Use `@ts-expect-error` only in type tests and only with a reason.

### 20.9 TypeScript Governance Checks

Checks should fail if:

- a package is missing from root project references
- a package lacks its own `tsconfig.json`
- `strict` options are weakened without an ADR
- `any`, `as any`, `@ts-ignore`, or unsafe double assertions appear outside allowlisted interop/type-test files
- a public declaration leaks forbidden internal/provider/runtime types
- a source file imports from another package's internal path
- generated declarations or generated protocol artifacts are stale

## 21. Lint And Restriction Design

Linting is the first automated architecture reviewer. It should enforce style only where style affects readability, but it must enforce boundaries aggressively.

### 21.1 Gate Layers

| Layer | Tool shape | Owns |
| --- | --- | --- |
| TypeScript | `tsc -b` | Type correctness, project references, declaration safety. |
| Oxlint | type-aware Oxlint config | Local code safety, async mistakes, React rules, import hygiene. |
| Boundary scripts | custom `scripts/check-*.mjs` | Repo-specific architecture restrictions. |
| Test runner | Vitest and browser harness | Behavior, contracts, integration paths. |
| Generated artifact checks | custom script | JSON Schema/OpenAPI/declarations stay current. |
| Pipeline/local gate | `npm run verify` | Runs the same gates locally and in whatever external pipeline adopts the repo. |

### 21.2 Oxlint Rule Groups

Oxlint should catch local mistakes and obvious boundary violations while the custom governance scripts catch repo-wide architecture drift.

Recommended baseline tools:

```txt
oxlint
oxfmt
```

Exact OXC versions may change intentionally, but these rule groups should remain.

TypeScript safety rules:

| Rule intent | `[Example]` rules |
| --- | --- |
| No unsafe values | `typescript/no-explicit-any`, `no-unsafe-assignment`, `no-unsafe-call`, `no-unsafe-member-access`, `no-unsafe-return`, `no-unsafe-argument`. |
| No careless casts | `consistent-type-assertions`, `no-unnecessary-type-assertion`, ban `as any`, ban unsafe double assertions through custom `no-restricted-syntax`. |
| Exhaustive unions | `typescript/switch-exhaustiveness-check`, plus type tests for public discriminated unions. |
| Precise optional/null handling | `strict-boolean-expressions`, `no-unnecessary-condition`, `prefer-nullish-coalescing`, `prefer-optional-chain`. |
| Safe stringification | `restrict-template-expressions`, `no-base-to-string`. |
| Type-only hygiene | `consistent-type-imports`, `consistent-type-exports`, `no-import-type-side-effects`. |

Async and Effect-adjacent safety rules:

| Rule intent | `[Example]` rules |
| --- | --- |
| No dropped async work | `typescript/no-floating-promises`. |
| No async where a boolean/void callback is expected | `typescript/no-misused-promises`. |
| No fake awaits | `typescript/await-thenable`, `require-await`. |
| Explicit process edges | Promises started in `server.ts`, routes, CLI scripts, and test setup must be awaited, returned, or intentionally detached with a named helper. |
| Effect runtime boundary | Do not use Oxlint alone for this; `check-runtime-boundaries.mjs` should verify Effect does not leak into browser public APIs. |

Import and module rules:

| Rule intent | `[Example]` rules |
| --- | --- |
| No cycles | `import-x/no-cycle` for package source. |
| No duplicate imports | `no-duplicate-imports` or `import-x/no-duplicates`. |
| No deep package imports | `no-restricted-imports` plus `check-package-exports.mjs`. |
| No forbidden framework/provider imports | `no-restricted-imports` for obvious package bans, backed by `check-boundaries.mjs`. |
| No undeclared dependencies | `import-x/no-extraneous-dependencies` where compatible with npm workspaces. |
| Stable type imports | `typescript/consistent-type-imports`. |

Code-shape rules:

| Rule intent | `[Example]` rules |
| --- | --- |
| No hidden mutation surprises | Prefer `const`, no parameter reassignment except explicit reducer-style allowlists. |
| No unclear control flow | `no-fallthrough`, `no-else-return`, `no-unreachable`, `no-implicit-coercion`. |
| No nested ternaries | `no-nested-ternary`; prefer named functions or explicit `if` blocks. |
| No dense conditionals | `complexity`, `max-depth`, `max-nested-callbacks`, `max-lines-per-function`, `max-statements` with package-specific budgets. |
| No broad console logging | `no-console` in production source except app startup/logger adapters. |
| No debugger or alert | `no-debugger`, `no-alert`. |
| No magic comments hiding errors | Ban `@ts-ignore`; allow `@ts-expect-error` only in type tests with a description. |
| No unexplained literals | `no-magic-numbers` only for selected source areas; custom string-literal checks for protocol/error/route/model/provider/event codes. |

React/widget rules:

| Rule intent | `[Example]` rules |
| --- | --- |
| Hook correctness | `react-hooks/rules-of-hooks`, `react-hooks/exhaustive-deps`. |
| Accessibility basics | `jsx-a11y` rules for interactive elements, labels, keyboard handlers, and ARIA validity. |
| Browser package isolation | Widget/client code must not import Node-only modules, server config, provider SDKs, DB, or app internals. |
| Stable UI contracts | Widget public exports come from `src/index.ts`; internal component imports by consumers are forbidden by package-export checks. |

Vitest/test rules:

| Rule intent | `[Example]` rules |
| --- | --- |
| No committed focused tests | `vitest/no-focused-tests`. |
| No disabled tests without quarantine | `vitest/no-disabled-tests` except explicitly allowlisted quarantine files. |
| Valid expectations | `vitest/valid-expect`, `vitest/expect-expect` where useful. |
| No real providers by default | Custom script check: tests must use fake providers unless marked as explicit integration tests. |
| Type-test escape hatches | `@ts-expect-error` allowed in `*.type.test.ts` only with a reason. |

### 21.3 Oxlint Overrides

Use overrides by file ownership, not one global compromise.

| Files | Extra rules / allowances |
| --- | --- |
| `packages/chat-protocol/src/**` | Ban React, HTTP frameworks, AI SDK, provider SDKs, pg, Drizzle, `partner-ai-core`, widget, browser globals except standard serialization APIs. |
| `packages/partner-ai-core/src/domain/**`, `packages/partner-ai-core/src/policies/**` | Ban IO imports, process env, timers as globals, framework/provider/DB/browser modules, and app composition. |
| `packages/partner-ai-core/src/application/**` | Ban concrete adapters, outbound clients, provider SDKs, DB clients, HTTP request/response objects, and direct `fetch`. |
| `packages/partner-ai-core/src/ports/**`, `packages/partner-ai-core/src/services/**` | Ban vendor DTO imports, framework objects, DB row imports, provider-native stream parts, and browser object types. |
| `packages/agent-runtime/src/**` | Allow AI SDK and provider-runtime integrations only in provider/tool/runtime folders; ban HTTP framework, React, pg, Drizzle, widget internals, and app composition. |
| `apps/partner-ai-service/src/inbound/**` | Allow HTTP framework; ban direct provider SDK/DB client usage and business policy modules that should be reached through use cases. |
| `apps/partner-ai-service/src/outbound/**` | Allow external clients for the named system; require response parsing and error mapping near the adapter. |
| `apps/partner-ai-service/src/composition/**` | Allow importing center and edge code for wiring; still ban widget internals and host app code. |
| `packages/db/src/**` | Allow `pg`, Drizzle, schema/table definitions, and DB query code; ban React, HTTP framework, provider SDKs, widget, and partner-ai-core use-case imports. |
| `packages/chat-client/src/**` | Allow browser fetch/SSE; ban React, widget UI, `partner-ai-core`, `agent-runtime`, DB, provider SDKs, and required Effect public types. |
| `packages/side-chat-widget/src/**` | Allow React; ban API service internals, DB, provider SDKs, agent-runtime internals, Node-only modules, and required Effect public types. |
| `**/*.test.ts`, `**/*.test.tsx` | Allow test utilities and dev dependencies; still ban real provider calls unless explicitly marked integration. |
| `**/*.type.test.ts` | Allow `@ts-expect-error` with descriptions; ban runtime assertions that pretend to test behavior. |
| `scripts/**` | Allow Node filesystem/process APIs; still ban production source imports that create side effects. |

### 21.4 Oxlint vs Custom Governance Scripts

Use Oxlint for local AST-level rules:

- unsafe TypeScript usage
- dropped promises
- React hooks
- accessibility basics
- obvious restricted imports
- focused/skipped tests
- syntax bans such as `as any` or `@ts-ignore`

Use custom scripts for repo-aware rules:

- package dependency allowlists
- package public export discipline
- generated artifact freshness
- TypeScript project reference coverage
- no public declaration leaks of provider/framework/runtime types
- no ordinary top-level `test/` folders
- no provider-native strings in protocol/widget/client
- no runtime-boundary leaks across domain/use-case/port layers
- no outbound service calls outside approved adapter folders

Oxlint should not be the only boundary tool. If a rule needs package graph, generated declarations, workspace manifests, or cross-file ownership, use a custom governance script.

### 21.5 Code Quality Guardrails

Code quality guardrails are product maintenance rules, not personal taste. They exist because AI-generated code tends to drift toward large files, duplicated branches, hidden literals, overly clever expressions, and weak names unless the repository pushes back automatically.

Default budgets:

| Guardrail | Default budget | Enforcement |
| --- | --- | --- |
| Source file length | Fail over 300 lines for production source; explicit exceptions are allowlisted in the governance script. | `check-source-governance.mjs`; split by capability before adding exceptions. |
| Test source file length | Fail over 450 lines. | `check-source-governance.mjs`; split fixture builders or scenario groups. |
| Function length | Review concern unless repeated drift appears. | Code review; add an Oxlint or governance rule only after repeated failures. |
| Cyclomatic complexity | Warn over 8, fail over 12. | Oxlint `complexity`. |
| Nesting depth | Fail over 3 nested blocks. | Oxlint `max-depth`. |
| Parameters | Fail over 6. | Oxlint `max-params`; use named input object or service. |
| Statements per function | Review concern unless repeated drift appears. | Code review; keep automated checks focused on fast, low-noise failures. |
| Imports per file | Review concern unless repeated drift appears. | Code review; boundary scripts catch illegal imports. |
| Public exports per package entrypoint | Warn when the entrypoint becomes a dump. | `check-package-exports.mjs`; group exports by capability. |

These budgets are defaults, not laws of physics. Generated files, migrations, schema fixtures, and intentionally dense mapping tables may be allowlisted with a short reason. Business logic, use cases, adapters, and UI components should not routinely need exceptions.

Control-flow rules:

- No nested ternaries.
- No chained ternaries for rendering product states.
- No `&&`/`||` expression tricks when the result is not boolean.
- No deeply nested `if` pyramids; prefer guard clauses, small functions, or policy tables.
- No `switch` without exhaustive handling for discriminated unions.
- No mixed side effects and value construction in the same expression.
- No callback nesting beyond 2 levels in production source.

Magic literal rules:

| Literal kind | Rule |
| --- | --- |
| Protocol event names | Must come from `chat-protocol` constants or schema definitions. |
| Route paths and header names | Must come from protocol/app route constants. |
| Error codes | Must come from typed error/code modules. |
| Model/provider ids | Must come from model/provider catalog definitions. |
| Tool names | Must come from tool registry definitions. |
| Feature flag names | Must come from config/feature flag constants. |
| Environment variable names | Must live in env parsing modules only. |
| CSS class names | Local utility classes are allowed; repeated semantic class groups should become component/primitives. |
| User-facing copy | Allowed inline in UI components when local and simple; repeated product copy should move to named constants. |
| Test fixture values | Allowed when the test names the behavior; repeated fixture literals should use builders. |

String literals are not all bad. The rule is: product identifiers, protocol values, provider ids, error codes, route names, env names, and tool names must be centralized. Human-readable UI copy may stay close to the UI unless it is repeated or policy-sensitive.

Duplication rules:

- Do not duplicate protocol event mapping in backend, client, and widget. Use protocol helpers and focused projection functions.
- Do not duplicate provider/model ids outside the model/provider catalog.
- Do not duplicate request/response parsing; use schemas at boundaries.
- Do not duplicate fake model scripts across tests; use testing builders/fakes.
- Do not introduce a shared abstraction for two tiny identical lines. Wait until duplication has product meaning or risk.
- Prefer copy once, abstract when the third copy proves a stable pattern.

Naming and clarity rules:

- Names should describe product meaning, not file type only. Prefer `streamAssistantTurn` over `handleData`.
- Avoid vague buckets: `utils`, `helpers`, `misc`, `common`, `manager`, `processor`, `handler` unless scoped by capability.
- Boolean names should read as predicates: `isAllowed`, `hasTenantAccess`, `shouldRetry`.
- Functions that cause effects should use verbs: `persistAssistantTurn`, `emitProtocolEvent`.
- Pure functions should be easy to test without mocks.
- Comments should explain why, not restate what the code says.

Review smells that should trigger refactoring before merge:

- a file has more than one reason to change
- a function mixes parsing, policy, IO, and rendering
- a component owns network calls plus layout plus protocol projection
- a use case knows transport or provider details
- a test needs large setup because the unit has too many responsibilities
- a new helper is imported by unrelated layers
- a boolean flag changes a function into two different functions
- a string literal is used as a product identifier in more than one file

Enforcement split:

| Tool | Owns |
| --- | --- |
| Oxlint | `correctness`, `no-nested-ternary`, `complexity`, `max-depth`, `max-params`, unsafe syntax, hooks, promises, focused/skipped Vitest tests, `any`, and TypeScript directive comments. |
| `check-source-governance.mjs` | File length, test placement, tracked artifact bans, strict tsconfig policy, project references, double assertions, and local `ToolLoopAgent` shadows. |
| `check-boundaries.mjs` | Whether the extracted code moved into a legal package/layer. |
| `check-package-exports.mjs` | Whether split files still expose only intended public APIs. |
| Code review | Whether an exception is justified, an abstraction is premature, or naming still hides product intent. |

### 21.6 Common Quality Tools First

Prefer common, boring tools where they cover the problem well. Do not make the clean repo depend on niche static-analysis tools by default. A `[Deferred]` specialized tool can be added only when a repeated problem appears and an ADR explains why Oxlint, TypeScript, tests, or a small repo-specific check are not enough.

Day-one common stack:

| Tool | Use for | Why it belongs by default |
| --- | --- | --- |
| TypeScript `tsc --build` | Project references, declaration checks, strict type safety, package build order. | It is the language/compiler contract. |
| Oxlint | Code-shape rules, restricted imports/syntax, TypeScript safety rules, React hooks, Vitest checks, complexity, nesting, and nested ternaries. | It gives the repo a fast OXC lint path while preserving local safety intent. |
| Oxfmt | Formatting only. | It removes formatting debate from code review without retaining the Prettier dependency. |
| Vitest | Unit and integration tests colocated with source. | It matches the Vite/TypeScript ecosystem and the current prototype direction. |
| Playwright | Browser smoke/e2e tests for widget behavior and local harnesses. | It verifies real browser behavior where unit tests are weak. |
| `npm audit` | Lockfile vulnerability gate. | It is built into npm and cheap to run. |
| GitHub Dependabot/security alerts | Dependency vulnerability visibility and update PRs. | It is common CI/repository hygiene if GitHub hosts the repo. |

`[Example]` proposed command shape:

```json
{
  "scripts": {
    "format": "oxfmt . --write",
    "format:check": "oxfmt . --check",
    "lint:oxlint": "oxlint --deny-warnings .",
    "typecheck": "tsc -b --pretty false",
    "test": "vitest run",
    "test:browser": "playwright test",
    "audit": "npm audit --audit-level=high",
    "lint:custom": "node scripts/check-runtime-boundaries.mjs && node scripts/check-outbound-rules.mjs && node scripts/check-source-governance.mjs",
    "verify": "npm run format:check && npm run lint:oxlint && npm run typecheck && npm test && npm run lint:custom"
  }
}
```

Custom scripts should stay small and repo-specific. They are justified for rules that common tools do not understand as product architecture:

- production profile fail-closed checks
- protocol/provider/runtime leak scans
- product-specific magic string categories
- test placement and integration-test markers
- generated protocol artifact freshness
- package-specific exception allowlists with required reasons
- design/governance synchronization checks

`[Optional]` specialized tools are not part of the default scaffold:

| Tool | Consider only when |
| --- | --- |
| API Extractor | Public package APIs become stable enough that accidental exported type changes are a real risk. |
| Gitleaks or Secretlint | GitHub/platform secret scanning is unavailable or local/CI secret scanning is required. |
| Dependency graph tools such as `dependency-cruiser` | Oxlint import restrictions plus custom boundary checks become too hard to maintain. |
| Dead-code tools such as Knip | Unused exports/files become a recurring maintenance problem after the package graph grows. |
| Duplicate-code tools such as `jscpd` | Duplication becomes measurable and code review/custom checks are not enough. |
| Package publish linters such as `publint` | Packages are published externally or consumed across multiple runtime/module formats. |
| Additional style/smell plugins such as SonarJS or Unicorn | The team explicitly wants those rule sets and accepts their noise profile. |

The default rule is: common tool first, custom check for product-specific architecture, specialized tool only after evidence.

### 21.7 Import Restrictions

Forbidden imports:

| From | Must not import |
| --- | --- |
| `chat-protocol` | React, HTTP framework, AI SDK, provider SDKs, pg, Drizzle, partner-ai-core, widget. |
| `partner-ai-core` | HTTP framework, React, pg, Drizzle, AI SDK, provider SDKs, app composition, outbound clients. |
| `agent-runtime` | HTTP framework, React, pg, Drizzle, widget internals, app composition. |
| `chat-client` | React, widget UI, partner-ai-core, agent-runtime, pg, Drizzle, provider SDKs. |
| `side-chat-widget` | API service internals, DB, provider SDKs, agent-runtime internals. |
| `host-bridge` | React UI, API service, DB, provider SDKs. |
| `db` | React, HTTP framework, widget, AI SDK, provider SDKs, partner-ai-core. |
| `partner-ai-service` | widget internals, host app code, test-only helpers in production source. |

Allowed exceptions must be explicit in the governance script with a short reason.

### 21.8 Hexagonal Architecture Restrictions

Checks should enforce the center/edge split, not just package names.

Required custom checks:

| Rule | Should fail when |
| --- | --- |
| Domain purity | `domain/` or `policies/` imports HTTP frameworks, React, AI SDK, provider SDKs, DB clients, browser APIs, process env, filesystem, timers as globals, or app composition. |
| Use-case purity | `application/` imports concrete outbound adapters, provider SDKs, DB clients, HTTP request/response objects, or reads process env. |
| Port purity | `ports/` or `services/` exports vendor DTOs, DB rows, framework objects, browser objects, or raw `unknown` results without schema-owned parsing. |
| Inbound discipline | `inbound/` owns parsing and response mapping only; it must not contain entitlement/model/conversation policy decisions. |
| Outbound discipline | External calls, raw clients, SDK calls, credentials, retries, and external response parsing live under `outbound/`, `providers/`, `adapters/`, or `packages/db`, not in use cases. |
| Composition isolation | Concrete layer wiring and environment-based adapter selection stay under app `composition/` or `server.ts`, not packages. |
| Tool discipline | Assistant tool definitions depend on tool services/ports; they do not instantiate CRM, document-search, DB, HTTP, or provider clients directly. |
| Mapper discipline | External DTO to domain/protocol mapping is explicit and colocated with the adapter or use-case boundary, not hidden in generic helpers. |

These checks can begin as repo-local AST/file-path scripts. Promote only highly reusable rules into a custom Oxlint rule package after the first production scaffold stabilizes.

### 21.9 Dependency Policy

Rules:

- Runtime dependencies belong only in packages/apps that use them at runtime.
- Test-only libraries belong in root or package `devDependencies`, never runtime package dependencies.
- Provider SDKs belong in `agent-runtime` provider adapters or `partner-ai-service` outbound/provider composition only.
- React belongs only in widget/browser packages.
- Tailwind 4, Base UI, CVA, `clsx`, `tailwind-merge`, `ai-elements`,
  `lucide-react`, `motion`, `ai`, Streamdown packages, `shiki`, `cmdk`,
  `embla-carousel-react`, `nanoid`, and `use-stick-to-bottom` are accepted
  widget UI/runtime dependencies.
- Shadcn-style components and AI Elements-style components must live as owned
  widget source when copied/adapted. The shadcn CLI registry and generated
  registry metadata are not runtime dependencies.
- `shadcn`, `@repo/shadcn-ui`, generated shadcn registry packages, Radix UI, and
  shared UI kit package imports are forbidden dependencies for the clean
  scaffold.
- `pg`, Drizzle, and DB query helpers belong in `packages/db` and app-local migration/test harness code.
- New dependencies require a reason in the PR/commit when they affect production runtime.
- Duplicate libraries for the same job are forbidden unless an ADR accepts coexistence.

### 21.10 Generated Artifacts

Generated files are allowed only when they are part of the public contract or build output needed by consumers:

- JSON Schema
- OpenAPI
- declaration files for package builds
- migration metadata if the migration tool requires it

Checks should fail when generated artifacts are stale. Generated outputs should have clear source ownership and should not be edited by hand.

### 21.11 File And Naming Restrictions

Rules:

- public entrypoints are named `index.ts`
- colocated tests use `*.test.ts` or `*.test.tsx`
- compile-time tests use `*.type.test.ts`
- schema files use `*.schema.ts`
- policies use `*.policy.ts` and contain no IO
- Effect live layers use `*.layer.ts` or `*.live.ts`
- adapters use `*.adapter.ts`
- low-level external clients use `*.client.ts`
- generated files live under `generated/`

Folders should communicate responsibility: `domain`, `application`, `services`, `inbound`, `outbound`, `composition`, `providers`, `tools`, `ui`, `shared`.

### 21.12 Test Restrictions

Checks should fail if:

- focused tests such as `it.only` or `describe.only` are committed
- ordinary unit tests are placed in top-level `test/` folders
- browser/e2e tests import app internals instead of using public UI/API surfaces
- tests depend on real model providers by default
- tests require real external services without an explicit integration-test marker
- snapshots are used for large UI or protocol behavior that should be asserted structurally
- fake providers drift from protocol sequence rules

### 21.13 Secret And Environment Restrictions

Rules:

- no secret values in source, tests, fixtures, or docs
- environment variables are parsed once at startup
- package code does not read `process.env` directly except config adapters
- browser bundles never include provider keys
- `[Example]` env files contain shape only, not real credentials

## 22. Public Package APIs

Each package must have a narrow public entrypoint.

| Package | Public API should include | Should not export |
| --- | --- | --- |
| `chat-protocol` | Protocol version, route/header constants, schemas, types, validation, SSE codec, sequence validation, fixtures. | Provider-specific fields or framework objects. |
| `partner-ai-core` | `streamChatEffect`, `createPartnerAiCoreLayer`, port interfaces, application errors, core domain types needed by adapters. | Internal helpers by default; Promise or `AsyncIterable` use-case facades. |
| `agent-runtime` | Runtime factory with `streamEffect`, profile/provider/tool protocol types, runtime event types, test fake provider helpers if accepted. | AI SDK UI message types as product API; `stream(request)` or other non-Effect runtime facades. |
| `chat-client` | `createChatClient`, stream reader types, client error types, retry options. | React or widget state. |
| `side-chat-widget` | `SideChatWidget`, `[Optional]` `useSideChat`, widget prop types, required CSS export. | Internal component paths. |
| `host-bridge` | Host context provider, host command dispatcher, host capability types, command result helpers, iframe bridge helpers. | Host app state. |
| `db` | DB schema/repository command contract types, DB client factory, Drizzle setup, repository factories, migration/test helpers if needed. | Raw table helpers, Drizzle table objects, or query helpers to app code. |

## 23. Runtime Flow

Chat stream flow:

```txt
external host app renders SideChatWidget
  -> widget asks host bridge for `[Optional]` current context
  -> widget uses chat-client to POST /chat/stream
  -> partner-ai-service Hono auth middleware verifies credentials and attaches normalized AuthContext
  -> partner-ai-service validates headers/body against chat-protocol
  -> partner-ai-service builds the partner-ai-core Effect Layer from app-owned ports
  -> partner-ai-service calls partner-ai-core streamChatEffect with AuthContext
  -> partner-ai-core checks auth/rate/billing/model policy through ports
  -> partner-ai-core loads conversation context through repository ports
  -> partner-ai-core calls AgentRuntimePort.streamEffect
  -> agent-runtime resolves provider/model and runs AI SDK 6 agent/tool loop
  -> provider adapter supplies model handle/options while agent-runtime maps output into runtime events
  -> partner-ai-core maps runtime events into chat-protocol events
  -> partner-ai-service writes events as SSE frames
  -> chat-client decodes SSE frames into protocol events
  -> widget projects events into message text plus canonical assistant activity state
```

Host command flow:

```txt
agent-runtime produces host command intent
  -> partner-ai-core validates command against protocol activity shape
  -> partner-ai-core emits sidechat.activity activityKind=host_command
  -> chat-client decodes event
  -> widget renders the host-command activity row and dispatches command through host-bridge callback
  -> external host applies/rejects command
  -> widget updates the same activity row with host result state
```

Outbound tool flow:

```txt
partner-ai-service registers app-owned tool capabilities with agent-runtime
  -> ToolLoopAgent receives the capabilities with automatic tool choice
  -> model decides a tool is needed and produces tool input
  -> AI SDK asks agent-runtime to execute the selected runtime tool
  -> app-owned tool adapter checks policy and [Deferred] approval requirements if approval is accepted
  -> tool calls an Effect service or adapter port, not a raw external client
  -> partner-ai-service outbound adapter implements that service
  -> outbound client calls the accepted external system
  -> outbound adapter maps external response/errors into assistant-safe output
  -> AI SDK returns tool output to the model loop
  -> agent-runtime observes tool stream parts and emits typed activity events
  -> partner-ai-core maps runtime activity events into sidechat.activity protocol events
```

Accepted backend tool:

| Tool | Owner | Behavior |
| --- | --- | --- |
| `mock_web_search` | `apps/partner-ai-service/src/adapters/tools/mock-web-search-tool.ts` | Deterministically simulates a web search inside the backend without external network egress. It is a development capability with a model-facing input schema and an Effect-based runtime tool implementation. Non-production runtime composition may make it available to the agent; production composition must not expose it. When the model chooses it, observed tool-call/tool-result stream parts become ordered `sidechat.activity` tool rows with input/result/source objects. |

`[Deferred]` approval flow:

```txt
agent-runtime reaches sensitive tool
  -> approval policy decides approval is required
  -> partner-ai-core emits sidechat approval_requested event
  -> widget renders approval request
  -> user/host approves or rejects
  -> chat-client sends approval resolution
  -> agent-runtime continues, skips, or fails according to policy
```

Persistence flow:

```txt
partner-ai-core needs history/usage
  -> calls ConversationRepository / UsageRepository ports
  -> partner-ai-service persistence adapter implements ports using packages/db
  -> db repository uses Drizzle over pg inside packages/db
  -> DB runtime role has only required table privileges
```

### 23.1 Runtime And Product Contracts

These contracts describe how the product behaves at runtime. They are not scaffold instructions and should remain true even if package structure changes.

#### Product Behavior

Core concepts:

| Concept | Contract |
| --- | --- |
| Conversation | A tenant/workspace/caller-scoped thread of user and assistant messages. It is not globally readable and must be authorized on every read/write. |
| Assistant turn | One user request plus one assistant response stream, including final text output, canonical activity events, usage metadata, terminal status, and `[Deferred]` approval events if approval is accepted. |
| Completed answer | A turn that emitted exactly one terminal protocol event: `sidechat.completed` or terminal `sidechat.error`. |
| Host command | A request for the external host to act. It is never assumed applied until the host returns a result. |
| Tool result | Data returned by a runtime tool. It is untrusted input until parsed, scoped, redacted, and mapped into assistant-safe output. |
| Assistant activity | A product-safe, ordered timeline item inside the Thinking panel. Activity covers progress, safe reasoning summaries, tool execution, and host-command work. |
| Tool capability | A registered backend capability exposed to the agent runtime with a model-facing schema. Availability is decided by runtime composition/profile/policy; use is decided by the model through the tool loop. |

Rules:

- The assistant may suggest, explain, query, or ask the host to act. It must not silently mutate host state.
- Model output is not authority. Product decisions come from policies, ports, host results, and validated tool outputs.
- A failed provider/tool/DB/host command should become a typed application error and then a stable protocol error, not an unstructured crash.
- A partially streamed assistant turn must have a clear terminal state: completed, user-aborted, timed out, provider-failed, tool-failed, persistence-failed, or `[Deferred]` approval-rejected if approval is accepted.
- The widget may display optimistic local state, but persisted conversation truth comes from the backend.

#### Protocol Semantics

`sidechat.v1` is the browser/backend product contract.

Compatibility rules:

- Additive changes may add optional fields or new non-critical event types.
- Breaking changes require a new protocol version such as `sidechat.v2`.
- Existing event names and required fields must not change inside `sidechat.v1`.
- Provider-native stream parts, AI SDK UI messages, DB rows, Effect errors, and HTTP framework objects are never protocol fields.
- Unknown non-critical events should not crash the client. The client may ignore them and expose a diagnostic event for debugging.
- Malformed required events should fail stream parsing and surface a typed client/protocol error.
- Every protocol change must update schemas, generated artifacts, golden fixtures, sequence tests, and client/widget projection tests.

Activity rules:

- `sidechat.activity` is the only browser-facing event for assistant work shown
  in the Thinking panel.
- Activity events have stable `activityId`, `activityKind`, `status`, `title`,
  optional `body`, and optional structured `details`.
- Activity details can include row-local sources and images for search results,
  citations, and found/generated images.
- Tool activity details include tool identity, parameters, result, error, and
  sources after redaction.
- Tool activity rows are produced from observed model/tool-loop events, not from
  backend prompt keyword matching.
- Host-command activity details include command identity, payload, dispatch
  status, and host result state.
- The protocol sequence number defines timeline order; clients must not infer
  order from grouped arrays or natural-language text.
- Final assistant answer text is streamed separately from activity and rendered
  after the activity section.

Versioning should be explicit:

```txt
request declares accepted protocol version
service responds with selected protocol version
client rejects unsupported major versions
server rejects unsupported request versions
```

#### Auth, Tenancy, And Authority

The auth provider is intentionally not decided here. Azure SSO is likely for the consuming app, but the production repo should not hard-code Azure into domain or use-case code.

Authentication and authorization are deliberately split:

```txt
Hono auth middleware
  -> extracts credentials from headers/cookies/gateway context
  -> verifies credentials through an outbound auth verifier
  -> normalizes AuthContext
  -> attaches AuthContext to Hono context

route handler
  -> parses protocol request
  -> reads normalized AuthContext from Hono context
  -> invokes partner-ai-core use case

partner-ai-core
  -> authorizes product behavior
  -> checks workspace, conversation, model, entitlement, rate/billing policy
```

What must be kept in mind now:

- Authentication is Hono middleware in `apps/partner-ai-service/src/inbound/http/middleware`.
- Credential verification details live behind outbound auth adapters such as Azure SSO/JWT/gateway/dev-static verifiers.
- Authorization is a product concern in partner-ai-core policies.
- `partner-ai-core` receives only a normalized `AuthContext`; it must not see raw Hono context, cookies, JWT payloads, Azure DTOs, or gateway-specific request objects.
- Host-provided context is useful, but not authoritative for tenant, workspace, or user identity.
- Dev/demo auth may exist only behind an explicit non-production profile.
- Production must fail closed if real auth is not configured.

`[Example]` minimum `AuthContext` shape to design around:

```ts
type AuthContext = {
  subjectId: string;
  workspaceId: string;
  tenantId?: string;
  accountId?: string;
  roles: readonly string[];
  scopes: readonly string[];
  authSource: "azure-sso" | "jwt" | "gateway" | "dev-static";
  hostOrigin?: string;
  auditActorId: string;
};
```

This type is not final. The invariant is more important than the exact field names: every use case that reads or writes conversation, usage, tools, host commands, or `[Deferred]` approvals must have enough identity and scope to authorize the action.

Authorization rules:

- Conversation ownership is checked on every history read/write/reset.
- Workspace/tenant boundaries are checked before model calls, tools, host commands, and persistence.
- Host context can narrow or enrich a request, but it cannot grant privileges.
- Cross-tenant access denial must be covered by tests.
- Anonymous or shared-demo identities must be impossible in production.

#### Streaming Semantics

SSE streaming is a product behavior, not just an HTTP detail.

Rules:

- Every assistant turn has a stable `assistantTurnId`.
- Every stream event has a monotonic sequence number within the turn.
- Exactly one terminal event is allowed.
- No `delta`, `activity`, or `[Deferred]` approval events may appear after a terminal event.
- The server should send heartbeat/comment frames when needed to survive proxies and slow model/tool calls.
- Client abort should propagate to partner-ai-core and agent-runtime cancellation.
- Provider/tool timeout should become a typed terminal error.
- POST retries must not create duplicate persisted user messages or duplicate tool/host actions.

Day-one resumability stance:

- Do not promise full stream replay unless an event store is explicitly designed.
- `Last-Event-ID` may be ignored or rejected initially.
- Use request/turn idempotency to prevent duplicate side effects.
- `[Deferred]` resumable stream design may replay persisted protocol events by `assistantTurnId` and sequence number.

Persistence timing must be explicit:

- Persist the user message once per accepted turn.
- Persist the assistant result only when terminal state is known, or persist incremental events only if the repository is designed as an event store.
- Usage metadata should be recorded once per completed or failed provider turn when available.

#### AI Runtime Behavior

The `agent-runtime` is allowed to be sophisticated internally, but its behavior must be stable through partner-ai-core ports.

Rules:

- Provider selection comes from a model/provider catalog, policy, and configuration, not widget-only state.
- Fake providers are valid for tests and local development, but forbidden in production.
- Provider fallback must be explicit. Silent fallback to a cheaper, weaker, or different-region model is not allowed.
- Provider responses are mapped into runtime events before partner-ai-core maps them into protocol events.
- Reasoning visibility is a product decision. Internal reasoning traces must not leak to the protocol; only explicitly mapped safe summaries may appear as `sidechat.activity` content.
- Structured output must be schema-validated before it affects tools, host commands, or persisted state.
- Tool calls are part of a turn lifecycle and must be observable and cancellable. `[Deferred]` approvals follow the same rule if accepted.

#### Tool Safety

Tool output and model instructions are both untrusted.

Tool categories:

| Category | Examples | Default control |
| --- | --- | --- |
| Read-only | Search docs, read CRM summary, fetch market data. | Tenant-scoped, parsed, redacted, timeout-limited. |
| Write | Create note, update task, change CRM field. | Requires host authority; `[Deferred]` explicit approval if approval is accepted. |
| Sensitive | Financial action, client data export, permission change. | Deny by default until product-approved policy exists. |
| External-network | `[Example]` MCP server, external API, document service. | Egress allowlist, credentials isolation, response parsing. |
| Host-command | Ask host to select/filter/open/apply UI action. | Host capability check, command id, result state, timeout. |

Rules:

- Tool definitions do not instantiate raw external clients.
- Tool input and output are schema-validated.
- Tool output is treated as untrusted text/data and must not be allowed to inject hidden instructions.
- Every tool call has tenant/workspace scope, timeout, error mapping, and audit metadata.
- Sensitive or write tools require host authority on day one; `[Deferred]` approval policy is required before adding human approval behavior.
- `[Deferred]` MCP servers are external trust zones and require explicit allowlisting before production use.

#### Host Integration Authority

The host app is external and authoritative over its own UI/state. The assistant product owns only its integration contract.

Rules:

- The host advertises capabilities before the widget emits commands that depend on them.
- Host context has freshness metadata when it affects assistant behavior.
- Unsupported commands return `unsupported`, not silent success.
- Rejected commands return `rejected` with a safe reason code.
- Failed commands return `error` without leaking host internals.
- Host command ids are stable enough to prevent duplicate application.
- The backend must not assume a host command was applied unless a result path is explicitly designed.

`[Open]` design question:

- Should host command results remain client-only UI state, be sent back through a product route, or become protocol events in a follow-up turn?

Until this is decided, commands that affect durable backend state should not be implemented.

#### Data Privacy And Retention

Assistant data may contain sensitive business, user, or client information.

Data classes:

| Data | Examples | Default handling |
| --- | --- | --- |
| Conversation content | User messages, assistant messages, citations. | Persist only when needed; redact in logs. |
| Host context | Current page, selected rows, visible record ids. | Treat as request-scoped and untrusted. |
| Tool results | CRM data, document snippets, market data. | Tenant-scoped, minimized, parsed, redacted. |
| Provider payloads | Prompts, messages, tool traces, token usage. | Never log raw by default. |
| Telemetry | Request ids, timing, error codes, counts. | Low-cardinality, redacted, no secrets. |
| Audit records | Actor, action, target, decision, timestamp. | Separate from observability logs. |

Rules:

- Provider keys, access tokens, raw credentials, and secret values are never logged.
- Raw prompts and tool results are not logged by default.
- Observability activity metadata may include ids, kind, status, counts,
  `toolName`, `toolCallId`, and error codes, but not tool parameters, tool
  results, host payloads/results, sources, image bytes, or assistant text.
- Retention, deletion/export, and regional residency must be decided before real users or client data.
- Provider data-use settings must be explicit before production provider calls.
- Redaction happens before telemetry export, not only in dashboards.

#### Production Runtime Rules

Production must fail closed.

The service must refuse to start in production if any of these are selected:

- static/dev auth
- fake/local model provider
- allow-all billing or entitlement adapter
- in-memory rate limiting when production requires durable/shared limits
- permissive CORS
- fixture persistence
- disabled telemetry when telemetry is required by the production profile
- missing required secrets
- direct browser access to provider keys or DB credentials

Local/test shortcuts are allowed only behind explicit non-production profiles.

#### Observability Semantics

Observability should explain what happened without leaking sensitive data.

Minimum events/metrics:

- request received
- auth accepted/denied
- stream started/completed/errored/aborted/timed out
- first-token latency
- total turn latency
- provider selected
- provider latency/error code
- tool call started/completed/failed/timed out
- `[Deferred]` approval requested/resolved/rejected/timed out
- host command emitted/resolved/rejected/timed out
- token/usage metadata when available
- persistence latency/error code

Rules:

- Every request has a request id.
- A turn has an assistant turn id.
- Logs, metrics, and traces carry correlation ids.
- Tenant/workspace dimensions must be low-cardinality and safe.
- Audit events are separate from debug logs.
- Observability payloads use redacted product fields, not raw provider/tool payloads.

#### Failure Model

Expected failures should be typed and stable.

| Failure | Runtime behavior |
| --- | --- |
| Unauthorized | Reject before model/tool/persistence work. |
| Forbidden/cross-tenant | Reject with safe denial; do not reveal target existence unnecessarily. |
| Rate limited | Reject with retry metadata when safe. |
| Model unavailable | Terminal protocol error with product-level model code. |
| Provider timeout/failure | Cancel runtime work and emit terminal error. |
| Tool timeout/failure | Emit tool failure and continue or terminal-error according to policy. |
| `[Deferred]` approval rejected/timed out | Skip, continue, or terminal-error according to approval policy. |
| Host command rejected/failed | Record command result; do not assume side effect. |
| Persistence failure | Avoid claiming durable success; emit terminal error if needed. |
| Client abort | Cancel provider/tool work when possible and record aborted state if persistence is enabled. |

Unexpected defects may fail fast internally, but HTTP/SSE boundaries must translate known application errors into stable protocol responses.

## 24. Effect v4 Role

Effect v4 is the server/core workflow discipline for the production repo.

It should be used where TypeScript otherwise becomes weak under production pressure: async orchestration, typed expected failures, cancellation, resource management, dependency injection, observability, retries, timeouts, streaming, and testable adapter composition.

It should not become a tax on host apps or widget consumers. Browser-facing and public package APIs should remain friendly: DTOs, plain TypeScript types, `Promise`, `AsyncIterable`, React props, and callbacks.

### 24.1 Where Effect Is First-Class

| Area | Effect v4 role |
| --- | --- |
| `partner-ai-core` | Use cases and ports as `Effect` programs, typed application errors, service dependencies, stream policies, and protocol event streams. |
| `agent-runtime` | Agent/tool-loop execution as Effect streams, provider calls, tool calls, streaming, retries, cancellation, telemetry, and `[Deferred]` approvals/MCP/structured output. |
| `partner-ai-service` | Runtime bootstrap, config, layers, HTTP lifecycle, Promise/edge adapter conversion, graceful shutdown, error translation, observability. |
| `db` | Pool lifecycle, transactions, typed DB errors, repository live layers. |
| `chat-protocol` | Optional canonical schemas if Effect Schema is accepted; generated plain artifacts for consumers. |

### 24.2 Where Effect Is Limited

| Area | Limit |
| --- | --- |
| `side-chat-widget` | Do not expose Effect to host apps. Use React state/hooks and pure domain reducers. |
| `chat-client` | Public API should be `Promise`/`AsyncIterable`; do not require Effect runtime. |
| `host-bridge` | Keep plain callback/types helpers. |
| UI primitives | No Effect unless a workflow has real cancellation/resource/concurrency complexity. |

### 24.3 Effect Service Model

Server/core dependencies should be modeled as services and live/test layers:

```txt
PartnerAiCore services
  AgentRuntime
  ConversationRepository
  UsageRepository
  AuthService
  RateLimitService
  BillingService
  Observability
  Clock
  IdGenerator

AgentRuntime services
  AgentRuntime
  RuntimeTool protocol
  ModelProvider protocol
  RuntimeTelemetry
  [Deferred] ApprovalPolicy
  [Deferred] McpRegistry

PartnerAiService layers
  ConfigLive
  HttpLive
  PartnerAiCoreLive
  AgentRuntimeLive
  DbLive
  AuthLive
  TelemetryLive
```

Tests should compose fake layers rather than mocking deep internals.

### 24.4 Error Model

Expected failures belong in typed error channels:

- unauthorized
- rate limited
- billing denied
- model unavailable
- provider failed
- tool failed
- `[Deferred]` approval rejected
- persistence failed
- malformed protocol request
- stream aborted or timed out

Unexpected defects may still fail fast, but HTTP and SSE adapters must translate known errors into stable product responses.

### 24.5 Stream Model

Effect `Stream` is the preferred internal representation for server-side assistant events:

```txt
AgentRuntime Stream
  -> PartnerAiCore Stream of protocol events
  -> PartnerAiService SSE writer
```

The widget and client still consume plain protocol events over SSE.

### 24.6 Adoption Rule

Use Effect deeply where it reduces real complexity. Avoid decorative Effect wrappers around simple pure functions, React components, or one-line helpers.

If a function has no async dependency, no typed failure, no resource, no concurrency, and no observability boundary, plain TypeScript is usually better.

## 25. Production Hardening Requirements

Before calling the new repo production-ready, these areas need real design:

| Area | Requirements |
| --- | --- |
| Auth and tenancy | Caller identity, workspace authorization, conversation ownership, host context trust boundaries, audit fields. |
| Model/provider catalog | Provider allowlist, model availability by workspace/account, fallback policy, cost metadata, region/compliance constraints. |
| Tool safety | Tool permissions, audit trail, sensitive action denials, `[Deferred]` human approval and MCP security policy. |
| Rate limiting | Per-user/workspace limits, burst/sustained limits, retry metadata, safe test mode. |
| Billing and entitlements | Model availability, usage recording, spend/token budgets, clear denial errors. |
| Observability | Request/trace ids, stream lifecycle, assistant steps, tool latency, provider latency, token usage, host command metrics. |
| Persistence | Migration workflow, rollback policy, least privilege, backups, restore tests, data retention. |
| Security | CORS allowed origins, no browser provider keys, no direct browser-to-DB path, input limits, stream timeout/abort, dependency/container scanning. |

## 26. Testing Strategy

Tests are colocated with the code they protect. The normal shape is `thing.ts` plus `thing.test.ts`. Use a package-level `test-harness/` only for cross-package browser harnesses, mock servers, or fixtures that are not owned by one source file.

Unit tests own pure logic:

- protocol schemas
- sequence validation
- partner-ai-core policies
- agent-runtime provider/activity/tool mapping and `[Deferred]` approval mapping
- message projection
- assistant activity projection and lifecycle rules
- panel/composer state
- retry policy

Integration tests own package boundaries:

- API route -> partner-ai-core -> agent-runtime configured provider
- partner-ai-core -> repository port
- agent-runtime -> fake provider/tool registry for deterministic tests
- partner-ai-service mock web-search adapter -> agent-runtime tool registry/activity path
- chat-client -> mock SSE server
- widget -> chat-client -> mocked activity stream
- db repository -> test database

Contract tests own compatibility:

- golden success stream
- `[Deferred]` golden approval stream
- golden error stream
- malformed stream handling
- no event after terminal
- no provider-native event leak
- no AI SDK UI message leak
- activity timeline order and one-active-row semantics
- tool details open by default and collapsible in chronological place
- host command schema compatibility

Type tests own compile-time contracts:

- package public APIs expose only intended types
- invalid protocol/host command shapes fail typecheck where possible
- discriminated unions remain exhaustive
- model/provider catalog types preserve allowed values
- `[Example]` `@ts-expect-error` cases fail for the intended reason

E2E tests use a minimal test harness, not a product host app:

```txt
test-harness/
  widget-harness/
    renders SideChatWidget
    supplies fake host bridge callbacks
    talks to mock or local partner-ai-service
```

The harness exists only for tests. It must not become a demo app.

### 26.1 Solo Widget Development Without A Host App

The repository must support developing the widget without cloning, booting, or embedding into a real host application.

Use `test-harness/widget-harness` for this. It is a runnable development and browser-test fixture, not a product app and not a demo host.

It owns:

- rendering `SideChatWidget` in isolation
- fake host context callbacks
- fake host command dispatch callbacks
- scenario controls for host resources, capabilities, current surface state, auth identity, and model mode
- visual/e2e test fixtures
- `[Optional]` mock stream mode using `chat-protocol` fixtures

It must not own:

- real host app navigation
- UBS/advisory demo dashboards
- production routing
- business demo data beyond tiny contract fixtures
- provider keys
- product-specific host state not needed to exercise the integration contract

Supported solo modes:

| Mode | Runs | Purpose |
| --- | --- | --- |
| Mock stream mode | `widget-harness` only. | Fast UI development with deterministic `chat-protocol` fixture events. |
| Local service + configured provider mode | `widget-harness` + `partner-ai-service` + `.env` provider credentials. | End-to-end protocol, SSE, widget state, host bridge, assistant activity events, and the real AI SDK runtime path. |
| Explicit fake provider mode | `widget-harness` + `partner-ai-service` using `SIDECHAT_PROVIDER=fake`. | Deterministic protocol, SSE, widget state, host bridge, and stream sequencing without credentials. |

`[Example]` expected command shape:

```json
{
  "scripts": {
    "dev:service": "npm run dev --workspace @side-chat/partner-ai-service",
    "dev:widget": "npm run dev --workspace @side-chat/widget-harness",
    "dev:widget:mock": "npm run dev --workspace @side-chat/widget-harness -- --mode mock-stream",
    "test:e2e": "playwright test"
  }
}
```

The harness should use the same public widget API an external host would use:

```tsx
<SideChatWidget
  apiBaseUrl="http://localhost:3100"
  workspaceId="local-dev"
  hostBridge={{
    getContext: async () => fakeHostContext,
    dispatchCommand: async (command) => applyCommandToHarnessState(command),
  }}
/>
```

This keeps development ergonomic while preserving the production rule: no host app in the repo.

## 27. Initial Build Milestones

| Milestone | Deliver | Done when |
| --- | --- | --- |
| 0. DB schema contract | Day-one entities, table responsibilities, context snapshots, history/resume behavior, repository command API, grants model, idempotency rules. | Contract is accepted before migrations/repositories; deferred schema areas are explicitly labeled. |
| 1. Contract spine | `packages/chat-protocol`, schemas, SSE codec, sequence validation, fixtures. | Protocol tests pass, fixtures validate, malformed sequences fail predictably. |
| 2. Partner AI core | `packages/partner-ai-core`, stream-chat use case, ports, application errors. | Framework-free stream use case emits valid protocol events. |
| 3. Agent runtime | `packages/agent-runtime`, AI SDK 6 runtime, OpenAI provider, fake provider, Effect-based tool protocol, tool registry, model provider protocol, and app-injected mock web-search fixture. | Runtime emits typed activity/tool/provider events through configured providers; approval mapping is `[Deferred]`. |
| 4. Service adapter | `apps/partner-ai-service`, HTTP stream route, config parsing, composition root. | `POST /chat/stream` produces valid SSE and invalid requests return clear errors. |
| 5. Browser client | `packages/chat-client`, typed stream client, SSE reader. | Client decodes chunked SSE streams and terminal behavior is correct. |
| 6. Widget | `packages/side-chat-widget`, shell, composer, feed, canonical activity timeline, and `[Deferred]` approval states. | Widget streams against mock client/service, renders activity in protocol order, and external host receives commands. |
| 7. Persistence implementation | `packages/db`, pg, Drizzle schema/queries, migrations, repositories, least-privilege tests implementing the accepted DB schema contract. | Repository ports have DB implementations, migrations run in CI, and only `packages/db` can access tables/query helpers. |
| 8. Production hardening | Real auth, rate limiting, telemetry, production image, CI gates, ops docs. | Deploy target is documented, secrets externalized, observability emitted, rollback defined. |

## 28. Governance Checks

The clean repo should make architectural drift hard.

Checks should fail if:

- type-aware Oxlint is disabled for source files without a documented reason
- source files, functions, complexity, nesting, parameters, statements, or import counts exceed code-quality budgets without an allowlisted reason
- nested ternaries, dense chained conditionals, or unclear expression-side effects appear in production source
- protocol event names, route paths, header names, error codes, model/provider ids, tool names, feature flags, or env var names are duplicated as magic strings
- any app/package is missing from TypeScript project references
- DB migrations or repositories exist without an accepted DB schema/repository command contract
- strict TypeScript options are weakened without an ADR
- `any`, `as any`, `@ts-ignore`, or unsafe double assertions appear outside allowlisted interop/type-test files
- `JSON.parse`, external service responses, DB rows, postMessage payloads, or request bodies cross boundaries without schema parsing
- switches over protocol/runtime/error/host-command unions are not exhaustive
- `chat-protocol` imports React, HTTP framework, AI SDK, provider SDKs, pg, or Drizzle
- domain or policy files import IO, framework, provider, DB, browser, or composition code
- `partner-ai-core` imports HTTP framework, AI SDK, provider packages, React, pg, or Drizzle
- `partner-ai-core` application use cases import concrete outbound adapters or instantiate external clients
- partner-ai-core ports or services expose vendor DTOs, raw DB rows, framework objects, browser objects, or provider-native stream parts
- `agent-runtime` imports HTTP framework, React, widget internals, app composition, pg, or Drizzle
- assistant tool definitions instantiate raw external clients instead of depending on services/ports
- inbound adapters contain model, entitlement, conversation, or stream sequencing policy decisions
- outbound service calls appear outside approved outbound/provider/adapter/DB folders
- `side-chat-widget` imports API server internals, DB code, provider SDKs, or agent-runtime internals
- `side-chat-widget` or `chat-client` public APIs require consumers to run Effect programs
- `apps/partner-ai-service` imports widget internals or host app code
- external package consumers import deep internal widget paths in tests/examples
- provider stream event names appear in widget/domain code
- AI SDK UI message types appear in chat protocol or widget public API
- Effect-only error/runtime types become required protocol DTO fields or public browser API types
- runtime app code imports Drizzle table objects, query helpers, raw SQL, or `pg` outside `packages/db`
- ordinary unit tests are placed in top-level `test/` folders instead of beside the code they cover
- public declarations leak forbidden internal/provider/framework/runtime types
- focused/skipped tests are committed outside allowlisted quarantine files
- production source reads `process.env` outside config adapters
- production source imports from `packages/testing`
- generated files are edited without the generator source changing
- generated protocol artifacts are stale
- build artifacts are tracked
- production profile can boot with dev/static auth, fake providers, permissive CORS, fixture persistence, disabled required telemetry, or missing required secrets
- protected use cases can run without normalized auth context and workspace/tenant scope

## 29. AI Agent Skill Contract

The production repo should eventually ship with a small set of AI skills that guide agents toward the intended architecture. Do not create these skill folders during the initial design phase. First agree on the skill list, triggers, and responsibilities.

The goal is not to make one giant skill that repeats the whole system design. Skills should be short, triggerable, and procedural. They should tell an AI agent what to check, where code belongs, what is forbidden, and what must be verified for a specific kind of work.

### 29.1 Skill Suite Plan

Day-one skills should protect the highest-risk architectural boundaries.

| Skill name | Use when | Owns | Should not own |
| --- | --- | --- | --- |
| `side-chat-architecture` | Creating, editing, or reviewing any production repo code where package/layer ownership matters. | Hexagonal rules, dependency direction, forbidden moves, completion checks. | Detailed protocol schemas, provider-specific setup, UI design details. |
| `side-chat-protocol` | Changing request DTOs, stream events, SSE codec, sequence rules, host commands, generated schema/OpenAPI. | Protocol compatibility, event ordering, fixture updates, no provider/runtime leaks. | Partner AI core use-case orchestration or widget rendering internals. |
| `partner-ai-use-case` | Adding or changing `partner-ai-core` domain, policies, ports, services, or application use cases. | Use-case shape, Effect service dependencies, typed errors, fake-port tests. | Concrete HTTP, DB, provider, telemetry, or auth adapters. |
| `agent-runtime` | Adding providers, model selection behavior, AI SDK 6 agents, tools, and `[Deferred]` approvals/MCP/reranking/structured output. | Runtime event model, provider/tool protocols, AI SDK mapping, fake providers, and `[Deferred]` approval safety. | Browser protocol ownership or widget UI. |
| `outbound-adapter` | Connecting to an external system such as Azure SSO, CRM, document search, Redis, telemetry, billing, or entitlement services. | Client/adapter/layer shape, response parsing, retries, error mapping, secret handling. | Business decisions that belong in use cases or policies. |
| `db-schema-contract` | Defining or changing day-one DB entities, table contracts, repository command API, grants, idempotency, retention, audit fields. | Schema contract first, table responsibilities, repository command contracts, deferred schema labels. | Repository implementation details or app use-case behavior. |
| `db-boundary` | Changing Drizzle schema, migrations, repositories, query helpers, DB clients, row parsers, least-privilege tests. | Migration discipline, Drizzle/pg boundary, row validation, repository adapter tests. | Partner AI core use-case decisions or direct app table access. |
| `widget-integration` | Changing `side-chat-widget`, `chat-client`, host bridge, iframe/local embedding behavior, browser SSE handling. | Browser/client public API, widget state projection, host bridge callbacks, no server/runtime leaks. | Provider SDKs, DB access, partner-ai-core internals. |
| `repo-governance` | Adding packages, changing tsconfig/lint/scripts/CI, moving folders, relaxing rules, adding dependencies. | Boundary scripts, lint rules, TypeScript strictness, package exports, CI gates. | Product feature behavior. |

`[Deferred]` near-future skills should exist after the core scaffold proves the day-one skills are useful.

| Skill name | Use when | Owns |
| --- | --- | --- |
| `auth-tenancy` | Implementing caller identity, Azure SSO/JWT validation, workspace authorization, conversation ownership. | Auth context shape, trust boundaries, tenancy tests, audit fields. |
| `observability` | Adding logs, metrics, traces, stream lifecycle events, provider/tool latency, request correlation. | Telemetry event names, correlation ids, redaction, Effect observability layers. |
| `security-review` | Reviewing secrets, CORS, input limits, browser exposure, dependency risk, external tool permissions. | Security checklist and threat-model-oriented review prompts. |
| `test-strategy` | Designing or reviewing unit/integration/contract/e2e/type tests for a change. | Test placement, fake providers, protocol fixtures, no real external services by default. |
| `adr-writer` | Accepting/rejecting architecture decisions that should become durable ADRs. | Decision format, alternatives rejected, consequences, follow-up rules. |

Do not create separate skills for every folder. Create a new skill only when it changes agent behavior in a way that a short section in an existing skill cannot.

Skill design rules:

- Keep each `SKILL.md` short enough to load comfortably.
- Put long reference material under `references/` and load it only when needed.
- Put deterministic checks under `scripts/`, not in prose.
- Include concrete trigger wording in the skill description.
- Prefer action checklists over architecture essays.
- Avoid duplicating the full system design across skills.
- Each skill should include a small completion checklist.
- Skills must point back to this system design as the source of truth when a rule is ambiguous.

Suggested trigger split:

| If the user asks to... | Primary skill |
| --- | --- |
| add a new feature in server/core code | `side-chat-architecture` plus `partner-ai-use-case` |
| change streaming events or protocol DTOs | `side-chat-protocol` |
| add a model/provider/tool flow or `[Deferred]` approval flow | `agent-runtime` |
| connect to an external system | `outbound-adapter` |
| define or revise DB schema contract | `db-schema-contract` |
| change Drizzle schema, SQL, migrations, repositories, DB roles | `db-boundary` |
| change widget/client/host bridge behavior | `widget-integration` |
| change lint, package exports, tsconfig, CI, dependency rules | `repo-governance` |
| implement SSO, authorization, tenants | `auth-tenancy` |
| decide or document a major architecture choice | `adr-writer` |

Skill anti-patterns:

- one huge skill that tries to teach the entire repo
- skills that repeat stale file trees instead of pointing to the current design doc
- skills that permit agents to bypass tests or governance checks
- skills that describe desired architecture but do not say how to verify it
- skills whose trigger descriptions are too vague to activate reliably
- skills that encode provider-specific behavior into product protocol instructions
- skills that make frontend/widget work depend on server Effect runtime concepts

### 29.2 First Skill Draft: `side-chat-architecture`

This is the first `SKILL.md` contract draft for AI agents working in the production repo.

```md
# Hexagonal Production Repo Architecture

Use this skill when creating, editing, or reviewing code in the side-chat production repo.

## Prime Directive

Preserve the product boundary:

browser/host/widget -> chat-protocol -> partner-ai-service -> partner-ai-core -> agent-runtime -> adapters

Do not leak provider SDKs, AI SDK UI messages, HTTP framework objects, DB clients, or host app internals across that boundary.

## Dependency Direction

- `chat-protocol` is the browser/backend contract and imports no app/runtime/UI/provider/DB code.
- `partner-ai-core` owns Effect use cases, ports, policies, context-board product workflow, Effect services/layers, and application errors. It imports no HTTP framework, React, pg, Drizzle, AI SDK, or provider SDK.
- `agent-runtime` owns AI SDK 6 agents, the Effect-based tool protocol/registry, model provider protocol, Effect runtime programs, and runtime event mapping. Concrete product tools live in consuming apps as ports/adapters. `[Deferred]` approvals, MCP, telemetry, and structured output are added only after acceptance. It does not depend on partner-ai-core, HTTP, or UI.
- Provider-specific behavior stays in provider adapters.
- Inbound adapters receive calls into the service; outbound adapters call external systems.
- External tools/services live behind outbound adapters and Effect services, not inside use cases or tool definitions.
- `chat-client` owns browser transport and SSE decoding, not React state.
- `side-chat-widget` owns React UI/state and consumes protocol/client/host-bridge only. Its public API must not require Effect.
- `host-bridge` owns external host integration contracts, not host state.
- `apps/partner-ai-service` owns process startup, HTTP, config, Effect layer composition, and concrete adapters.
- TypeScript strictness is architectural. Do not weaken compiler options to make a change easier.

## Hexagonal Architecture Rule

The center owns product behavior. The edges own translation.

- Domain and policy code must be pure.
- Application use cases orchestrate workflows through ports/services.
- Ports are defined by the center and use domain/product types.
- Inbound adapters parse external input, invoke use cases, and map responses.
- Outbound adapters implement ports by calling external systems.
- Composition roots wire concrete adapters to ports.

If code imports an SDK, talks to a network, reads environment, opens a DB connection, touches browser storage, or knows transport objects, it is edge code. Keep it out of domain, policies, use cases, and ports unless the dependency is represented by an explicit port/service.

## Before Editing

1. Identify which package owns the behavior.
2. Check whether the change is domain rule, application use case, port/service, inbound adapter, outbound adapter, runtime orchestration, provider adapter, client transport, widget UI, host bridge, DB, or app composition.
3. Put the change in the narrowest owner.
4. Add or update colocated tests at the same boundary.

## Forbidden Moves

- Do not expose AI SDK or provider stream parts to the widget.
- Do not import provider SDKs from partner-ai-core, chat-protocol, chat-client, or widget.
- Do not import HTTP framework objects into partner-ai-core or agent-runtime.
- Do not import pg, Drizzle, Drizzle table objects, or DB query helpers outside `packages/db` and colocated migration/test harness code.
- Do not force Effect runtime types into widget/client public APIs.
- Do not add Promise or `AsyncIterable` package-level facades for partner-ai-core or agent-runtime workflows; use Effect streams and convert only at transport edges.
- Do not use raw `throw` for expected failures inside Effect workflows; use `Effect.fail`, `Effect.try`, or `Effect.tryPromise`.
- Do not use `any`, `as any`, `@ts-ignore`, or unsafe double assertions outside approved interop/type-test files.
- Do not trust unparsed JSON, DB rows, request bodies, postMessage payloads, provider responses, or external service responses.
- Do not wrap simple pure UI helpers in Effect without a real async/error/resource/concurrency reason.
- Do not call external services directly from partner-ai-core use cases or assistant tool definitions.
- Do not expose vendor DTOs, DB rows, HTTP objects, browser objects, or provider-native stream parts through ports.
- Do not put business policy into inbound adapters or outbound adapters.
- Do not hide product behavior in generic `utils`, `helpers`, or `shared` folders.
- Do not add broad `test/` folders for ordinary unit tests; colocate `*.test.ts` beside the source.
- Do not make a host app part of the production repo.
- Do not add provider UI before provider/model policy and runtime provider support exist.
- Do not use direct SQL from application, core, or runtime code; DB queries belong in `packages/db`.

## AI SDK 6 Rule

AI SDK 6 is the engine inside `packages/agent-runtime`. The product assistant path is Agent / ToolLoopAgent-first; `streamText` is only a private low-level primitive or an explicitly accepted tiny non-agent utility. Use AI SDK for reusable agents, tool loops, provider tools, streaming, telemetry, and DevTools inside `packages/agent-runtime`. `[Deferred]` approvals, structured output, MCP, and reranking are added only after acceptance.

Do not call `streamText` directly from `partner-ai-service`, `partner-ai-core`, `chat-protocol`, `chat-client`, or `side-chat-widget`. Do not build a custom model/tool recursion loop or raw provider HTTP stream for normal assistant execution without an ADR.

The package runtime surface is `AgentRuntime.streamEffect(request)` only. Do not
add `stream(request)` or other non-Effect runtime facades.

Never make AI SDK UI messages or provider-native stream events the product protocol.

## Effect v4 Rule

Effect v4 is the server/core workflow discipline. Use the pinned v4 package line for use cases, services/layers, typed expected errors, streams, retries, timeouts, resource safety, cancellation, and observability in `partner-ai-core`, `agent-runtime`, `partner-ai-service`, and `db`.

Known failures belong in the Effect error channel. Raw JavaScript `throw` is a
defect and should only appear as a bug or inside an `Effect.try` /
`Effect.tryPromise` boundary that maps it into a typed error.

Do not make host apps, widget consumers, or public browser/client APIs understand Effect.

## TypeScript Rule

Use TypeScript strict mode as a design tool. Prefer discriminated unions, branded ids where useful, `unknown` at IO boundaries, schema parsing before trust, exhaustive switches, and narrow public exports.

Do not silence type errors. Fix the type model or isolate a documented interop boundary.

## Lint And Restriction Rule

Run the same architecture checks locally and in CI. Do not bypass lint, boundary, dependency, generated-artifact, or test-placement checks to land a change. If a rule is wrong, update the rule and the system design together.

Treat type-aware Oxlint as part of the architecture, not as style decoration.

- No unsafe TypeScript values, casts, or hidden `any`.
- No dropped promises or accidental async callbacks.
- No non-exhaustive switches over protocol, runtime, error, host-command, or provider unions.
- No forbidden framework/provider/DB/browser imports outside their allowed folders.
- No committed focused/skipped tests.
- No React hook or basic accessibility violations in widget UI.
- No shadcn registry, Radix UI, or `@repo/shadcn-ui` imports; copied/adapted
  primitive source must live in `shared/ui`, and copied/adapted AI component
  source must live in `shared/ai` while using the accepted widget dependencies.
- No deep imports across package public boundaries.
- No oversized files/functions, nested ternaries, excessive nesting, unclear chained conditionals, or unexplained product literals.

Use custom scripts, not Oxlint alone, for package-graph checks, generated artifacts, declaration leaks, runtime-boundary leaks, outbound adapter ownership, file-size budgets, import-count budgets, and magic-string scans.

## Completion Check

Before claiming done, verify:

- boundary checks pass
- typecheck passes
- type-aware lint passes
- code-quality budgets pass or exceptions are documented and narrow
- relevant unit/integration tests pass
- generated artifact checks pass when schemas or public APIs changed
- no unsafe TypeScript escape hatches were introduced
- runtime inputs are parsed at trust boundaries
- no domain/policy/use-case code imports edge SDKs, clients, or framework objects
- no outbound service calls live outside outbound/provider/adapter/DB boundaries
- ports expose product/domain types, not vendor/framework/database types
- no provider/runtime types leaked into protocol/widget/client
- no Effect runtime requirements leaked into widget/client public APIs
- protocol fixtures still validate if stream events changed
```

## 30. Future Decision Queue

These items are deliberately outside the current final state. The restrictions
above remain binding until an ADR or an accepted design update changes them. Do
not use this queue as permission to add alternate package APIs, move ownership,
or bypass dependency boundaries.

- Should source schemas use Effect Schema, Zod, Valibot, TypeBox, Standard Schema, or another schema library?
- If Effect Schema is chosen, what generated artifacts are required so consumers do not need Effect runtime knowledge?
- Should the repo use one module-resolution strategy everywhere, or separate Node-service and browser-library tsconfig presets?
- Which type-test tool should own public API compile-time checks: Vitest `expectTypeOf`, `tsd`, API Extractor, or another tool?
- Should `skipLibCheck` be forbidden, or allowed only with a documented dependency issue?
- Which Effect v4 beta risks need explicit mitigation before production hardening, and which `effect/unstable/*` modules should be avoided until they stabilize?
- Should provider adapters live inside `agent-runtime`, or in a future `packages/model-providers` package?
- Should outbound business integrations live under `apps/partner-ai-service/src/outbound`, or graduate into separate packages when reused across services?
- Which DB operations, if any, should graduate from Drizzle repository queries to stored functions after implementation feedback?
- Should `host-bridge` be a separate package, or part of `chat-protocol` plus widget helper exports?
- Should `chat-client` be public API for non-React consumers, or internal to the widget at first?
- What protocol compatibility policy is required before `sidechat.v1` is declared stable?
- Which auth provider should first implement the normalized `AuthContext`: Azure SSO-backed JWT, gateway token, session token, mTLS behind gateway, or host-signed request?
- What level of model/tool abstraction is needed before adding multiple providers?
- Which `[Deferred]` AI SDK 6 capabilities should be promoted after v1: approvals, structured output, MCP, or reranking?
- Should formatting be handled by Oxlint alone, Oxfmt, or a formatter-independent policy?
- Which dependency-audit and license checks are required before production?

## 31. Current Decisions

These decisions describe the accepted spine of the repo. Change them only with a
focused design update or ADR.

| Decision | Current stance |
| --- | --- |
| Host app in repo | No. The host is external. |
| Repo style | npm workspace modular monolith. |
| First deployable app | `apps/partner-ai-service` only. |
| Product protocol | Dedicated `packages/chat-protocol`. |
| TypeScript role | Strict TypeScript is an architecture gate, not only a compile step. |
| TypeScript escape hatches | `any`, `as any`, `@ts-ignore`, and unsafe double assertions are forbidden except documented interop/type-test cases. |
| Effect v4 role | Server/core workflow discipline for use cases, layers, typed errors, streams, resources, and observability, pinned to `effect@4.0.0-beta.70` until stable v4 replaces it. |
| Effect in browser APIs | Do not require widget, host, or chat-client consumers to use Effect. |
| Partner AI core | Dedicated framework-free `packages/partner-ai-core` with Effect use cases such as `streamChatEffect`; no parallel Promise/AsyncIterable use-case facades. |
| Agent runtime | Dedicated `packages/agent-runtime` day one with `streamEffect` as the only assistant-turn stream surface. |
| AI SDK 6 role | Engine inside `packages/agent-runtime`, not browser protocol and not OpenAI-only adapter. |
| Provider switching | Backed by provider/model policy and runtime provider support before becoming product UI. |
| Outbound integrations | Start in `apps/partner-ai-service/src/outbound`; extract only when reuse or deployment boundaries justify it. |
| Auth provider | Not decided. Design against normalized `AuthContext`; keep Azure/JWT/gateway/session details in adapters. |
| Production runtime profile | Must fail closed when required production auth, provider, CORS, telemetry, secrets, persistence, or rate-limit configuration is missing. |
| DB schema contract | Accepted before migrations and repository implementations. |
| Runtime DB access | `packages/db` uses Drizzle over `pg`; direct DB access outside `packages/db`, migrations, and explicit DB test harnesses is forbidden. |
| Test placement | Colocate ordinary tests beside source files; reserve harness folders for cross-package/browser test infrastructure. |
| Linting | Type-aware Oxlint plus custom governance scripts. |
| Dependency policy | Runtime dependencies must live only where used; duplicate libraries for the same job need an ADR; shadcn registry/Radix packages are forbidden, while `ai-elements` and `lucide-react` are accepted widget dependencies. |
| AI skills | Plan the skill suite first; do not create skill folders until names, triggers, and responsibilities are accepted. |
| Widget package | Dedicated React package with public entrypoint only. |
| Browser client | Dedicated `packages/chat-client` day one. Revisit only by ADR if scaffold friction proves too high. |
| DB | Day-one PostgreSQL with `pg` + Drizzle in `packages/db`, composed into the same `partner-ai-service` server process. |
| Demo code | Excluded from the production spine. |

## 32. Initial Acceptance Criteria For Repo Scaffold

A first clean scaffold is acceptable when:

- the top-level folders match this document or have documented deviations
- there is no host app
- `npm install` works from the root
- root `packageManager`, `engines.node`, `.nvmrc`, and `package-lock.json` match the version pin contract in section 0.1
- `npm run verify` exists
- root TypeScript project references include every app/package
- strict TypeScript options are enabled and checked by governance
- type-aware Oxlint and custom governance scripts run through `npm run lint`
- code-quality budgets fail on intentionally oversized files/functions, nested ternaries, and duplicated product magic strings
- the DB schema contract exists and defines day-one entities, context snapshots, history/resume behavior, repository command API, grants, idempotency, and deferred schema areas
- `chat-protocol` has tests for request, event, codec, and sequence rules
- public package APIs have type tests or declaration checks
- `partner-ai-core` has an Effect-based fake-runtime stream use-case test
- `agent-runtime` has fake provider, tool registry, and runtime provider-selection tests
- `partner-ai-service` can serve a fake streaming response
- `side-chat-widget` can render against a mocked client stream
- widget and chat-client public APIs expose plain TypeScript/React-friendly contracts, not required Effect programs
- widget UI primitives live as owned `shared/ui` source, chat UI components live as owned `shared/ai` source, and neither layer has a `shadcn`, `@repo/shadcn-ui`, generated shadcn registry, or Radix dependency/import
- boundary checks fail on intentionally forbidden imports
- dependency and version-pin checks fail on intentionally ranged, missing, duplicated, or misplaced strategic packages
- runtime-boundary checks fail on domain/use-case code importing framework, provider, DB, browser, env, or client objects
- outbound-rule checks fail on use cases or assistant tools calling external systems directly
- test-placement checks fail on intentionally misplaced unit tests
- README explains the product boundary in one screen
