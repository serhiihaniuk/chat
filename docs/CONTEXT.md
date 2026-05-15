# Side-Chat Assistant Context

This document captures the durable product and architecture context for this repository so future work does not drift.

## Product Intent

Build a production-base side-chat assistant foundation. Do not use throwaway validation wording in executable or product-facing project names, package names, app names, labels, or generated runtime artifacts. Historical `.omx` planning files may still contain older wording because they are planning artifacts.

The work is split into coordinated but distinct tracks:

- Frontend/widget track: reusable React side-chat package plus demo host apps that prove real embedding and streaming UI behavior.
- Backend track: separate Hono/Effect/ports-and-adapters backend for chat streaming, model switching, token usage, seeded history, and stored-procedure persistence.

## Required Repository Topology

```txt
apps/
  side-chat-api/
  widget-demo/
  embedded-host-app/
packages/
  shared-protocol/
  side-chat-widget/
  db/
docker/
  postgres/init/
docker-compose.yml
```

Package roles:

- `apps/side-chat-api`: Hono API and Effect runtime composition for the backend track.
- `apps/widget-demo`: isolated widget playground for package states and API validation.
- `apps/embedded-host-app`: realistic business app consuming the widget package as an external host would.
- `packages/shared-protocol`: serializable `sidechat.v1` DTOs, schemas, fixtures, and protocol validation only.
- `packages/side-chat-widget`: reusable React package. No Next.js runtime APIs.
- `packages/db`: independent Postgres boundary. Runtime code calls stored procedures/functions only.

## Dependency And Tooling Decisions

Use npm workspaces for this checkout. `npm install`, `npm run typecheck`, `npm test`, `npm run build`, and `npm run verify` are the expected root commands.

Important pinned dependency versions:

- `effect`: `4.0.0-beta.66`
- `hono`: `4.12.18`
- `ai`: `6.0.182`
- `@ai-sdk/react`: `3.0.184`
- `@ai-sdk/openai`: `3.0.63`
- `streamdown`: `2.5.0`
- `react`: `19.2.6`
- `react-dom`: `19.2.6`
- `vite`: `8.0.13`
- `@vitejs/plugin-react`: `6.0.2`
- `typescript`: `6.0.3`
- `vitest`: `4.1.6`
- `@playwright/test`: `1.60.0`
- `pg`: `8.20.0`
- `zod`: `4.4.3`
- `tsx`: `4.22.0`
- `ai-elements`: `1.9.0`
- `shadcn`: `4.7.0`
- `tailwindcss`: `4.3.0`
- `lucide-react`: `1.16.0`
- `clsx`: `2.1.1`
- `tailwind-merge`: `3.4.0`
- `tsup`: `8.5.1`

Keep dependency placement honest. If a package imports a runtime dependency, list it in that package manifest, not only at the root.

## Backend Architecture Context

Backend bounded contexts:

- Conversation: conversations, messages, assistant turns, stream lifecycle.
- AI Gateway: provider/model configuration, model switching, provider response normalization.
- Workspace/Auth Boundary: workspace/user identity and stub authorization.
- Usage: token counts per request/conversation/workspace.
- Operations: config, request IDs, health, logs/traces/metric-like evidence.

Required ports:

- `ModelPort`
- `UsagePort`
- `ConversationRepository`
- `AuthPort`
- `RateLimitPort`
- `BillingPort`
- `ObservabilityPort`
- `ConfigPort`

Boundary rules:

- Hono imports only under `apps/side-chat-api/src/inbound/hono`.
- AI SDK runtime imports only under `apps/side-chat-api/src/adapters/ai`, except AI Elements-derived widget display components may type-import or import AI UI-message types if documented and not used as the product protocol.
- `pg` imports only in `packages/db` and migration/test harnesses.
- `packages/db` must not import Hono, React, AI SDK adapters, widget code, or application use cases.
- Effect use cases depend on ports, not Hono, AI SDK, Postgres, or React.

Default local/test paths must not require real provider tokens. Use deterministic fake model streaming by default while preserving realistic deltas, selected model metadata, finish reason, and token usage counts.

## Stored-Procedure DB Boundary

Runtime DB access goes through stored procedures/functions. Runtime code must not issue direct application table `SELECT`, `INSERT`, `UPDATE`, or `DELETE` outside init SQL and tests that verify procedures.

Known stored procedures/functions:

- `sidechat_create_or_get_conversation`
- `sidechat_append_user_message`
- `sidechat_append_assistant_message`
- `sidechat_read_seeded_history`
- `sidechat_record_usage`
- `sidechat_get_latest_usage`
- Optional: `sidechat_get_workspace_context`

Runtime role `sidechat_app` may execute procedures/functions but must not have direct table read/write grants.

Usage records are persisted after assistant completion and read back through `sidechat_get_latest_usage` for the widget usage/context display. The record shape includes input, output, total, optional reasoning/cache token details, and optional backend-estimated cost.

## Streaming Protocol

Protocol version: `sidechat.v1`.

Request endpoint: `POST /chat/stream`.

Required headers:

- `Content-Type: application/json`
- `Accept: text/event-stream`
- `X-Sidechat-Protocol: sidechat.v1`
- Optional `X-Request-Id`

Core events:

- `sidechat.started`
- `sidechat.delta`
- `sidechat.completed`
- `sidechat.error`
- Optional `sidechat.history`

Exactly one terminal event is emitted: `sidechat.completed` or terminal `sidechat.error`. No deltas may appear after a terminal event.

## Frontend Widget Context

`packages/side-chat-widget` exposes `SideChatWidget` with a stable host-friendly API:

