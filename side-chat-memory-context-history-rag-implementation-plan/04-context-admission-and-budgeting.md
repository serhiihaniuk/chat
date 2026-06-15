# 04 — Context Admission and Budgeting

## Goal

Replace simple include-all context admission with a deterministic, explainable budget policy.

The audit says the current context candidate selection includes every gathered candidate, records estimated token use, uses hard-coded budgets, and does not trim or sort. That is acceptable only while there are no real data sources. Once history, memory, and RAG are real, include-all becomes unsafe prompt stuffing.

## Target behavior

```txt
Context candidates are gathered from host context, history, memory, RAG, research, and tool/context declarations.
A named admission policy decides which candidates fit.
The context manifest records included and dropped candidates.
High-priority safety/profile context cannot be displaced by low-priority RAG.
Budget values come from config/profile/policy, not hidden constants.
```

## Add an admission policy model

Suggested shape:

```ts
export type ContextAdmissionPolicy = {
  readonly policyId: "deterministic_v1";
  readonly maxInputTokens: number;
  readonly reservedOutputTokens: number;
  readonly maxHistoryTokens: number;
  readonly maxMemoryTokens: number;
  readonly maxRagTokens: number;
  readonly maxResearchTokens: number;
  readonly maxHostContextTokens: number;
};
```

Keep v1 simple. Avoid building a mini optimizer.

## Candidate priorities

Define priority categories explicitly.

Suggested order:

```txt
1. Required safety/profile/system context
2. Current host-app context explicitly attached to this request
3. Recent conversation history admitted by history policy
4. High-confidence memory relevant to the turn
5. High-scoring RAG candidates from allowed sources
6. Research summary/artifacts, if enabled
7. Lower-confidence/low-score context candidates
```

Exact order can change, but the order must be named, tested, and documented.

## Candidate metadata requirements

Every candidate should have enough metadata for admission and audit.

Suggested fields:

```ts
export type ContextCandidate = {
  readonly candidateId: string;
  readonly sourceType:
    | "host_context"
    | "history_message"
    | "history_summary"
    | "memory_record"
    | "rag_result"
    | "research_result"
    | "tool_context";
  readonly sourceId: string;
  readonly content: string;
  readonly estimatedTokens: number;
  readonly priority: number;
  readonly trustLevel: "system" | "host" | "retrieved" | "memory" | "model_generated";
  readonly redactionClass: "public" | "internal" | "confidential" | "secret";
  readonly provenance?: JsonObject;
};
```

If these fields already exist under different names, do not duplicate them. Align the existing shape.

## Selection result

```ts
export type ContextAdmissionResult = {
  readonly includedCandidates: readonly ContextCandidate[];
  readonly droppedCandidates: readonly DroppedContextCandidate[];
  readonly budget: ContextBudgetManifest;
};

export type DroppedContextCandidate = {
  readonly candidateId: string;
  readonly sourceType: ContextCandidate["sourceType"];
  readonly estimatedTokens: number;
  readonly reason:
    | "budget_exceeded"
    | "source_limit_exceeded"
    | "policy_disabled"
    | "redaction_blocked"
    | "duplicate";
};
```

## Implementation tasks

Target files:

```txt
apps/partner-ai-service/src/composition/context-manager/candidates/context-candidate-selection.ts
apps/partner-ai-service/src/composition/context-manager/candidates/context-candidate-creation.ts
apps/partner-ai-service/src/composition/context-manager/service-context-manager.ts
apps/partner-ai-service/src/config/service-config.ts
```

Tasks:

```txt
[ ] Move hard-coded token budgets into config/profile/policy.
[ ] Add deterministic sort/grouping by source type, priority, score/confidence, recency, and stable id.
[ ] Add per-source caps.
[ ] Add include/drop behavior under budget pressure.
[ ] Record dropped candidates and reasons in the context manifest.
[ ] Keep no-pressure behavior simple and readable.
[ ] Add guardrails so required system/safety/profile context cannot be displaced by low-priority candidates.
[ ] Add tests for no-pressure and pressure cases.
```

## Suggested v1 algorithm

```txt
1. Normalize all candidates with source type, priority, token estimate, and provenance.
2. Partition into required and optional candidates.
3. Include required candidates first. If required exceeds budget, fail the turn with explicit config/policy error.
4. Apply source-specific caps to optional candidates.
5. Sort optional candidates deterministically:
   priority desc, score/confidence desc, recency desc, candidateId asc.
6. Include while budget remains.
7. Drop the rest with manifest reasons.
8. Build context board only from included candidates.
```

Do not make this clever. The v1 value is transparency.

## Tests to add

```txt
[ ] No-pressure case includes all candidates.
[ ] Budget-pressure case drops lower-priority RAG before required/profile/host context.
[ ] Per-source cap drops extra candidates from the same source.
[ ] Dropped candidates appear in the manifest with stable reasons.
[ ] Disabled history/memory/RAG/research policies produce zero candidates from those sources.
[ ] Oversized single candidate is dropped or truncated according to explicit policy.
```

## Acceptance criteria

```txt
[ ] Admission policy has an explicit name and contract.
[ ] Token budget comes from profile/config, not a hidden constant.
[ ] Candidates can be dropped under budget pressure.
[ ] Dropped candidates are recorded in the manifest.
[ ] High-priority safety/profile context cannot be displaced by low-priority RAG.
[ ] Tests cover simple no-pressure and budget-pressure cases.
```
