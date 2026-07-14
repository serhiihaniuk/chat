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
3. The service-accepted start of a draft turn promotes that draft to a persisted selection immediately. The browser retains only the narrow, tab-scoped recovery cursor needed to survive a refresh while that turn is active; terminal completion clears it. This cursor is not selected-chat persistence and never changes the URL.
4. A refresh with an active recovery cursor reattaches to that conversation. A refresh after the turn settles returns to New chat.
5. A second tab starts at New chat. The conversation catalog exposes real running state so the user can see and select a running conversation; selection then follows the same history + discovery path.

The earlier statement that the native path needed no browser recovery state was too broad. Per-conversation discovery cannot identify which of several conversations a refreshed tab owned. The replacement is one bounded active-turn cursor, not the legacy watchdog/backoff/polling ladder.

### Transport drops

`WorkflowChatTransport` owns retries (`maxConsecutiveErrors` from config). Our layer renders: reconnecting state (never terminal), then — only after the transport gives up — a calm connection-lost state with a manual retry that re-runs discovery+reconnect. Server 4xx (busy, policy, auth) remain immediate typed errors, not retried (classification test).

### Multi-tab

Each tab: own `useChat`, own reconnect; both receive the full stream. Sender tab and watcher tab render identically after replay. Cross-tab send conflict resolves via the server busy policy; the loser renders the busy error calmly.

## Edge cases (each a test)

1. refresh mid-turn → full answer reassembled (replay + live tail), zero duplicate bubbles;
2. refresh mid-approval → persisted `approval-requested` re-renders the card (Step 12/15 contract); deciding then works;
3. refresh mid-client-tool → Step 15's dedupe holds after reload;
4. transport drops N<max times then recovers → reconnecting shown, stream continues, no user-visible loss;
5. transport exhausts retries → calm connection-lost + manual retry works;
6. second tab opened mid-turn → opens at New chat, shows the running conversation, and catches up after selecting it; both tabs then converge to identical final state;
7. two tabs send simultaneously → one succeeds, one renders busy calmly;
8. network loss during idle (no active turn) → no reconnect storm; next send works;
9. discovery returns terminal (turn finished while offline) → history refetch shows the final message; no ghost pending bubble.

## Verification

```powershell
npm test -- packages/side-chat-widget
npm run typecheck
npm run lint:custom
rg -n "widget-run-marker|widget-transport-recovery" packages/side-chat-widget/src --glob '!**/model/**'
```

Browser evidence via the preview workflow: refresh mid-turn and a two-tab session, screenshots. Import-graph proof that the old recovery/reconnect modules have no consumer on the new path.

## Completion checklist

- [ ] Idle mount and idle refresh render New chat without a history 404 or implicit existing-chat selection.
- [ ] An accepted draft turn records a tab-scoped recovery cursor before stream completion; mid-turn refresh reattaches, and terminal completion clears the cursor.
- [ ] Conversation selection is independent of the URL; no widget or harness callback mutates `conversationId` query state.
- [ ] Transport-drop presentation keeps the typed 4xx/retry boundary and manual reconnect behavior.
- [ ] The conversation catalog exposes real running ids; New chat and conversation switching are disabled while the selected session is busy where the legacy shell disabled them.
- [ ] Dedicated browser cases prove empty-store refresh, idle refresh with existing chats, mid-turn refresh, and a real two-tab running-conversation flow.
- [ ] Old recovery ladder remains consumer-free on the native path and the replacement cursor has focused lifecycle tests.

## Handoff record

Recovery/discovery wiring: reopened 2026-07-14; current selection fallback and terminal-time draft commit are invalid.

Classification table (retryable vs fatal): retain the current typed HTTP versus status-less transport boundary and reverify it after the selection rewrite.

Multi-tab evidence: required; the earlier statement that a second tab was equivalent to cold load is not accepted evidence.
