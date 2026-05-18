# Embedded Host App Learning Guide

Status: local learning path

Read this when you want to understand the realistic Workbench page that consumes the reusable widget. This app proves the widget can live inside a host product without importing widget internals or letting the widget own host table state.

## Purpose

`apps/embedded-host-app` renders the Advisory Dashboard and embeds `@side-chat/side-chat-widget`. It owns the page data, the table view state, and the host bridge that gives the assistant page context and applies safe host commands.

```txt
AdvisoryWorkbenchPage
  -> loads dashboard snapshot
  -> registers host surface context
  -> renders Portfolio Worklist
  -> receives host commands from widget
  -> updates local table view
```

## Owns / Does Not Own

| Owns | Does not own |
| --- | --- |
| Workbench layout and dashboard rendering. | Chat protocol schemas. |
| Host-surface registration and command application. | Widget internals. |
| Local browser table view state. | Backend trusted surface state. |
| Citation highlight behavior in the host page. | Model/provider logic. |

## Read Order

1. [`src/App.tsx`](src/App.tsx)  
   See the page and widget mounted together.

2. [`src/shared/host-surface/HostSurfaceProvider.tsx`](src/shared/host-surface/HostSurfaceProvider.tsx)  
   Learn the host bridge pattern.

3. [`src/features/advisory-workbench/model/side-chat-host.ts`](src/features/advisory-workbench/model/side-chat-host.ts)  
   See the host context and command dispatcher given to the widget.

4. [`src/features/advisory-workbench/ui/AdvisoryWorkbenchPage.tsx`](src/features/advisory-workbench/ui/AdvisoryWorkbenchPage.tsx)  
   See data loading, citation highlight, host command event handling, and page composition.

5. [`src/features/advisory-workbench/model/grid-view-state.ts`](src/features/advisory-workbench/model/grid-view-state.ts)  
   See how host commands become local table state.

6. [`src/features/advisory-workbench/ui/AdvisoryWorklistTable.tsx`](src/features/advisory-workbench/ui/AdvisoryWorklistTable.tsx)  
   See the visible table that commands filter/sort/highlight.

   Then read [`src/features/advisory-workbench/ui/advisory-worklist-table/`](src/features/advisory-workbench/ui/advisory-worklist-table/) for the extracted row model, view-summary chips, and cell renderers.

7. [`src/features/advisory-workbench/api/advisory-dashboard-client.ts`](src/features/advisory-workbench/api/advisory-dashboard-client.ts)  
   See the browser data API client.

## Key Files

| File | Why it exists |
| --- | --- |
| `src/main.tsx` | React entry point. |
| `src/App.tsx` | Composition root for the host page plus widget. |
| `src/shared/host-surface/HostSurfaceProvider.tsx` | Registry for the active host surface; adapts host context and commands to widget props. |
| `src/features/advisory-workbench/api/advisory-dashboard-client.ts` | Browser client for the dashboard data API. |
| `src/features/advisory-workbench/model/advisory-dashboard.types.ts` | Host-side dashboard DTOs. |
| `src/features/advisory-workbench/model/grid-view-state.ts` | Pure reducer for assistant-driven grid view commands. |
| `src/features/advisory-workbench/model/side-chat-host.ts` | Converts the Workbench page into `HostContextSnapshot` and validates host commands. |
| `src/features/advisory-workbench/ui/*` | Presentation components for the Workbench page. Focused subfolders hold component-specific model/rendering helpers when a component gets large. |

## Technology Purpose In Context

### React

React owns rendering and browser lifecycle here: data loading, event listeners, local state, and component composition. React does not own the chat protocol. It passes a host bridge into the widget and reacts to host-command events.

### The Widget Package

The host imports only `@side-chat/side-chat-widget`. It does not import widget internals. This is what makes the widget reusable.

### Dashboard Data API

The host calls `/advisory-dashboard/snapshot`. Vite proxies this to `apps/dashboard-data-api` during local development.

## Boundary Warnings

- Do not import widget source internals directly.
- Do not connect to Postgres from browser code.
- Do not make the widget own Workbench table state.
- Keep fake navigation and secondary controls inert unless explicitly wired.

## Verification

Run from the repository root:

```sh
npm run typecheck
npm run verify
```

## Read Next

- [Code Walkthrough](../../docs/code-walkthrough.md) for the reusable widget guide link and full app reading path.
- [Dashboard Data API](../dashboard-data-api/LEARNING.md) for the host data source.
- [Side-Chat API](../side-chat-api/LEARNING.md) for streamed assistant responses.
