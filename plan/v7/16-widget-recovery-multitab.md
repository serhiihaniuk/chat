# Step 16: Widget — Recovery, Refresh, and Multi-Tab

Read this when: implementing reattachment behaviors — refresh mid-anything, transport drops, second tabs.

Source of truth for: cold-load reattach, reconnect behavior, transport-error presentation, and multi-tab semantics.

Not source of truth for: transport wiring (Step 13) or server replay (Step 07).

Tracking: status and owner are maintained only in [`STATUS.md`](./STATUS.md).

Depends on: Steps 07, 10, 13, 15. Unblocks: Step 19; the widget is feature-complete after this step.

## Outcome

A user can refresh, lose network, or open a second tab at any moment and the widget recovers to a correct state without duplicate content. The old recovery ladder (~1,070 lines: watchdog, backoff, poll fallback, markers) has no successor code — the transport plus these behaviors replace it.

## Current evidence to verify (semantics being replaced)

`packages/side-chat-widget/src/features/chat/model/subscription/recovery/widget-transport-recovery.ts` (error classification retryable/fatal; reconnecting-is-never-terminal), `model/reconnect/{widget-run-controller,widget-run-marker,widget-reconnect-triggers}.ts` (marker machinery — replaced by Step 10 discovery).

## Target design

### Cold load / refresh

1. An ordinary mount or idle refresh starts in a client-only **New chat** draft. It does not request history or active-turn discovery for a fabricated id, and it never selects an existing conversation as a fallback.
2. Selecting a server-known conversation seeds history, then discovers and reconnects to its active turn when one exists. Replay reconciles with seeded history by message id, so no bubbles duplicate.
3. The service-accepted start of a draft turn promotes that draft to a persisted selection immediately. A widget-lifetime session registry owns that conversation's visible timeline and lifecycle through one reducer. Each immutable attachment epoch consumes `WorkflowChatTransport` with `readUIMessageStream` and dispatches projections into that reducer, so selection changes and panel unmounts do not own or cancel generation, and a newer durable observation can replace a stale epoch atomically. The browser retains only the narrow, tab-scoped recovery cursor needed to survive a hard refresh while the focused turn is active; terminal completion or leaving that focused run clears it. This cursor is not selected-chat persistence and never changes the URL.
4. A refresh with an active recovery cursor reattaches to that conversation. A refresh after the turn settles returns to New chat.
5. A second tab starts at New chat. A subject-scoped `/api/activity` stream registers before reading its active-turn snapshot, then publishes live running and terminal transitions. An already-open second tab therefore sees and can select a newly running conversation without manual refresh; selection then follows the same history + discovery path.
6. New chat, conversation selection, settings, and close/reopen remain available while any conversation runs. These actions change only the foreground view. Duplicate-send protection is scoped to the selected running conversation.
7. Every terminal outcome folds the closed Workflow journal into one durable visible assistant projection before atomic finalization. On success the journal is complete; on failure, timeout, or cancellation it is safely partial. Provider status, finish reason, and usage remain authoritative metadata, while history preserves the exact text/reasoning already shown. Provider-blocked content is never recovered.

The earlier statement that the native path needed no browser recovery state was too broad. Per-conversation discovery cannot identify which of several conversations a refreshed tab owned. The replacement is one bounded active-turn cursor, not the legacy watchdog/backoff/polling ladder.

### Transport drops

`WorkflowChatTransport` owns retries (`maxConsecutiveErrors` from config). Our layer renders: reconnecting state (never terminal), then — only after the transport gives up — a calm connection-lost state with a manual retry that re-runs discovery+reconnect. Server 4xx (busy, policy, auth) remain immediate typed errors, not retried (classification test).

### Multi-tab

Each tab owns its own stable per-conversation session aggregates and replaceable attachment engines, while the service activity stream supplies cross-conversation lifecycle state. Sender tab and watcher tab render identically after replay. The production activity source crosses service instances through database notifications; the in-memory source publishes the same contract. Cross-tab send conflict resolves via the server busy policy; the loser renders the busy error calmly.

## Edge cases (each a test)

