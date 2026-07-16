# ADR 0004: Keep the Widget Isolated and Give It Conversation-State Authority

Status: accepted 2026-07-16 (rebaselined from the 2026-07-02 widget decision)

## Context

The widget runs inside host products with unrelated CSS, CSP, frameworks, and
release cycles. It must remain modifiable by ordinary React developers without
importing service, provider, Workflow-server, or database concepts. It also has
to reconcile durable snapshots with reconnectable native streams without
letting a disposable transport object become the visible-state authority.

## Decision

- The supported default is an iframe integration. Direct React mounting remains
  available for hosts that explicitly accept stylesheet and portal risk.
- `packages/side-chat-widget` is provider-free and server-free. It consumes only
  browser-safe native UI-message types, `stream-profile`, `host-bridge`, and
  neutral shared primitives.
- Feature-Sliced Design ranks and public barrels are enforced by repository
  gates. Business behavior does not enter quarantined copied UI components.
- TanStack Query owns durable reads such as conversation snapshots and catalogs.
  A widget-lifetime session reducer owns the visible conversation.
- Headless AI SDK/Workflow transport readers are disposable stream assemblers.
  Reconnect or replacement may discard a reader without discarding the visible
  session.
- Snapshot-then-changes reconciliation prevents missed activity between the
  authenticated snapshot and live subscription. Terminal history replaces the
  live projection atomically rather than through heuristic message merging.
- Styling uses widget-scoped tokens and the supported light themes. The iframe
  contains fonts, portals, reset styles, and Tailwind effects.

Host context and client tools cross through authenticated, origin-checked
bridge contracts. Host data is untrusted request context, never authorization.

## Alternatives rejected

- **Direct mount as the only integration:** host and widget styles can corrupt
  each other, and portal/font behavior becomes host-specific.
- **Provider or Workflow-server imports in the browser:** they leak private
  execution concepts and increase bundle and trust-boundary risk.
- **A transport object as conversation authority:** reader replacement during
  reconnect would erase or duplicate visible state.
- **TanStack Query as the live ordered-stream reducer:** cache semantics are not
  the same as monotonic part folding and terminal handoff.
- **Client-side snapshot merging:** heuristic merges create duplicate or
  reordered messages around terminal transitions.

## Consequences

Iframe adoption requires a proxy/embed recipe, and direct-mount adopters own
their style risk. The session/reconciliation boundary is load-bearing and must
remain covered by browser tests. [Widget and host integration](../architecture/widget-and-host-integration.md)
owns the current mechanics.
