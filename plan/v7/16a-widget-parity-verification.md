# Step 16a: Widget Parity Verification — Feature and Look Identity

Read this when: proving the native widget matches the legacy polished widget before the Step 20 cutover deletes the legacy path.

Source of truth for: the pre-cutover parity gate — the feature-identity and look-identity checklists, the side-by-side verification method, and the intentional-divergence sign-off.

Not source of truth for: individual widget features (Steps 13–16) or the cutover and deletion mechanics (Step 20).

Tracking: status and owner are maintained only in [`STATUS.md`](./STATUS.md).

Depends on: 14, 15, 16 (native widget feature-complete). Unblocks: 20. Re-confirm immediately before the Step 20 cutover.

## Outcome

Before Step 20 deletes the legacy protocol widget, the native workflow widget is proven to match it on two axes: **feature identity** — it does everything the legacy widget does — and **look identity** — it is visually indistinguishable across every theme and density, or each difference is explicitly listed and approved. Parity is demonstrated by direct side-by-side comparison against the same fixtures, not asserted. Any capability or visual detail present in the legacy widget and absent from the native one is a cutover blocker until it is either ported or signed off as an intentional cut.

## Why this gate exists

The native path re-derives rendering from AI SDK `UIMessage` parts and reuses the shared leaf components, but the shipped polish lives in the legacy composition layer (`widget-message-view.tsx` + `widget-activity-content.tsx`) and the shell features around it. Reusing leaf primitives does not carry that composition over. Without an explicit gate, cutover silently downgrades the shipped UI. The Step 14 review passed because its bar was "render the vocabulary with the component library," which is lower than "match the legacy composition"; this gate closes that gap.

## Feature identity — the legacy widget's capabilities

Each row must work in the native widget or be a signed-off cut.

- **Conversation shell:** sidebar and switcher (multi-conversation), header conversation title, empty state, reset, usage surface.
- **Prompting:** quick-action suggestions, turn-profile / model selector, host-bridge host-command integration.
- **Settings view:** theme (all four), density, reasoning visibility, tool-detail level (hidden / name / full), send preference (Enter vs Ctrl/Cmd+Enter), message actions (copy).
- **Message composition:** reasoning and tool calls grouped into one "Thought process" activity fold; "Thought for N seconds" duration; tool-detail-level-driven rendering; curated footnote-source citations whose numbers match inline chips; images and the merged sources fold.

## Parity status — 2026-07-13

Recorded after the client-portable parity pass, grounded in a backend capability audit of `apps/side-chat-service` (route table, chat request schema, stream assembly).

### At parity (native = legacy), browser-verified

- **Settings view + header gear** — theme (all four), accent, corners, density, elevation, text size, typeface, send preference, tool-detail level. Reuses the shared `SettingsView`. Evidence: `evidence/task-16a-widget-parity/settings-view.png`.
- **Empty state + quick actions** — greeting, agent mark, context-aware description, host starter prompts. Evidence: `evidence/task-16a-widget-parity/empty-state.png`.
- **Tool-detail level** — `hidden` drops tool rows, `name` pins a compact row, `full` keeps the expandable detail (unit-tested).
- **Reasoning visibility** — `detailed` holds a completed trace open (unit-tested).
- **Agent mark** — `renderAgentMark` flows to the header title and the empty state.
- **Activity composition** — reasoning + tools folded into one "Thought process" trace ahead of the answer; sources fold; images; files (Step 14/15 + the look restoration).

Not yet carried: **"Thought for N seconds" duration** (the native projection has no activity timing) and **message-action copy**. Both are small client follow-ups.

### Backend-gated — needs `apps/side-chat-service` changes, not a widget port

The workflow service is single-model, has no server-tool catalog, and does not put usage on the wire. These are service + product decisions:

- **Model selector / turn profiles** — `GET /api/models` returns one model and `selectModel` rejects any other id (`MODEL_NOT_ALLOWED`). A real selector needs a multi-model catalog + a permissive policy.
- **Reasoning-effort control** — not a request field; baked into provider config.
- **Server tools menu** — no `/tools` route and no server-tool execution; only host-supplied client tools travel on `clientTools`.
- **Usage / context meter** — usage is computed and persisted but never sent on the stream (`messageMetadata` unpopulated; `providerMetadata` scrubbed). The native projection captures none.

### Portable, decision pending

- **Conversation sidebar + switcher (multi-conversation)** — `GET /api/conversations` exists and the service generates + persists titles, so this is a client-only port. The list client method (`readWorkflowConversations`) has landed with tests. The remaining wiring makes the widget **own** `conversationId` (today a required prop), changing its model from host-pinned-single to widget-managed-multi. Scope decision: is the native widget multi-conversation like the legacy widget, or deliberately single-conversation? If it ships, sign off one degradation — **cross-conversation running dots** are not populated (native discovery is per-conversation).

## Look identity — visual parity

- Side-by-side legacy vs native for the same conversation fixture, per theme: Graphite, Sapphire, Sage, Ocean.
- Repeated across the density range.
- Token compliance: no hardcoded colors or spacing; every surface reads from the design-system token tiers (the design-system skill governs). No dark mode reintroduced.
- Vertical rhythm, fold affordances, and message layout match the legacy view.

## Verification

- Drive both modes in the harness — legacy (`local-service` / `mock-stream`) and native (`workflow-service`) — against one deterministic fixture that exercises every mapping row: text, reasoning, tools running/done/denied, approval, sources, files, and each terminal state.
- Capture side-by-side screenshots per theme; record them as evidence under `evidence/`.
- Walk the feature checklist in the browser, not by reading code.

## Intentional-divergence sign-off

Any legacy feature or visual detail deliberately not carried into the native widget is listed here with a one-line rationale and explicit approval. An unlisted difference blocks cutover.

## Completion checklist

- [x] Client-portable feature parity implemented and browser-verified (settings, empty state, quick actions, tool-detail, reasoning-visibility, agent mark, activity fold).
- [ ] Multi-conversation sidebar/switcher: scope decision, then build or sign off as an intentional cut.
- [ ] Backend-gated features (model selector, reasoning effort, server tools, usage meter): sign off as service-dependent, or schedule the service work.
- [ ] Small client follow-ups: "Thought for N seconds" duration, message-action copy.
- [ ] Look-identity side-by-side captured across all four themes and the density range.
- [ ] Design-system token/density audit passes on all native components.
- [ ] Step 20 references this gate as a hard precondition.
