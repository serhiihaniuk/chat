# 6. Budgeted Context Admission

## Goal

Replace simple include-all context admission with an explicit, deterministic
budgeted policy that can include, drop, and explain candidates from history,
host context, memory, RAG, research, and tool context.

## Why Sixth

History is now real and memory/RAG are next. Budgeted admission should land
before those broader data sources so they enter a bounded selector rather than
temporarily widening include-all prompt stuffing.

## Ownership

| Concern                        | Owner                                                                                               |
| ------------------------------ | --------------------------------------------------------------------------------------------------- |
| Portable admission config      | `packages/partner-ai-core/src/domain/capabilities/contracts/capability-configuration.ts`            |
| Service env/profile resolution | `apps/partner-ai-service/src/config/**` and service composition                                     |
| Candidate normalization        | `apps/partner-ai-service/src/composition/context-manager/candidates/**`                             |
| Candidate selection            | `apps/partner-ai-service/src/composition/context-manager/candidates/context-candidate-selection.ts` |
| Manifest explanation           | `apps/partner-ai-service/src/composition/context-manager/rendering/context-manifest.ts`             |

Runtime receives prepared context. It should not decide product authorization or
candidate admission.

## Admission Contract

Keep policy identity separate from selector behavior.

Current implemented behavior:

```txt
policyId: deterministic_v1
selectionMode: include_all
```

This means the service records the configured budgets but still includes every
gathered candidate. Phase 6 may switch `selectionMode` to `budgeted` only when
the context manager actually enforces caps and records dropped candidates.

`deterministic_v1` budgeted behavior should define:

```txt
max input tokens
reserved output tokens
per-source token caps
required candidate classes
priority ordering
stable tie-break ordering
oversized candidate behavior
dropped-candidate manifest reasons
```

## Candidate Priorities

Suggested order:

```txt
1. Required safety/profile/system context
2. Current host-app context explicitly attached to this request
3. Recent conversation history admitted by history policy
4. High-confidence memory relevant to the turn
5. High-scoring RAG candidates from allowed sources
6. Research summary/artifacts, if enabled
7. Lower-confidence or lower-score context candidates
```

Exact order can change, but it must be named, tested, and recorded in the
manifest.

## Candidate Metadata

Align with existing shapes where they exist. A candidate needs at least:

```txt
candidate id
source type
source id
content or safe reference
estimated tokens
priority
trust level
redaction class
provenance
required or optional flag
```

Drop records need candidate id, source type, estimated tokens, and a stable
reason such as `budget_exceeded`, `source_limit_exceeded`, `policy_disabled`,
`redaction_blocked`, or `duplicate`.

## Implementation Steps

1. Resolve context budget from the core `ContextAdmissionConfig` populated by
   service env/profile config.
2. Normalize candidates with source kind, priority, estimated tokens, redaction
   class, required flag, and stable tie-break key.
3. Partition required and optional candidates.
4. Include required candidates first. If required candidates exceed budget, fail
   before model execution with an explicit policy/config error.
5. Apply source-specific caps to optional candidates.
6. Sort optional candidates deterministically by priority, score/confidence,
   recency, then candidate id.
7. Include optional candidates while budget remains.
8. Drop or truncate oversized optional candidates according to policy.
9. Record included and dropped candidates in the manifest with safe reasons.
10. Change diagnostics from `selectionMode: include_all` to
    `selectionMode: budgeted` only after tests prove real trimming behavior.
11. If simple include-all remains available, keep it as an explicit local/dev
    selector behavior, not as a misleading budgeted policy.

## Tests

```txt
[ ] no-pressure case includes all optional candidates
[ ] budget pressure drops lower-priority candidates
[ ] stable tie-break ordering is deterministic
[ ] required safety/profile context cannot be displaced by RAG
[ ] source-specific caps are enforced
[ ] oversized optional candidate follows chosen policy
[ ] dropped candidates appear in manifest with reasons
[ ] disabled history/memory/RAG/research policies produce zero candidates from those sources
[ ] token budget comes from config/profile
```

## Exit Criteria

```txt
[ ] Admission policy has an explicit name and contract.
[ ] Diagnostics distinguish configured policy from actual selector behavior.
[ ] Token budget is not a hidden constant.
[ ] Candidates can be dropped under budget pressure.
[ ] Dropped candidates are recorded in the manifest.
[ ] High-priority context cannot be displaced by low-priority RAG or memory.
```
