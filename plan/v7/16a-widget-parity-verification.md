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

> **Gate reopened 2026-07-14.** A code-level audit found that the browser captures and focused tests did not prove the full contract below. Every prior completion check is provisional until the correction acceptance section passes. Existing screenshots remain useful visual evidence, but they are not completion evidence for behavior, architecture, configuration, or token ownership.

## Correction audit — 2026-07-14

| Reported issue                                    | Repository evidence                                                                                                                                                                                                                                                  | Required correction                                                                                                                                                                                                       |
| ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Code quality regressed                            | `workflow-side-chat-widget.tsx` and `workflow-message-timeline.tsx` approach the production file-size ceiling; the workflow branch duplicates shell and timeline orchestration already owned by the protocol branch; `WorkflowPanelView` hardcodes missing behavior. | Use one explicit selection model and one shared shell/presentation contract. Split policy, querying, session lifecycle, and rendering by responsibility, with direct tests for the state model.                           |
| Refresh without a chat errors                     | `WorkflowChatClient.conversationId` is mandatory; the harness substitutes `conversation-1`; history then requests a record that may not exist.                                                                                                                       | Make the initial conversation optional. A missing id means a local draft and suppresses history/discovery until the server accepts the first turn.                                                                        |
| Refresh opens an existing chat                    | `useMissingConversationFallback` handles a 404 by selecting `conversations[0]`; the repository lists newest first.                                                                                                                                                   | Delete newest-chat fallback. Idle reload always opens New chat, even when the workspace already has conversations.                                                                                                        |
| Chat selection is tracked by URL                  | The workflow widget exposes `onConversationIdChange`, and the harness writes `conversationId` with `history.replaceState`; there is no controlled navigation or `popstate` contract.                                                                                 | Remove URL mutation from the default/public workflow path. Routing may be added later only as a complete host-owned controlled contract, not a notification side effect.                                                  |
| Architecture is worse than the pre-v7 Effect path | The native widget duplicates composition while omitting behavior. `ARCHITECTURE.md` describes a staged `prepareTurn` and thin route, but current model selection remains in the Hono route and the route/runner are large orchestration surfaces.                    | Restore named preparation stages and honest ownership. Consolidate shared widget presentation, keep transport-specific state at the edge, and update architecture docs to match the implemented call graph.               |
| Config is no longer one readable file             | ADR 0010 requires one deployment file to reveal provider, models, tools, policy, budgets, and timers. The replacement config declares one model while model policy and the production tool catalog live in separate modules.                                         | Make `apps/side-chat-service/sidechat.config.ts` the complete readable declaration. Catalog modules may supply typed values, but may not hide selected models, tool exposure, request policy, context, or auxiliary jobs. |
| Features are not mapped one-to-one                | Workflow originally omitted `renderActivityItem`, turn-profile compatibility, and storage semantics. Activity customization now has one transport-neutral contract; host `getContext` and the complete model/profile mapping remain open.                            | Maintain an explicit parity matrix and either wire each legacy capability or record an approved cut. No cut is currently approved.                                                                                        |
| Streamdown messages bypass CSS tokens             | `.sc-markdown` uses raw spacing utilities for inline code, code blocks, lists, headings, blockquotes, and tables. `Message` and `MarkdownContent` both add `.sc-markdown`, and the documented `--message-block-gap` value disagrees with CSS.                        | Give one wrapper ownership of `.sc-markdown`; introduce documented tier-2 message tokens before CSS use; remove raw design-significant spacing from Streamdown selectors; add token contract tests.                       |

### Refresh and selection contract

- Selection is a discriminated state: `draft` or `persisted`, never a bare string plus a second "local draft id" variable.
- Initial persisted selection is optional. Absence means New chat; a 404 remains a visible/typed missing selection and never chooses another conversation.
- Draft promotion happens when the service accepts the turn and returns the workflow run id, not when the turn reaches a terminal.
- Only an in-flight, tab-scoped recovery cursor survives refresh. It is cleared at terminal completion. Normal selection is not written to URL or persistent browser history.
- Conversation list refresh is independent of draft promotion and cannot silently change the active selection.

