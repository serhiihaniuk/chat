# ADR 0006: Use AI SDK 7 as the Application Core

Status: accepted 2026-07-11; implemented and rebaselined 2026-07-16

## Context

AI SDK 7 owns the agent loop, typed UI messages, tool lifecycle, approval
vocabulary, stream protocol, timeout and abort inputs, client transport, and
provider abstraction. Recreating those concepts behind Side Chat-specific
runtime events and ports would duplicate the system that must be maintained and
force every SDK capability through a second vocabulary.

## Decision

- `UIMessage`, `UIMessageChunk`, tools, approval parts, agents, and transports
  keep their SDK names and shapes at the service/widget boundary.
- Provider instances and agent construction remain server-only. Provider SDKs
  never enter browser packages.
- The service and widget may use browser-safe `ai` UI types. They do not share
  provider DTOs, database records, or Workflow internals.
- Provider replacement remains supported through service-local configuration
  and model construction. Replacing AI SDK itself is not an architecture
  promise.
- Side Chat uses plain TypeScript, schema validation, async iteration, and
  `AbortSignal`; it does not maintain a parallel effect-system abstraction.
- Exact dependency pins and permanent compatibility tests make upgrades
  deliberate architecture events.

AI SDK does not own product policy. Side Chat still owns authentication,
workspace authorization, conversation records, tool exposure and approval,
safe error scrubbing, admission, shutdown, telemetry, widget behavior, and host
integration.

## Alternatives rejected

- **Wrap AI SDK behind a second event/runtime contract:** duplicates SDK
  concepts and creates mapping drift.
- **Keep the deleted server architecture as a fallback:** creates two systems
  whose lifecycle and security behavior must remain equivalent.
- **Adopt a Python sidecar or another agent framework:** adds a runtime boundary
  without improving the native TypeScript UI-message path.
- **Expose provider types to the widget:** leaks server-only details and couples
  browser releases to provider internals.

## Consequences

The repository accepts real coupling to AI SDK's public UI protocol. Exact pins,
source-aware upgrade review, contract tests, and browser E2E mitigate that
coupling; they do not pretend it is absent. Side Chat keeps only the narrow
profile and product boundaries that the SDK cannot own.
