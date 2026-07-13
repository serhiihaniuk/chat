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
- **Conversation sidebar + switcher (multi-conversation)** — the widget owns the active conversation; lists workspace conversations (`GET /api/conversations`, server-generated titles); new/select remounts a keyed session; a settled turn refreshes the list. Evidence: `evidence/task-16a-widget-parity/sidebar.png`. Signed-off degradation: cross-conversation running dots stay empty (native discovery is per-conversation).
- **Composer footer + model selector** — the native path uses the shared `WidgetFooter` (same composer as legacy); the model selector reads `GET /api/models` and sends the chosen id as `modelPreference`.
- **Tool-detail level** — `hidden` drops tool rows, `name` pins a compact row, `full` keeps the expandable detail (unit-tested).
- **Reasoning visibility** — `detailed` holds a completed trace open (unit-tested).
- **Agent mark** — `renderAgentMark` flows to the header title and the empty state.
- **Activity composition** — reasoning + tools folded into one "Thought process" trace ahead of the answer; sources fold; images; files (Step 14/15 + the look restoration).

Not yet carried: **"Thought for N seconds" duration** (the native projection has no activity timing) and **message-action copy**. Both are small client follow-ups.

### Complete — durable real-provider execution

Production no longer passes raw OpenAI/Azure SDK models across WorkflowAgent's internal durable step. `ModelProvider` now requires a marked Workflow-serializable handle; production serde journals only provider/model and non-secret routing, then reconstructs the raw SDK model in the step realm with the current environment-resolved credential. The same correction covers turn and title agents. Title generation uses normalized plain text plus the durable sleep/abort timeout instead of sending a schema object or numeric `AbortSignal.timeout` across the workflow realm. Evidence: credential-negative OpenAI/Azure reconstruction tests, compiled compatibility 13/13, production Postgres build, and a genuine OpenAI/Postgres turn with streamed text, `finish(stop)`, usage metadata, durable history, and an asynchronously persisted title.

### Complete — composer tools menu + usage meter

- **Usage / context meter** — live and replayed terminal finishes carry schema-validated folded `messageMetadata.usage`; completed assistant history persists the same safe object and degrades invalid metadata before transport; `/api/models` publishes the configured `contextWindowTokens`; the widget validates both, projects the newest assistant usage, and supplies the existing `WidgetFooter` meter. Evidence: 11 focused files / 102 tests plus browser assertion and the visible tooltip capture at `evidence/task-16a-widget-parity/usage-meter.png`.
- **Server tools menu** — authenticated `/api/tools` exposes only the display projection `{ name, label, description, defaultEnabled }` of the trusted server catalog; schemas, executors, approval predicates, and provider data stay private. The native menu reads it through TanStack Query, preserves `undefined` when unavailable/empty and `[]` when every returned tool is disabled, and sends the optional allowlist on every new turn. The service rejects malformed/duplicate selections and client/server name collisions, intersects the request with the trusted catalog, and threads the plain selection through the durable workflow. The production catalog remains empty. Evidence: focused B4 contracts 8 files / 74 tests, service suite 54 files / 240 passed / 12 skipped, widget suite 50 files / 300 tests, direct service/widget TypeScript, scoped Oxlint, custom governance, and the browser allowlist assertion/capture at `evidence/task-16a-widget-parity/tools-menu.png`.

### Backend-gated / product decisions (not scheduled)

- **Multi-model selection** — `GET /api/models` returns one model and `selectModel` rejects any other id. The selector shows the configured model; a real multi-model catalog + permissive policy is a product decision.
- **Reasoning-effort control** — not a request field; baked into provider config.

## Look identity — visual parity

- Side-by-side legacy `mock-stream` and native `workflow-service` use the same prompt/answer fixture and compare message, thought, source, file/image, sidebar, header, and composer rhythm.
- Twelve paired captures cover Graphite, Sapphire, Sage, and Ocean at compact, cozy, and roomy density: `evidence/task-16a-widget-parity/look-<theme>-<density>.png`.
- Every pair asserts the expected root theme attribute and exact density `--space-unit`; no widget styles or tokens were added for the native branch, and no dark mode was reintroduced.
- The captures make the remaining duration gap visible: native says "Thought process" because replay has no timing. The evidence fixture deliberately pairs a sanctioned native file with the legacy activity image so both portable attachment surfaces stay visible; that fixture variation is not a product divergence.

## Verification

- The paired look fixture covers the shared text, reasoning, completed-tool, source, file/image, and terminal-completion surfaces. Mutually exclusive approval, denial, cancellation, failure, and reconnect states remain separate deterministic browser scenarios recorded by Steps 14–16 rather than being forced into one impossible terminal transcript.
- The B3/B4 browser scenario verifies the server-tools menu, disables one tool, asserts the exact request allowlist, streams terminal usage, asserts the meter value text, and captures both states.
- The 12-pair browser test asserts no console/page errors; screenshot animations are disabled only at capture time so transient compositor layers cannot corrupt evidence.

## Intentional-divergence sign-off

Any legacy feature or visual detail deliberately not carried into the native widget is listed here with a one-line rationale and explicit approval. An unlisted difference blocks cutover.

## Completion checklist

- [x] Client-portable feature parity implemented and browser-verified (settings, empty state, quick actions, tool-detail, reasoning-visibility, agent mark, activity fold).
- [x] Multi-conversation sidebar/switcher: built and browser-verified.
- [x] Composer footer + model selector restored (shared `WidgetFooter`); multi-model is a product decision, reasoning-effort backend-gated.
- [x] Composer tools menu + usage meter: B3/B4 implementation, request narrowing, visible menu, and terminal meter browser-verified.
- [ ] Small client follow-ups: "Thought for N seconds" duration, message-action copy.
- [x] Look-identity side-by-side captured across all four themes and compact/cozy/roomy density.
- [x] Design-system theme/density audit passes on the paired native roots; this slice added no styles or tokens.
- [x] Step 20 references this gate as a hard precondition.