### Required one-to-one feature map

| Surface             | Legacy contract to preserve                                                            | Workflow correction status                                                                                                                                                          |
| ------------------- | -------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Conversation shell  | New chat, select, title, refresh, running indicators, busy-safe controls               | Partial: one shared shell now owns New chat/select/refresh/settings/header/switcher, and real running/busy state is wired; conversation-specific title semantics remain to reverify |
| Prompting           | quick actions, model/turn choice, host context, host/client tool integration           | Open; quick actions and model/client tools exist, host context and complete model catalog do not                                                                                    |
| Settings            | theme, appearance, send preference, reasoning visibility, tool detail                  | Reverified after shared-shell consolidation in the paired look fixture and interaction suite                                                                                        |
| Message composition | reasoning/tools fold, duration, activity override, citations, images/files, copy/retry | Partial: activity override is mapped through one transport-neutral contract; the other composition behavior remains unchanged and must stay covered at cutover                      |
| Recovery            | idle New chat, active refresh reattach, drop retry, multi-tab convergence              | Reopened in Step 16                                                                                                                                                                 |
| Configuration       | one readable deployment declaration                                                    | Open                                                                                                                                                                                |
| Styling             | shared design tokens across legacy and workflow Streamdown messages                    | Open                                                                                                                                                                                |

### Verification gaps found by the audit

- Resolved in the first correction slice: direct selection/cursor tests cover draft creation, service-accept promotion, persisted selection, stale recovery, and terminal cleanup.
- Resolved in the first correction slice: the harness ignores `conversationId` routing, the stale-route case remains New chat, and the stateful two-tab case proves watcher selection without URL/cursor coupling.
- Resolved in the first correction slice: the stateful multi-tab proof is isolated in a typed spec/service, and source-shape plus unsafe-escape-hatch governance is green.
- Resolved for the touched projects: direct service, widget, and E2E TypeScript checks pass. This slice does not claim the broader root typecheck as completion evidence.
- `lint:custom` passing proves package and source-shape rules, not parity or refresh correctness.

### First correction slice — shared shell, refresh, and running state

- `SideChatPanelView` is now the single transport-neutral owner of settings-open state, sidebar, header, narrow switcher, labels, New chat/select/refresh controls, running indicators, and busy guards. The duplicate workflow panel was deleted; protocol feed/footer and native workflow content remain transport-specific slots.
- Workflow queries share one exported query prefix. Refresh invalidates active catalog/history/discovery/model/tool reads and remounts only a persisted selection after refetch. It neither selects a catalog fallback nor mutates routing, and it leaves a local New chat draft intact.
- The service conversation query port exposes active turns. In-memory filtering is tenant-owned, PostgreSQL uses one active-turn list read, and the HTTP/catalog boundary publishes and defensively validates `runningConversationIds`.
- Workflow chat status is lifted to the panel. A locally accepted chat stays mounted while persistence reads catch up; running rows cannot be selected again, and both tabs converge after replay and terminal completion.
- This slice did **not** address host context, the complete model/profile mapping, readable one-file config, Streamdown token ownership, or Step 16 transport-drop/manual-reconnect behavior. Those remain cutover blockers. Activity rendering is closed by the correction slice below.

### Activity-renderer correction slice — one public contract

- `SideChatActivityItem` is the only public activity item type. It is widget-owned and transport-neutral; protocol activity state and native AI SDK parts are adapted at their respective feature boundaries.
- Both widget branches accept `renderActivityItem`. Reasoning may be replaced before its default; tool `hidden` and `name` policies remain authoritative; `full` may be replaced before existing detail rendering.
- Native approval cards remain security-owned and never invoke the callback. Sources, files, images, copy, retry, host context, configuration, model/profile selection, and Streamdown styling are outside this slice.
- Evidence: focused activity contract 5 files / 33 tests, full widget 58 files / 330 tests, direct widget TypeScript, scoped Oxlint/format, and custom governance. This mapping does not close the overall Step 16a gate.

### At parity (native = legacy), browser-verified

