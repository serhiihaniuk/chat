# Capability Configuration Plan

## 1. Goal

Add ordinary service configuration for memory, RAG, research, history admission,
and context budgets so concrete adapters can be enabled deliberately in local,
test, and production-like deployments.

This plan covers audit gap `4.6`.

## 2. Current gap

The service config currently focuses on provider, auth, database, policy mode,
profile, dev tools, and workspace ids. It does not expose a normal path to
enable:

```txt
memory backend and policy
RAG sources and retriever backend
research agent
history window size
context budget
capability status diagnostics
```

As a result, even real adapters would be hard to enable without direct
composition overrides.

## 3. Ownership

| Concern               | Owner                                                            |
| --------------------- | ---------------------------------------------------------------- |
| Env/config parsing    | `apps/partner-ai-service/src/config/service-config.ts`           |
| Config tests          | `apps/partner-ai-service/src/config/service-config.test.ts`      |
| Adapter wiring        | `apps/partner-ai-service/src/composition/service-composition.ts` |
| Manifest construction | `apps/partner-ai-service/src/composition/manifest/**`            |
| Health/diagnostics    | `apps/partner-ai-service/src/inbound/http/**`                    |

Configuration may select concrete adapters. It must not move turn policy or
context selection into HTTP routes.

## 4. Configuration model

Add explicit capability sections. Suggested shape:

```txt
memory:
  mode: disabled | noop | postgres | external
  defaultPolicy: disabled | read | read_write
  requireExplicitApproval: boolean

rag:
  mode: disabled | noop | postgres | external
  sources: source id list with backend mapping
  failurePolicy: fail | degrade

research:
  mode: disabled | noop | configured
  agentId: optional selected adapter id
  allowedSourceIds: source id list
  failurePolicy: fail | degrade

history:
  includeInModelContext: boolean
  maxRecentMessages: number
  maxTokens: number

contextBudget:
  admissionPolicyId: simple_include_all | budgeted_priority_v1
  maxInputTokens: number
  reservedOutputTokens: number
```

Use env names that make disabled/no-op/configured states obvious. Avoid config
where `true` silently means "use a no-op adapter."

## 5. Implementation sequence

1. Add typed config parsing.

   Keep parsing and validation in `service-config.ts` or a small package-local
   helper if the file becomes dense.

2. Validate production-like profiles.

   If a capability is enabled, required backend settings must be present.
   Production-like config should reject partial capability setup.

3. Wire config to adapters.

   `service-composition.ts` should select concrete adapters by config. Direct
   test overrides can still inject ports, but launched app behavior must come
   from config.

4. Build the capability manifest from config.

   Manifest declarations should reflect configured tools, retrieval sources,
   research agents, host commands, profiles, and policies.

5. Add diagnostics.

   Health or diagnostics should report:

   ```txt
   capability name
   disabled/noop/configured
   configured source count
   failure policy
   admission policy id
   ```

   Do not report secrets, connection strings, raw documents, memory content, or
   provider request payloads.

6. Update local examples.

   README examples should show explicit disabled defaults and one configured
   local/test path.

## 6. Tests

Required scenarios:

```txt
[ ] default local config reports capabilities disabled or noop explicitly
[ ] production-like memory enabled without backend is rejected
[ ] production-like RAG enabled without source is rejected
[ ] production-like research enabled without agent is rejected
[ ] context budget/history window parse from config
[ ] service composition wires configured adapters
[ ] diagnostics report capability status without secrets
```

Likely test files:

```txt
apps/partner-ai-service/src/config/service-config.test.ts
apps/partner-ai-service/src/composition/service-composition.test.ts
apps/partner-ai-service/src/inbound/http/app.test.ts
```

## 7. Documentation updates

Update:

```txt
README.md
apps/partner-ai-service/README.md
docs/operations/verification.md, only if new commands or lanes are added
side-chat-current-iteration-docs-and-architecture-fix-plan/07-acceptance-criteria.md
```

Docs must say which defaults are intentionally disabled and how to enable each
concrete capability.

## 8. Acceptance criteria

```txt
[ ] Service config can enable a concrete memory adapter.
[ ] Service config can register retrieval sources.
[ ] Service config can enable a concrete research agent.
[ ] Service config controls context budget/history window.
[ ] Health or diagnostics report capability status without leaking secrets.
[ ] Production profile rejects partially configured enabled capabilities.
```
