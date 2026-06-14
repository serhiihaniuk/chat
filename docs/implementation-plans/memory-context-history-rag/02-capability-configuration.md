# 2. Capability Configuration

## Goal

Add typed service configuration for memory, RAG, research, conversation-history
context, and context budgets. Concrete adapters added in later phases should be
enabled through config, not ad hoc composition overrides.

## Why Second

Configuration is the control plane for later work. Without it, real adapters can
exist in code while the launched app still has no ordinary way to enable them.

## Ownership

| Concern                          | Owner                                                            |
| -------------------------------- | ---------------------------------------------------------------- |
| Config parsing and validation    | `apps/partner-ai-service/src/config/service-config.ts`           |
| Composition wiring               | `apps/partner-ai-service/src/composition/service-composition.ts` |
| Capability manifest construction | `apps/partner-ai-service/src/composition/manifest/**`            |
| Adapter selection                | `apps/partner-ai-service/src/adapters/**`                        |

HTTP routes should not decide policy or capability behavior. They receive the
already-composed service.

## Configuration Shape

Add explicit sections. Suggested environment keys:

```txt
SIDECHAT_PROFILE_ENV=local|production

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

SIDECHAT_CONTEXT_ADMISSION_POLICY=deterministic_v1
SIDECHAT_CONTEXT_MAX_INPUT_TOKENS=24000
SIDECHAT_CONTEXT_RESERVED_OUTPUT_TOKENS=4000
SIDECHAT_CONTEXT_MAX_HISTORY_TOKENS=4000
SIDECHAT_CONTEXT_MAX_MEMORY_TOKENS=2000
SIDECHAT_CONTEXT_MAX_RAG_TOKENS=8000
SIDECHAT_CONTEXT_MAX_RESEARCH_TOKENS=4000
```

Exact names can change to match local config style, but the concepts should stay
explicit. Avoid config where `enabled=true` silently selects a no-op adapter.

## Implementation Steps

1. Parse and validate typed config.
2. Reject production-like configs with partially enabled capabilities.
3. Wire config into concrete adapter selection.
4. Build manifest declarations from configured capabilities and sources.
5. Feed configured status into phase 1 diagnostics.
6. Document explicit local defaults and one configured test path.
7. Keep no-op adapters available only when config explicitly requests disabled
   or no-op behavior.

## Tests

```txt
[ ] default config is explicit about disabled/no-op states
[ ] memory enabled without backend is rejected in production-like config
[ ] RAG enabled without sources is rejected in production-like config
[ ] research enabled without agent is rejected in production-like config
[ ] history and context budget settings parse from config
[ ] service composition wires configured adapters from config
```

## Exit Criteria

```txt
[ ] The launched app can enable concrete memory through config.
[ ] The launched app can register retrieval sources through config.
[ ] The launched app can enable a concrete research agent through config.
[ ] History window and context budget settings are config-driven.
[ ] Diagnostics reflect configured capability state without leaking secrets.
```
