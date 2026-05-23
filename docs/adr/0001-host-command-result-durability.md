# ADR 0001: Host Command Result Durability

## Status

Accepted for day-one production scaffold.

## Context

The production design includes `sidechat.host_command_results` in the day-one DB schema contract so the persistence model can represent commands emitted to an external host and the host's result. The same design keeps backend durable host-command product behavior open: no service route, protocol behavior, widget assumption, or state-changing backend command workflow should appear before an explicit decision.

This creates an intentional split:

- `packages/db` may own schema and repository contract support for `host_command_results`.
- Browser/widget host-command handling may remain local to the host bridge and widget state.
- Backend service composition must not infer that host command results are accepted as a durable product workflow merely because the DB schema can represent them.

## Decision

Day-one host command results are client/local-harness only.

The accepted product behavior is:

- The widget dispatches `sidechat.host_command` events through `packages/host-bridge`.
- The host bridge returns local command results to widget state for display, testing, and harness smoke flows.
- `packages/db` keeps `host_command_results` schema and repository contract support as an executable schema contract.
- `apps/partner-ai-service` does not expose a host-command result route.
- `chat-protocol` does not add a host-command result event or request shape.
- Service persistence composition must not write host command results as part of the chat stream on day one.

## Consequences

This keeps day-one command execution non-state-changing from the side-chat backend's perspective. External hosts can decide what a command means locally, and side-chat can show a local result without claiming durable backend acknowledgement.

The cost is that backend analytics and audit trails cannot yet answer whether a specific host command was applied. That is accepted until a later product story explicitly introduces either a host-command result route, a protocol result event, or another durability mechanism.

## Rejected Options

### Product Route

Rejected for day one. A `POST /host-command-results` style route would require auth, replay/idempotency, failure mapping, and UX semantics that are not yet specified.

### Follow-Up Protocol Event

Rejected for day one. Adding a browser-to-service protocol event would expand the stable protocol before the result semantics are proven.

### Implicit Persistence During Chat Stream

Rejected for day one. Persisting host command results inside the chat stream would couple host-side effects to backend stream handling and blur the boundary between local host behavior and product-owned state.

## Guardrails

- No service route for host command results may merge without a new accepted ADR or an update to this ADR.
- No widget code may assume a local host command result was durably applied by the backend.
- No partner-ai-core use case may require host command result persistence to complete a chat turn.
- `packages/db` support remains schema/repository contract support only until a later decision changes product behavior.
