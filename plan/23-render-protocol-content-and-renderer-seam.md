# 23 — Render protocol content (tool results, sources, images) + custom renderer seam

**Epic:** 4 Seams | **Priority:** P0 (core value of an AI-assistant widget) | **Depends on:** — | **Status:** todo

## Problem

The protocol carries `ActivityDetails.sources`, `images`, `tool.input`, `tool.result`, `hostCommand.result` (`packages/chat-protocol/src/sidechat-v1/events/event-union.ts:77-110`) and the widget model preserves them (`src/entities/chat/model/activity.ts:139-171`) — then the UI throws it all away: `toReasoningItems` reduces a tool/host-command item to `{name, state}` (`src/features/conversation/ui/widget-message-view.tsx:93-109`) and `ToolRow` is a non-interactive glyph+name line (`src/shared/ui/tool-row.tsx:30-37`). Sources, images, tool results, and host-command results render **nothing anywhere**; the mock stream emits them and they vanish. There is also **no seam** for an adopter to render a custom tool's result — the most likely first customization — and no `renderActivityItem`-style prop exists (`side-chat-widget.types.ts`). A latent related bug: a tool running concurrently behind the active one renders a success check (`widget-message-view.tsx:147-151` — only `running && isActive` spins; non-failed falls through to success).

## Decided approach

1. **Default renderings** (design-system-consistent, per the §-numbered component contract style):
   - Tool card: expandable row — collapsed = glyph+name+state (today's look), expanded = input summary + result (JSON pretty block or text), error state distinct. Fix the concurrent-tool state logic while here.
   - Sources: compact source-chip list (domain + title, link) under the owning activity item.
   - Images: inline thumbnails with a safe default (constrain size; no arbitrary host CSS).
   - Host-command result: status + resultCode line on the command's card (data payload behind the same expandable pattern).
2. **Renderer seam:** optional `renderActivityItem?: (item: WidgetActivityItem) => ReactNode | undefined` on `SideChatWidgetProps` — `undefined` falls through to the defaults; the item type (from `entities/chat/model/activity.ts`) becomes part of the public surface (export the type, document it). This is a rendering seam only — no behavior/dispatch hooks.
3. Showcase/docs-app sections for each new rendering (the repo's showcase-first discipline), driven by fixture data.
4. Mock-stream scenarios already emit sources/results — they become visible; extend `modes.ts` if any content kind lacks a scenario.
5. Coordinate with story 30 (the old e2e asserted tool detail cards — this story recreates that behavior properly; story 30 rewrites the assertions).

## Acceptance criteria

- [ ] In mock-stream harness mode: a tool call shows expandable input/result; sources render as chips; images render; a host-command result shows its status (screenshot/e2e assertions).
- [ ] `renderActivityItem` returning custom JSX for one tool name overrides only that item (unit + harness test).
- [ ] A second concurrently-running tool spins instead of showing a false success check (unit test).
- [ ] Widget public exports gain the item type; README documents the prop.

## Verification

```sh
npm test --workspace @side-chat/side-chat-widget
npm run test:e2e
npm run verify
```
