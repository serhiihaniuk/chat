# ADR 0017: Native Conversation Reconciliation — Atomic Finalization and Snapshot-Then-Changes

Status: accepted 2026-07-14

## Context

The native Workflow widget originally rebuilt a selected conversation from two
independent reads: durable messages and active-turn discovery. It also treated a
successful HTTP connection to the cross-conversation activity stream as if the
subscriber had already received the server snapshot. Those assumptions created
real refresh races:

- a turn could become terminal before its assistant message was committed;
- messages could be read before that transition while active-turn discovery was
  read after it;
- an empty activity snapshot had no frame, so the browser had no synchronization
  barrier; and
- the library-owned `Chat` status reported `ready` while a hard-refresh
  reattachment was still being discovered, leaving the UI looking idle and blank.

The approved pre-v7 widget avoided the visible failure through three load-bearing
semantics: generation lived outside the selected React subtree, terminal history
was authoritative before the live run was released, and cold recovery rendered a
pending assistant immediately. The native Workflow journal gives us a stronger
replay source, but it does not remove those ownership and handoff requirements.

## Decision

Native conversation recovery is one synchronization protocol with two state
authorities and two subordinate mechanisms:

1. **The database owns durable conversation state.** Finalization commits the
   optional assistant message, terminal turn projection, usage, conversation
   timestamp, and identity-only activity notification in one transaction. A
   terminal turn is never externally visible before its admitted assistant
   history is visible. Before that transaction, the provider result supplies
   terminal status, finish reason, and usage while the closed Workflow journal
   supplies the visible text/reasoning projection. History therefore preserves
   exactly what the stream already showed, including completed reasoning that a
   provider final aggregate may omit.
2. **The widget-lifetime session owns the visible conversation.** One reducer per
   conversation owns the rendered timeline, active run identity, terminal state,
   and explicit lifecycle. React selection only observes that aggregate. Closing,
   switching, New chat, settings, and query refresh do not dispose a live session.
3. **The query cache carries coherent durable observations.** The widget bootstraps and
   refetches a selected persisted conversation through one snapshot resource that
   returns validated messages and its active turn from one consistent read. The
   cache never owns streamed deltas and never merges them into history.
4. **The native stream reader is disposable input.** One immutable attachment
   epoch opens `WorkflowChatTransport`, consumes it with `readUIMessageStream`,
   and dispatches progressive message projections into the session reducer. It
   owns no messages or lifecycle state, and the UI never subscribes to it.

Each successful selected-conversation read receives a client-local observation
identity. This makes an identical terminal payload a real handoff barrier instead
of relying on object identity. An observation that still names the current run is
not allowed to replace that run's live attachment or move its visible projection
backward: the reducer folds any durable message progress monotonically and keeps
the current epoch. A snapshot that proves the run is terminal, names a different
run, or follows a lost transport disposes the obsolete reader before the reducer
handoff and opens a fresh epoch only when the snapshot still reports an active
run. Late callbacks are rejected by epoch identity; no message setter or
terminal-suppression flag exists.

The subject activity stream follows **snapshot then changes**:

1. register the subscriber;
2. read the durable set of bound running turns;
3. emit exactly one `sidechat.turn-activity-sync` frame, including when the set is
   empty; then
4. emit queued and future `sidechat.turn-activity` transitions.

The sync frame is the browser's only connection barrier. It replaces the complete
running-id set and triggers catalog plus selected-snapshot reconciliation. A raw
HTTP connection is not synchronization. Running publication occurs only after a
Workflow `runId` is durably bound, so a running hint always has a resumable target.
Terminal publication occurs in the atomic finalization transaction, after every
publicly visible terminal field is complete.

Activity remains a bounded, identity-only invalidation channel, not content
storage. If the connection is lost or a bounded queue cannot preserve continuity,
the client reconnects and requires a fresh sync frame before considering the feed
current. Durable snapshots and Workflow replay remain the correctness sources.

The browser recovery cursor remains a narrow tab-local hint. It may choose the
conversation to recover after a hard refresh, but the service snapshot decides the
current run. A stale cursor is cleared without changing that persisted selection;
the terminal history remains visible for the recovery load. A separate optional
tab-local selection key may restore only the selected durable conversation id on
the next idle refresh. It stores no content or lifecycle, and New chat clears it.

## Alternatives rejected

- **Refetch selected history in `onConnected`.** The fetch promise may resolve
  before the server-side stream has registered, and it does not repair torn
  split message and active-turn reads. It closes one timing window while leaving the
  protocol undefined.
- **Poll every conversation.** This duplicates the subject activity feed, scales
  with sidebar size, and still needs a coherent selected snapshot.
- **Persist partial browser state in storage.** The Workflow journal and database
  already own replay and terminal truth. Browser content persistence would create
  a second merge problem and widen the privacy surface.
- **Hide the gap with a spinner only.** A pending shell is required feedback, but
  presentation cannot repair a lost terminal transition or incomplete history.

## Consequences

The database repository gains an aggregate finalization operation, the native
HTTP surface gains a selected-conversation snapshot, and the activity codec gains
one sync event. These are intentional contract changes before alpha. The native
split messages and active-turn HTTP reads are removed; `/state` is the only
selected-conversation recovery resource. Tests must force terminal-before-subscribe,
terminal-during-bootstrap, empty activity snapshots, refresh during reasoning,
terminal handoff, close/reopen, selection changes, and two already-open tabs.

Review rule: any future native recovery change must identify its authority before
its mechanism. Query invalidation may request reconciliation, and a native reader
may assemble stream projections; neither may become a second visible-conversation
state machine.
