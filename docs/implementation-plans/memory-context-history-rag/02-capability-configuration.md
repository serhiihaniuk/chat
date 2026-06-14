# 2. Capability Configuration

## Goal

Add a deployable service configuration path around the portable capability
configuration contracts owned by `partner-ai-core`. Concrete adapters added in
later phases should be selected through service config, not ad hoc composition
overrides.

## Why Second

Configuration is the control plane for later work. Without it, real adapters can
exist in code while the launched app still has no ordinary way to enable them.

## Ownership

| Concern                              | Owner                                                                                    |
| ------------------------------------ | ---------------------------------------------------------------------------------------- |
| Portable capability config contracts | `packages/partner-ai-core/src/domain/capabilities/contracts/capability-configuration.ts` |
| Host capability manifest contracts   | `packages/partner-ai-core/src/domain/capabilities/contracts/capabilities.ts`             |
| Env parsing and validation           | `apps/partner-ai-service/src/config/service-config.ts`                                   |
| Service deployable modes             | `apps/partner-ai-service/src/composition/capabilities/**`                                |
| Composition and adapter selection    | `apps/partner-ai-service/src/composition/service-composition.ts` and `src/adapters/**`   |
| Service manifest construction        | `apps/partner-ai-service/src/composition/manifest/**`                                    |

HTTP routes should not decide policy or capability behavior. They receive the
already-composed service.

## Configuration Shape

Add explicit sections. Suggested service environment keys:

```txt
SIDECHAT_PROFILE=development|production

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

Keep the ownership split sharp:

```txt
partner-ai-core:
  CapabilityConfig, MemoryCapabilityConfig, RagCapabilityConfig,
  ResearchCapabilityConfig, HistoryContextConfig, ContextAdmissionConfig,
  HostCapabilityManifest, policy-facing manifest declarations

partner-ai-service:
  SIDECHAT_* parsing, deployable mode fields such as noop/postgres/http/external,
  concrete adapter selection, service composition, and diagnostics
```

## Implementation Steps

1. Define or reuse the portable `partner-ai-core` capability config contract.
2. Parse and validate service env into a service config that extends the core
   contract only with deployable adapter modes.
3. Reject production-like configs with partially enabled capabilities.
4. Wire service modes into concrete adapter selection.
5. Build core manifest declarations from configured capabilities and sources.
6. Feed configured status into phase 1 diagnostics.
7. Document explicit local defaults and one configured test path.
8. Keep no-op adapters available only when config explicitly requests disabled
   or no-op behavior.

## Tests

```txt
[ ] default config is explicit about disabled/no-op states
[ ] concrete memory mode without backend is rejected by composition
[ ] RAG enabled without sources is rejected by env parsing
[ ] concrete RAG mode without retriever is rejected by composition
[ ] concrete research mode without agent is rejected by composition
[ ] history and context budget settings parse from config
[ ] service composition wires configured adapters from config
```

## Exit Criteria

```txt
[ ] Core exports the portable capability config/contracts used by the service.
[ ] Service env parsing maps into those core contracts plus service-only modes.
[ ] Concrete memory/RAG/research modes fail before boot unless matching adapters are provided.
[ ] The launched app can register retrieval source declarations through config.
[ ] History window and context budget settings are config-driven.
[ ] Diagnostics reflect configured capability state without leaking secrets.
```
