# 01 — Capability Status and Config Foundation

## Goal

Make current behavior explicit before adding more capability code.

The default running service currently falls back to no-op memory, no-op RAG, and no-op research. No-op adapters are useful for local bootstrap and tests, but dangerous when the app appears to have these capabilities enabled.

This phase should make capability status visible, configurable, and fail-closed in production-like config.

## Target behavior

```txt
Local/dev config may explicitly run with disabled/no-op memory/RAG/research.
Production-like config must not silently fall back to no-op when a capability is enabled.
Health/diagnostics must say which capabilities are enabled, disabled, no-op, or misconfigured.
Docs must distinguish "extension seam exists" from "concrete implementation enabled".
```

## Add a capability status model

Create a small status shape used by service composition and diagnostics.

Suggested shape:

```ts
export type ServiceCapabilityStatus = {
  readonly memory: CapabilityStatus;
  readonly rag: CapabilityStatus;
  readonly research: CapabilityStatus;
  readonly history: CapabilityStatus;
  readonly contextAdmission: CapabilityStatus;
};

export type CapabilityStatus = {
  readonly capability: string;
  readonly state: "enabled" | "disabled" | "noop" | "misconfigured";
  readonly adapterId?: string;
  readonly reason?: string;
  readonly safeForProduction: boolean;
};
```

Keep this boring. The purpose is not a framework registry. The purpose is for humans, agents, tests, and health endpoints to see what is actually running.

## Add service config fields

Extend `apps/partner-ai-service/src/config/service-config.ts` with explicit groups.

Suggested fields:

```txt
SIDECHAT_MEMORY_MODE=disabled|noop|postgres|external
SIDECHAT_MEMORY_AUTO_WRITE=disabled|propose_only|auto_apply
SIDECHAT_MEMORY_DEFAULT_SCOPE=conversation|workspace|user

SIDECHAT_RAG_MODE=disabled|noop|static|http|external
SIDECHAT_RAG_SOURCES=source-a,source-b
SIDECHAT_RAG_FAILURE_MODE=degrade|fail_turn

SIDECHAT_RESEARCH_MODE=disabled|noop|external|langgraph
SIDECHAT_RESEARCH_FAILURE_MODE=degrade|fail_turn

SIDECHAT_HISTORY_MODE=disabled|recent_messages|recent_plus_summary
SIDECHAT_HISTORY_MAX_MESSAGES=12
SIDECHAT_HISTORY_MAX_TOKENS=4000

SIDECHAT_CONTEXT_MAX_INPUT_TOKENS=24000
SIDECHAT_CONTEXT_RESERVED_OUTPUT_TOKENS=4000
SIDECHAT_CONTEXT_ADMISSION_POLICY=deterministic_v1

SIDECHAT_PROFILE_ENV=local|production
```

Exact names can change, but the concepts should be explicit.

## Wire status in composition

Target files:

```txt
apps/partner-ai-service/src/config/service-config.ts
apps/partner-ai-service/src/composition/service-composition.ts
apps/partner-ai-service/src/composition/service-ports.ts
apps/partner-ai-service/src/composition/manifest/service-capability-manifest.ts
apps/partner-ai-service/src/inbound/http/app.ts
```

Implementation tasks:

```txt
[ ] Parse the new config fields with explicit defaults.
[ ] Build memory/RAG/research adapters from config.
[ ] Return no-op adapters only when config explicitly asks for disabled/noop behavior.
[ ] Add a status object to service composition output.
[ ] Add health/diagnostics output that includes capability status without secrets.
[ ] Add production validation: enabled capability + no concrete adapter = fail startup.
[ ] Add local validation: noop is allowed only if status says noop/disabled.
```

## Diagnostics endpoint

If there is an existing health endpoint, extend it. If not, add a small diagnostics endpoint, but keep it safe.

Example response:

```json
{
  "service": "side-chat",
  "capabilities": {
    "history": {
      "state": "enabled",
      "adapterId": "postgres-conversation-repository",
      "safeForProduction": true
    },
    "memory": {
      "state": "noop",
      "adapterId": "noop-memory-port",
      "reason": "SIDECHAT_MEMORY_MODE=noop",
      "safeForProduction": false
    },
    "rag": {
      "state": "disabled",
      "reason": "SIDECHAT_RAG_MODE=disabled",
      "safeForProduction": true
    },
    "research": {
      "state": "disabled",
      "reason": "SIDECHAT_RESEARCH_MODE=disabled",
      "safeForProduction": true
    },
    "contextAdmission": {
      "state": "enabled",
      "adapterId": "deterministic-v1",
      "safeForProduction": true
    }
  }
}
```

Do not include API keys, database URLs, source credentials, user data, or retrieved content.

## Tests to add

```txt
[ ] Default local config reports memory/RAG/research disabled or noop explicitly.
[ ] Production-like config rejects SIDECHAT_MEMORY_MODE=postgres without required backing store.
[ ] Production-like config rejects SIDECHAT_RAG_MODE=http without source config.
[ ] Production-like config rejects SIDECHAT_RESEARCH_MODE=external without concrete adapter config.
[ ] Health/diagnostics reports capability status without secrets.
[ ] Service composition does not silently create no-op adapters for enabled capabilities.
```

## Docs to update

```txt
apps/partner-ai-service/README.md
apps/partner-ai-service/src/adapters/README.md
docs/architecture/extension-seams.md
docs/operations/verification.md
```

Docs must say:

```txt
Seam exists != feature enabled.
Default local behavior may be disabled/no-op.
Production-like config fails closed for enabled but unwired capabilities.
```

## Acceptance criteria

```txt
[ ] Service status exposes memory/RAG/research/history/context-admission state.
[ ] No-op fallbacks are explicit, never invisible.
[ ] Production-like config fails if enabled memory/RAG/research has no concrete adapter.
[ ] Docs list default capabilities honestly.
[ ] Tests fail if enabled production-like config silently uses no-op memory/RAG/research.
```
