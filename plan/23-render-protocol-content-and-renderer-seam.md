# 23 — Render protocol content (tool results, sources, images) + custom renderer seam

**Epic:** 4 Seams | **Priority:** P0 (core value of an AI-assistant widget) | **Depends on:** — | **Status:** done

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

- [x] In mock-stream harness mode: a tool call shows expandable input/result; sources render (as the design-system Citations fold — see notes); images render; a host-command result shows its status (e2e assertions).
- [x] `renderActivityItem` returning custom JSX for one tool name overrides only that item (unit + harness test).
- [x] A second concurrently-running tool spins instead of showing a false success check (unit test).
- [x] Widget public exports gain the item type; README documents the prop.

## Verification

```sh
npm test --workspace @side-chat/side-chat-widget
npm run test:e2e
npm run verify
```

## Delivery notes

**Sources follow the design system's Citations spec, not the story's chip sketch.**
Mid-story the design source of truth (`Design System (standalone) (1).html`,
section `c-citation`) was pointed out: attribution renders as a foldable
**"N sources"** row below the answer — the same Base UI `Collapsible` contract as
the Reasoning fold (trigger + chevron + `--collapsible-panel-height` animation),
with source rows (leader glyph, title + domain meta, trailing number chip) in the
panel. Linking is a separate axis: a source with a `url` is an `<a>` with hover
fill and a trailing ↗ (opens externally); a terminal source (no url) is a `<div>`
— no hover, no pointer, no affordance. Inline `<sup>` markers from the design need
in-text citation positions the protocol does not carry; only the fold shipped.
Message-level aggregation dedupes by identity (url, else label) across
`details.sources` and `details.tool.sources`, in stream order.

**New components live in `shared/ui/activity/`** (the flat `shared/ui` dir is at
its 44-file governance cap): `citations.tsx` (`SourcesFold`), `activity-images.tsx`
(`ActivityImages` — thumbnails from base64 `data:` URIs, height-capped, no remote
fetch, no host CSS), `tool-detail.tsx` (`ToolDetailRow` — collapsed renders
exactly today's §9.9 glyph+name row plus a chevron; expanded disclose input/result
JSON `<pre>` blocks, a distinct `sc-error-glyph` error-code line, and a
host-command `status · resultCode` lead line). Tier-2 `--cite-*` tokens + four
hook classes (`sc-cite-glyph`, `sc-cite-marker`, `sc-cite-source`, `sc-cite-panel`)
were added to `styles.css` per the design token table; all component code stays
on registered utilities/hook classes (no literal colors/sizes).

**Item projection moved to the feature layer.**
`features/conversation/ui/activity/widget-activity-content.tsx` owns
`toReasoningItems` (was private in widget-message-view): per item, the precedence
is `renderActivityItem` override → expandable detail row (tool/host-command with
disclosable payloads) → compact `ToolRow` → thought line. `ReasoningItem` gained a
`{kind:"node"}` variant so `shared/ui/reasoning` stays protocol-neutral (shared
code may not import `@side-chat/*`; the shared components take structural props).

**Concurrent-tool bug fixed** in the same projection: any `running` item spins —
the old `running && isActive` gate made a tool running concurrently behind the
active row fall through to a success check (unit test asserts two spinners, zero
success).

**Renderer seam:** `renderActivityItem?: (item: WidgetActivityItem) => ReactNode |
undefined` on `SideChatWidgetProps`, threaded SideChatWidget →
WidgetConversation → WidgetMessageView. `undefined` falls through to defaults;
rendering-only (projection and host-command dispatch untouched). Public exports
gained `RenderActivityItem` + `WidgetActivityItem`.

**Host-command status:** results fold into `details.hostCommand.result`
(`{status, resultCode, …}` via the story-19 round-trip); the card leads with
`status · resultCode` and keeps payloads behind the expandable pattern.

**Showcase + harness:** three new showcase sections (Tool detail, Citations,
Activity images) registered in `showcase-sections.tsx`, fixture-driven. The mock
stream's `toolCompletedEvent` now also carries a deterministic base64 SVG image,
so mock-stream mode exercises every content kind (it already emitted tool
input/result + sources).

**Tests:** `shared/ui/activity/activity-content.test.tsx` (fold rows/linking,
folded-by-default, thumbnails+caption, detail disclosure, host-command status
line, error distinctness) + `features/.../activity/widget-activity-content.test.tsx`
(concurrent spinner, override-only-that-item, message-level fold + images +
dedupe) + updated `widget-message-view.test.tsx` (tool with payloads renders the
detail row, collapsed hides the payload). e2e: the plan-23 placeholder test grew
back into "renders expandable tool details, sources, and images from the activity
stream" (expand card → `"query"` + result text; expand fold → linked source row;
thumbnail visible without expanding).

**Docs:** widget README documents the prop + defaults; extension-seams.md gained
the "Render an activity item" seam-map row + how-to (custom tool-result card
example). Per the docs placement policy clarified mid-story (all docs in
`docs/architecture/*.md` except design-system docs, which live in apps/docs), the
three new design-system components also got apps/docs pages: `tool-detail.mdx`,
`citations.mdx`, `activity-images.mdx` under
`content/docs/design-system/components/` with live demos
(`app/components/demos/{tool-detail,citations,activity-images}.tsx` rendering the
REAL widget components via `./ui/activity/*` exports) and a new `citations` token
group in `app/data/tokens-components.ts`. Validated by the docs app's own
`npm run typecheck` (react-router typegen + fumadocs-mdx + tsc). Note: the docs
app's production `npm run build` fails on a **clean tree** with a rotating
"Rolldown failed to resolve @/components/demos/<name>" error — pre-existing
toolchain breakage, verified via `git stash -u`, flagged as a separate task
(task_28972e0b), not caused or fixable by this story.

**Visual verification:** live preview of the mock-stream harness (tool scenario:
detail card expands with input/result JSON, "1 source" fold lists the linked row,
thumbnail renders) and the showcase (`/docs.html`: Citations section matches the
design — leader glyphs, domains, number chips, ↗ only on linked rows; Tool detail
section shows expanded/collapsed/error rows).