```ts
type SideChatWidgetProps = {
  apiEndpoint: string;
  workspaceId: string;
  initialConversationId?: string;
  title?: string;
  placeholder?: string;
  defaultModel?: ModelSelection;
  availableModels?: ModelSelection[];
  onOpen?: () => void;
  onClose?: () => void;
  onError?: (error: SideChatError) => void;
  onUsage?: (usage: TokenUsage) => void;
};
```

The widget also supports the newer standard host integration interface:

- `transport`: protocol endpoints such as `streamUrl`, optional `historyUrl`, and optional `usageUrl`.
- `identity`: stable workspace/user/conversation scope.
- `host`: a host bridge with `getContext()` and `dispatchCommand(command)`.

The host bridge is the boundary between the reusable chat package and app-specific surfaces such as dashboards, grids, charts, and forms. The widget may send a serializable `hostContext` snapshot with chat requests, and the host may later validate/apply `HostCommand` objects such as `grid.applyView`, `grid.clearView`, and `ui.focusResource`. The widget must not import AG Grid, dashboard internals, or host app state directly. Host shells should wire a generic host-surface registry to the widget; page/features register their own resources through that generic interface so the shell does not know whether the active surface is a financial dashboard, media page, CRM record, or anything else.

Required widget states:

- closed launcher
- open panel
- empty state
- streaming state
- error/retry state
- seeded history/history-ready state

Markdown must render through Streamdown/AI Elements-derived message rendering. Partial markdown must not crash. Keep Streamdown security defaults enabled.

AI Elements is required for the chat UI surface. Components should be vendored/copied into `packages/side-chat-widget/src/components/ai-elements/` or equivalent internal paths. Consumers must not run AI Elements or shadcn generators themselves.

AI Elements portability rules:

- No Next.js runtime APIs in the widget package.
- No app-local aliases such as `@/components`.
- No `@ai-sdk/react` runtime dependency in `packages/side-chat-widget`.
- CSS/Tailwind integration must be documented and verified through `apps/embedded-host-app`.

## Embedded Host App Direction

The embedded host app is currently being redesigned as a realistic single-page enterprise dashboard for "UBS Partner".

Important user clarification:

- Focus first on the demo page, not assistant behavior.
- The dashboard should eventually demonstrate data coming from a DB because later AI service tools should query the same dashboard data.
- Do not assume the existing Hono chat server is available for dashboard data queries. The chat backend and host dashboard data problem are separate concerns unless explicitly reconnected.
- The frontend host app should still be a single-page demo and should not create routes.

Recommended near-term approach:

- Model dashboard data with typed domain records and a repository/data-source boundary in the embedded host app.
- Keep the UI render path independent of assistant/chat state.
- If DB-backed dashboard data is required before backend integration, choose an explicit non-Hono demo data approach in a future decision, such as a local fixture-to-DB seed contract, a separate data service, or an in-browser/local demo DB. Do not silently query Postgres directly from browser code.
- Shape all dashboard records with stable IDs and fields suitable for future AI tools.

## UBS Partner Dashboard Direction

Single-page demo only. Do not create real navigation or additional pages. Sidebar items, table row links, footer links, pagination, export, filters, and quick actions may be visually present but should be disabled, inert, or no-op unless explicitly needed.

Visual direction:

- UBS-inspired: corporate, precise, premium, restrained.
- Mostly white surfaces, black/charcoal text, light gray dividers, sober spacing.
- Red is the main accent.
- Avoid playful blue SaaS styling, gradients, excessive rounded corners, and marketing visuals.

Page content:

- Product label: `UBS Partner`
- Page title: `Advisory Workbench` or `Partner Dashboard`
- Subtitle: real-time overview of relationships, portfolio performance, advisory coverage, and risk.
- Top controls: date range, filters, export, overflow menu. These are visual/no-op.
- KPI cards: Total AUM, Net New Money, Advisory Coverage, At-Risk Accounts, Client Meetings, Compliance Alerts.

Main table: one unified `Portfolio Worklist` super table. Keep the demo focused on this single AG Grid surface rather than multiple competing tables. It combines relationship coverage, portfolio performance, risk/task, due-date, alert, RM, and next-action fields so the assistant can filter and sort one obvious work queue.

Columns:

- Client
- Segment
- AUM
- 30D Net Flow
- Risk Score
- Coverage Status
- Priority
- Risk / Task
- Exposure
- Due Date
- Due Status
- RM
- Next Action
- Alert

## Assistant Direction For UBS Demo

The assistant should eventually be a fixed right-side drawer attached to the workspace, visually subordinate to the main dashboard. Do not make it a floating marketing modal.

Assistant shell:

- Header: Workspace Assistant
- Compact model picker pill: gpt-4.1-mini
- Close icon
- Context indicator: Using current page context
- Response sections: Key takeaways, Client coverage summary, Suggested actions
- Quick action chips: Summarize this page, Review at-risk accounts, Compare to last quarter, Draft client updates
- Bottom sticky composer with placeholder `Ask about this page...`
- Send icon inside the input, aligned right
- No duplicate model label near composer

Current user priority: build the demo page/data direction first; assistant can be refined later.

## Acceptance Evidence To Preserve

- Embedded host imports the widget package, not widget internals.
- The widget can open, stream markdown, show model metadata, and show usage.
- Default tests, CI, and local smoke do not require real AI provider tokens.
- Model switching changes selected model metadata in streamed response.
- Runtime DB access goes through `packages/db` stored procedure/function calls.
- Boundary scans enforce Hono, AI SDK, `pg`, naming, and stored-procedure rules.