- **Settings view + header gear** — theme (all four), accent, corners, density, elevation, text size, typeface, send preference, tool-detail level. Reuses the shared `SettingsView`. Evidence: `evidence/task-16a-widget-parity/settings-view.png`.
- **Empty state + quick actions** — greeting, agent mark, context-aware description, host starter prompts. Evidence: `evidence/task-16a-widget-parity/empty-state.png`.
- **Conversation sidebar + switcher (multi-conversation)** — the shared shell now owns both compositions. The workflow path has no newest-chat fallback or URL notification, promotes on service acceptance, displays catalog running ids, and applies busy-safe navigation guards. Conversation-specific title semantics remain to reverify before this row closes.
- **Composer footer + model selector** — the native path uses the shared `WidgetFooter` (same composer as legacy); the model selector reads `GET /api/models` and sends the chosen id as `modelPreference`. The documented `+` control remains visible with an empty production tool catalog and honestly reports that no tools are available.
- **Tool-detail level** — `hidden` drops tool rows, `name` pins a compact row, `full` keeps the expandable detail (unit-tested).
- **Reasoning visibility** — `detailed` holds a completed trace open (unit-tested).
- **Agent mark** — `renderAgentMark` flows to the header title and the empty state.
- **Activity composition** — reasoning + tools folded into one "Thought process" trace ahead of the answer; sources fold; images; files (Step 14/15 + the look restoration).

Completed assistant activity now carries a bounded `activityDurationMs` measured inside the durable workflow. Live finish, replay finish, persisted assistant history, scrub validation, and widget validation share that value; completed native traces round it up to the same **"Thought for N seconds"** label while older messages safely retain "Thought process." Completed assistant text uses the shared Copy action in both widget paths.

### Complete — durable real-provider execution

Production no longer passes raw OpenAI/Azure SDK models across WorkflowAgent's internal durable step. `ModelProvider` now requires a marked Workflow-serializable handle; production serde journals only provider/model and non-secret routing, then reconstructs the raw SDK model in the step realm with the current environment-resolved credential. The same correction covers turn and title agents. Title generation uses normalized plain text plus the durable sleep/abort timeout instead of sending a schema object or numeric `AbortSignal.timeout` across the workflow realm. Evidence: credential-negative OpenAI/Azure reconstruction tests, compiled compatibility 13/13, production Postgres build, and a genuine OpenAI/Postgres turn with streamed text, `finish(stop)`, usage metadata, durable history, and an asynchronously persisted title.

### Complete — composer tools menu + usage meter

- **Usage / context meter** — live and replayed terminal finishes carry schema-validated folded `messageMetadata.usage`; completed assistant history persists the same safe object and degrades invalid metadata before transport; `/api/models` publishes the configured `contextWindowTokens`; the widget validates both, projects the newest assistant usage, and supplies the existing `WidgetFooter` meter. Evidence: 11 focused files / 102 tests plus browser assertion and the visible tooltip capture at `evidence/task-16a-widget-parity/usage-meter.png`.
- **Server tools menu** — authenticated `/api/tools` exposes only the display projection `{ name, label, description, defaultEnabled }` of the trusted server catalog; schemas, executors, approval predicates, and provider data stay private. The native menu reads it through TanStack Query, preserves `undefined` when unavailable/empty and `[]` when every returned tool is disabled, and sends the optional allowlist on every new turn. The service rejects malformed/duplicate selections and client/server name collisions, intersects the request with the trusted catalog, and threads the plain selection through the durable workflow. The production catalog remains empty. Evidence: focused B4 contracts 8 files / 74 tests, service suite 54 files / 240 passed / 12 skipped, widget suite 50 files / 302 tests, direct service/widget TypeScript, scoped Oxlint, custom governance, and the browser allowlist assertion/capture at `evidence/task-16a-widget-parity/tools-menu.png`.

### Complete — real Luna model and per-model reasoning control

