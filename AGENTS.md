# Repository Guidelines

## Durable Context

Read [docs/CONTEXT.md](docs/CONTEXT.md) before making architecture, product, demo-data, widget, backend, or DB decisions. It captures the current side-chat assistant requirements, topology, dependency pins, boundary rules, UBS Partner dashboard direction, and latest user clarifications.

## Current Project Shape

This repo is an npm-workspace side-chat assistant foundation with:

- `apps/side-chat-api` for the Hono/Effect backend track.
- `apps/widget-demo` for reusable widget state and package API demos.
- `apps/embedded-host-app` for the realistic host application consuming the widget package.
- `packages/shared-protocol` for `sidechat.v1` DTOs, schemas, fixtures, and validators.
- `packages/side-chat-widget` for the reusable React widget and vendored AI Elements-derived UI primitives.
- `packages/db` for stored-procedure-only Postgres access.
- `docker/postgres/init` for schema and deterministic seed SQL.

Do not reintroduce pnpm. Use npm workspaces.

## Commands

Run from the repository root:

- `npm install` - install dependencies and update `package-lock.json`.
- `npm run dev --workspace @side-chat/side-chat-api` - start the chat API.
- `npm run dev --workspace @side-chat/embedded-host-app -- --host 127.0.0.1` - start the embedded host app.
- `npm run dev --workspace @side-chat/widget-demo -- --host 127.0.0.1` - start the widget demo.
- `npm run lint` - run governance/boundary checks.
- `npm run typecheck` - run TypeScript build references.
- `npm test` - run Vitest.
- `npm run build` - run `tsc -b`.
- `npm run verify` - lint, typecheck, and tests.

## Naming Rules

Do not use throwaway validation wording in executable/product project names, package names, app names, runtime labels, or user-facing UI. Historical `.omx` planning artifacts are exempt.

## Architecture Boundaries

- Hono imports belong only under `apps/side-chat-api/src/inbound/hono`.
- AI SDK runtime imports belong only under `apps/side-chat-api/src/adapters/ai`, except documented AI Elements-derived widget display components may import AI message types as needed.
- `pg` imports belong only in `packages/db` and explicit migration/test harnesses.
- `packages/db` must not import Hono, React, AI SDK adapters, widget code, or application use cases.
- Runtime DB access must use stored procedures/functions. Do not add direct application-table SQL reads/writes in runtime code.
- `apps/embedded-host-app` must consume `@side-chat/side-chat-widget`; do not import widget internals from `packages/side-chat-widget/src`.

## Frontend Demo Direction

The embedded host app is being redesigned into a single-page "UBS Partner" advisory workbench. Focus on the demo page/data direction before further assistant refinements unless the user explicitly asks for assistant work.

Important constraints:

- Single page only. Do not add routes.
- Fake navigation, filters, export, pagination, table-row links, and secondary controls must be inert, disabled, or no-op.
- UBS-inspired visual direction: white, charcoal, light gray, thin dividers, restrained spacing, red accent. Avoid playful SaaS blue, gradients, excessive radius, and marketing layouts.
- Dashboard data should be shaped as future DB/tool-queryable records. Do not silently query Postgres from browser code, and do not assume the Hono chat server is available for dashboard data unless the user explicitly reconnects those concerns.

## Widget And AI Elements

`packages/side-chat-widget` must not require Next.js runtime APIs. AI Elements-derived components are vendored source under the widget package so consumers do not need to run AI Elements/shadcn generators. Keep Tailwind/CSS integration working in `apps/embedded-host-app`.

## Testing Expectations

Add or update tests with behavior changes. Run the narrowest relevant command first, then `npm run verify` for broad validation when practical. For frontend visual work, use browser verification against the running local app and check for console/page errors.

## Git Safety

The worktree may contain user or prior agent changes. Do not revert unrelated changes. Never use destructive git commands unless the user explicitly asks.
