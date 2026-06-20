# Extension Seams

Read this when: an adopting team needs to add a tool, guard, executor, host
command, policy rule, or observability sink.
Source of truth for: first files and contracts for extension work.
Not source of truth for: lifecycle order, package ownership, or provider adapter
internals.

## Capability Rule

Declaration, implementation, and exposure are separate:

```txt
host capability manifest
-> turn policy decision
-> executable registry or host bridge
```

A manifest entry is not model access. Runtime exposes only selected backend
RuntimeTools that also have executable registrations. Host commands remain
browser/host-app interactions unless the service separately implements a backend
tool.

The service binds declaration and execution in one `ServiceToolRegistration`.
`apps/partner-ai-service` composition runs registrations through
`createServiceToolRegistry`, which feeds the manifest its capabilities and feeds
agent runtime the matching executables from the same source. A tool therefore
cannot reach the capability manifest without supplying the `RuntimeTool` behind
it. Providers follow the same shape: `createServiceProviderRegistry` validates
provider/model registrations and selects the runtime identity.

Service diagnostics report this separation explicitly. `apps/partner-ai-service`
composition owns capability status for history context, context admission, and
persistence, plus secret-free provider and tool registry status, and `/healthz`
plus `/readyz` expose only safe status fields.

Context admission status reports both the configured policy id and the actual
selection mode. `deterministic_v1` with `budgeted` means budgets are enforced
before optional context reaches runtime, and dropped candidates are recorded in
the manifest with safe reasons.

Portable capability configuration contracts live in
`packages/partner-ai-core/src/domain/capabilities/contracts/capability-configuration.ts`.
`apps/partner-ai-service` parses `SIDECHAT_*` values for history and context
admission before mapping those settings into core configuration and ports.

## Backend Runtime Tool

- What it is: model-callable backend work such as search, lookup, or mutation.
- Runs: during runtime execution after turn policy selects the tool name.
- Receives/returns: AI/tool input becomes `RuntimeTool.execute` input; output is
  JSON-safe runtime activity data or a runtime tool error.
- Implementation: tool in `apps/partner-ai-service/src/adapters/tools/`, exposed
  as a `ServiceToolRegistration` through `createServiceToolRegistration`.
- Contract: `packages/agent-runtime/src/tools/runtime-tool.ts`,
  `packages/partner-ai-core/src/domain/capabilities/contracts/capabilities.ts`,
  and `apps/partner-ai-service/src/composition/tools/service-tool-registry.ts`.
- Common mistake: writing a capability and an executable as two independent
  values instead of one registration, so the manifest and runtime drift apart.

## Host Command

- What it is: browser/host-app UI work such as opening a panel or inserting
  text.
- Runs: through the widget and host bridge, not as a backend runtime tool.
- Receives/returns: host command payloads and browser-safe command results.
- Implementation: `packages/host-bridge/src/` and service declaration helpers in
  `apps/partner-ai-service/src/adapters/host-commands/`.
- Contract: `packages/host-bridge/src/commands/capability.ts`.
- Common mistake: placing host UI commands under runtime tool adapters.

## Turn Guard

- What it is: prompt/security check selected by the turn profile.
- Runs: before conversation persistence, private context, or runtime tools.
- Receives/returns: minimal turn/profile input and allow, warn, or block.
- Implementation: `apps/partner-ai-service/src/adapters/guards/`.
- Contract: `packages/partner-ai-core/src/ports/guards/turn-guard.ts`.
- Common mistake: registering a guard and assuming it runs without selecting its
  id in profile safety policy.

## Agent Executor

- What it is: runtime execution engine for one prepared assistant turn.
- Runs: after `sidechat.started`, selected by profile/turn policy.
- Receives/returns: `AgentExecutionRequest`; emits RuntimeEvents.
- Implementation: `packages/agent-runtime/src/runtime/executors/`.
- Contract: `packages/agent-runtime/src/runtime/executors/agent-executor.ts`.
- Common mistake: exposing executor ids as browser or manifest capabilities.

## Auxiliary Model Job

- What it is: small model-only internal work such as conversation title
  generation, classifiers, routing decisions, or security checks.
- Runs: only when the owning product workflow invokes it; title generation runs
  after successful first-turn completion.
- Receives/returns: a minimal runtime request and RuntimeEvents through
  `createBasicRuntimeAgent`; no tools, host command scope, or previous history
  unless the owning workflow deliberately admits them.
- Implementation: lifecycle and admitted inputs in `packages/partner-ai-core`;
  prompt/config defaults in `apps/partner-ai-service`; reusable constructor in
  `packages/agent-runtime/src/runtime/basic-agent/`.
- Contract: `packages/agent-runtime/src/runtime/basic-agent/basic-runtime-agent.ts`
  plus the core port that enables the specific job.
- Common mistake: building a route-local or persistence-local hidden model agent
  that owns prompt text, lifecycle timing, sanitization, and runtime request
  shaping all at once.

## Policy Resolver

- What it is: per-turn selection of profile, model, tools, host commands,
  guards, approvals, executor id, and instructions.
- Runs: before turn guards and before any private context or persistence.
- Receives/returns: authorized input plus manifest/profile data; returns a turn
  policy decision.
- Implementation: `packages/partner-ai-core/src/application/stream-chat/turn/turn-policy-plan.ts`.
- Contract: `packages/partner-ai-core/src/domain/capabilities/turn-policy/`.
- Common mistake: moving policy decisions into runtime or route handlers.

## Observability Adapter

- What it is: sink for redacted lifecycle records.
- Runs: around stream-chat lifecycle stages.
- Receives/returns: already-redacted observability records; should not affect
  product behavior.
- Implementation: `apps/partner-ai-service/src/adapters/observability/`.
- Contract: `packages/partner-ai-core/src/services/observability.ts`.
- Common mistake: logging raw prompts, provider output, or tool payloads before a
  policy authorizes that diagnostic path.

## Service Adapter Index

Start with `apps/partner-ai-service/src/adapters/README.md` for folder placement.
Then open the package contract named by the seam above.
