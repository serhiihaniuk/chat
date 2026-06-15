# 10 — Final Definition of Done

## Purpose

This file is the final acceptance gate for the Memory / Context / History / RAG implementation.

Do not mark the iteration complete until every implemented capability is proven through the default/configured app path, not only by injected fake seam tests.

## Global definition of done

```txt
[ ] Running the widget harness against a real model can maintain conversation continuity.
[ ] Running with Postgres enabled persists turns without insert errors.
[ ] Restarting the service does not lose persisted history.
[ ] A follow-up turn includes prior conversation context according to an explicit policy.
[ ] Memory can be enabled by config.
[ ] Enabled memory recalls and writes through a concrete adapter.
[ ] RAG can be enabled by config.
[ ] Enabled RAG retrieves from at least one concrete source.
[ ] Context admission is real budgeted selection, or explicitly documented simple include-all only if product owner accepts that temporary state.
[ ] Health/diagnostics reveal whether memory/RAG/research/history are enabled.
[ ] Tests fail if a production-like config silently falls back to no-op memory/RAG/research.
[ ] Docs distinguish extension seams from implemented capabilities.
```

## Per-capability final checks

### Capability status/config

```txt
[ ] Service config has explicit memory/RAG/research/history/context budget fields.
[ ] No-op adapters are explicit and unsafe for production-like enabled capabilities.
[ ] Diagnostics show enabled/disabled/noop/misconfigured state.
[ ] Secrets are not leaked in diagnostics.
```

### History

```txt
[ ] History policy exists.
[ ] Recent prior turns can be rendered as runtime messages.
[ ] Runtime request or context manifest shows admitted history.
[ ] Reset prevents previous turns from influencing future requests.
[ ] Cross-conversation/workspace history is blocked.
```

### Postgres persistence

```txt
[ ] Real service can run with SIDECHAT_DATABASE_URL enabled.
[ ] Conversation/user/assistant turns persist.
[ ] Terminal update persists.
[ ] History survives restart.
[ ] Context snapshots persist.
```

### Context admission

```txt
[ ] Admission policy is named.
[ ] Budget comes from config/profile/policy.
[ ] Candidates can be dropped.
[ ] Drop reasons are manifest-visible.
[ ] Required/safety/profile context is protected.
```

### Memory

```txt
[ ] Memory records have explicit scope.
[ ] Recall uses allowed scopes.
[ ] Write candidates can be proposed and persisted/applied according to policy.
[ ] Later turns can recall memory.
[ ] Memory write failures are observable without duplicate terminal events.
```

### RAG

```txt
[ ] RAG sources are registered in manifest when enabled.
[ ] Turn policy controls allowedSourceIds.
[ ] Retriever receives auth/workspace/request scope.
[ ] Retrieved candidates include provenance/trust/redaction/token metadata.
[ ] RAG context passes through admission before runtime.
```

### Research, if implemented

```txt
[ ] Research runs only when allowed by profile/policy.
[ ] Output becomes context candidates/artifacts.
[ ] Artifacts are persisted or explicitly ephemeral.
[ ] Failure behavior is explicit.
```

### Docs

```txt
[ ] Docs say what is implemented vs seam-only.
[ ] Service README has capability status table.
[ ] Verification docs say how to prove each capability.
[ ] No large wall-of-text status docs are added.
```

## Final review questions

The final reviewer should answer:

```txt
Can a new adopting team tell how to enable memory?
Can they tell how to enable RAG?
Can they tell whether research is implemented or only a seam?
Can they see why history is separate from memory?
Can they inspect a context manifest and understand why the model saw what it saw?
Can they deploy with Postgres and trust history survives restart?
Can production-like config accidentally run with no-op memory/RAG/research? It must not.
```

If any answer is unclear, the iteration is not done.