- **Luna model** — production OpenAI turns and title generation now select the actual Responses API model id `gpt-5.6-luna`; GPT-5.4 was removed from the replacement service configuration rather than cosmetically relabeled. The provider's durable serde boundary remains unchanged: only the real model id and safe routing cross Workflow, while the current application credential reconstructs the SDK delegate in the step realm.
- **Reasoning-effort control** — the browser-safe stream profile owns the wire vocabulary, but each provider model descriptor owns its supported subset and default, matching the pre-v7 configuration pattern. Luna advertises `low | medium | high` through authenticated `/api/models`; the widget renders those exact selected-model options as Light / Medium / High, preserves the selection across New chat, and sends it per turn. HTTP validates the vocabulary, turn policy rejects efforts outside the selected model's catalog, and the durable OpenAI adapter maps the resolved value to `providerOptions.openai.reasoningEffort`. Browser evidence and the exact request assertion are refreshed in `evidence/task-16a-widget-parity/`.

## Look identity — visual parity

- Side-by-side legacy `mock-stream` and native `workflow-service` use the same prompt/answer fixture and compare message, thought, source, file/image, sidebar, header, and composer rhythm.
- Twelve paired captures cover Graphite, Sapphire, Sage, and Ocean at compact, cozy, and roomy density: `evidence/task-16a-widget-parity/look-<theme>-<density>.png`.
- Every pair asserts the expected root theme attribute and exact density `--space-unit`; no widget styles or tokens were added for the native branch, and no dark mode was reintroduced.
- The captures prove the duration gap is closed: the paired fixture renders "Thought for 1s" in both paths from deterministic legacy activity timestamps and native durable metadata. The fixture deliberately pairs a sanctioned native file with the legacy activity image so both portable attachment surfaces stay visible; that fixture variation is not a product divergence.

## Verification

- The paired look fixture covers the shared text, reasoning, completed-tool, source, file/image, and terminal-completion surfaces. Mutually exclusive approval, denial, cancellation, failure, and reconnect states remain separate deterministic browser scenarios recorded by Steps 14–16 rather than being forced into one impossible terminal transcript.
- The B3/B4 browser scenario verifies the server-tools menu, disables one tool, asserts the exact request allowlist, streams terminal usage, copies the exact assistant answer through the shared action, asserts the copied state and meter value text, and captures the visible results.
- The 12-pair browser test asserts no console/page errors; screenshot animations are disabled only at capture time so transient compositor layers cannot corrupt evidence.
- Fresh correction-slice evidence: widget 56 files / 322 tests; focused service 4 files / 27 tests; direct service/widget/E2E TypeScript; custom governance; scoped Oxlint; and the isolated Workflow browser suite 11/11.

## Intentional-divergence sign-off

Any legacy feature or visual detail deliberately not carried into the native widget is listed here with a one-line rationale and explicit approval. An unlisted difference blocks cutover.

None approved.

## Correction acceptance

- Focused state tests cover draft creation, persisted selection, missing selection, service-accept promotion, terminal cursor cleanup, and no implicit fallback.
- Browser tests cover empty-store refresh, idle refresh with existing chats, mid-turn refresh, no URL mutation, and two-tab running-state selection.
- The parity matrix has no open row or each remaining cut has explicit user approval in the sign-off section.
- The replacement config can be read top to bottom to identify all selected models, reasoning choices, exposed server tools, request policy, host-context policy, budgets, and timers.
- Streamdown spacing/color/typography selectors consume documented tier-2 component tokens and one wrapper owns `.sc-markdown`.
- Focused tests, widget/service typechecks, scoped Oxlint, custom governance, and touched formatting pass; root baseline failures, if any, are separated from touched regressions.

## Completion checklist

- [x] Correct refresh/selection contract implemented and verified with no URL tracking or implicit fallback.
- [x] Shared shell/presentation ownership restores refresh, busy safeguards, and running indicators without duplicate orchestration.
- [x] Custom activity rendering is mapped one-to-one through a transport-neutral public contract.
- [ ] Host context and the complete model/tool/profile contract are mapped one-to-one.
- [ ] One readable replacement-service config satisfies ADR 0010 in code and documentation.
- [ ] Streamdown message styling uses documented component tokens with one `.sc-markdown` owner.
- [x] Existing settings, composer, usage, copy, durable duration, and look-identity behavior is reverified after consolidation.
- [ ] Step 16 has real refresh and multi-tab evidence and is complete before this gate closes.
- [x] Step 20 references this gate as a hard precondition.