1. refresh mid-turn → full answer reassembled (replay + live tail), zero duplicate bubbles;
2. refresh mid-approval → persisted `approval-requested` re-renders the card (Step 12/15 contract); deciding then works;
3. refresh mid-client-tool → Step 15's dedupe holds after reload;
4. transport drops N<max times then recovers → reconnecting shown, stream continues, no user-visible loss;
5. transport exhausts retries → calm connection-lost + manual retry works;
6. second tab already open when a turn starts → receives the running transition, catches up after selecting it, and converges to identical final state;
7. two tabs send simultaneously → one succeeds, one renders busy calmly;
8. network loss during idle (no active turn) → no reconnect storm; next send works;
9. discovery returns terminal (turn finished while offline) → history refetch shows the final message; no ghost pending bubble;
10. switch A → New chat → B → A while A streams → A keeps streaming and returns with one complete transcript;
11. close/reopen and header Refresh during generation → the same live session remains attached and no half-busy shell remains.
12. provider timeout or model failure after deltas → refresh shows the partial assistant text/reasoning and the safe terminal notice, with no empty assistant row when no deltas existed;

## Verification

```powershell
npm test -- packages/side-chat-widget
npm run typecheck
npm run lint:custom
rg -n "widget-run-marker|widget-transport-recovery" packages/side-chat-widget/src --glob '!**/model/**'
```

Browser evidence via the preview workflow: refresh mid-turn and a two-tab session, screenshots. Import-graph proof that the old recovery/reconnect modules have no consumer on the new path.

### Superseded correction slice — 2026-07-14

- Workflow selection now distinguishes a client-only `draft` from a server-known `persisted` conversation. Idle mounts do not issue fabricated history/discovery reads, missing recovery never falls back to the newest catalog row, service acceptance promotes the draft, and only the active-run cursor uses tab-scoped storage. Selection does not read or write `conversationId` URL state.
- `GET /api/conversations` now returns tenant-scoped `runningConversationIds` beside the summaries. The in-memory adapter projects only owned running turns; the PostgreSQL adapter maps one existing `listActiveAssistantTurns` query rather than polling each conversation. The widget accepts only running ids that also name a validated catalog row.
- Both transports compose one `SideChatPanelView`, but the slice incorrectly made navigation depend on the selected session's busy state. The approved behavior keeps navigation available and scopes duplicate-send protection to the running conversation.
- Workflow Refresh invalidates the exported workflow query prefix, but the slice incorrectly remounted the selected `useChat`. The replacement keeps live session ownership outside the selected React subtree. Every newer coherent snapshot disposes the current epoch, folds `SnapshotLoaded`, and opens one fresh epoch when the snapshot still reports an active run.
- The two-tab fixture opened its watcher after running state already existed and read a catalog snapshot. It did not prove that an already-open tab receives new lifecycle activity, so that evidence is invalid for multi-tab parity.

Those historical test counts prove only the superseded implementation. New completion evidence must cover stable session ownership, already-open-tab activity, non-blocking navigation, and refresh/close recovery.

Still open in Step 16: retry exhaustion/manual reconnect presentation, simultaneous-send busy conflict, idle network loss, terminal-while-offline discovery, and the remaining dedicated refresh/drop cases. This slice does not close the step.

## Completion checklist

- [x] Idle mount and idle refresh render New chat without a history 404 or implicit existing-chat selection.
- [x] An accepted draft turn records a tab-scoped recovery cursor before stream completion; mid-turn refresh reattaches, and terminal completion clears the cursor.
- [ ] Failed, timed-out, and cancelled turns persist already-visible text/reasoning plus browser-safe terminal metadata; blocked output remains absent.
- [x] Conversation selection is independent of the URL; no widget or harness callback mutates `conversationId` query state.
- [ ] Transport-drop presentation keeps the typed 4xx/retry boundary and manual reconnect behavior.
- [ ] The conversation catalog plus subject-scoped activity stream expose real running ids without disabling New chat or conversation switching.
- [ ] Dedicated browser cases prove empty-store refresh, idle refresh with existing chats, mid-turn refresh, switch/close/reopen continuity, and an already-open two-tab running-conversation flow.
- [ ] Old recovery ladder remains consumer-free on the native path and the replacement cursor has focused lifecycle tests.

## Handoff record

Recovery/discovery wiring: the selection/cursor correction remains useful, but selected-component stream ownership and the catalog-only two-tab proof are rejected. Restore the approved session-store and activity-stream semantics before closing this step.

Classification table (retryable vs fatal): retain the current typed HTTP versus status-less transport boundary and reverify it after the selection rewrite.

Multi-tab evidence: the replacement case must keep both tabs open before the turn starts, observe a live activity transition, then prove explicit watcher selection, replay, Refresh, and terminal convergence. Simultaneous-send conflict remains open.
