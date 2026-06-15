# Side Chat Memory / Context / History / RAG Implementation Plan

This all-in-one file concatenates the phase files. Prefer giving agents only the core brief plus one phase file.

---

# 00 — Orchestrator Brief

## Purpose

This plan implements the missing pieces from the current Memory / Context / History / RAG gap audit.

The current state is not a broken architecture. The audit says the repo already has extension seams for memory, RAG, research, context boards, history persistence, and memory-write lifecycle hooks. The gap is that the default running app does not yet have concrete memory, concrete RAG, concrete research, or prior conversation history admitted back into model context.

This plan converts those gaps into implementation phases.

## Non-negotiable rules

1. Do not treat a seam as an implemented feature.
2. Do not hide no-op adapters in production-like config.
3. Do not solve conversation continuity through memory extraction.
4. Do not solve default RAG as a model-callable tool.
5. Do not let memory, RAG, DB, provider, or research internals leak into the widget.
6. Do not let browser protocol types become generic runtime/DB/shared primitives.
7. Keep the human-readability gate active: named stages, short helpers, local source/target comments, no clever expression chains.
8. The repo is early-stage. Prefer final-state implementation over compatibility shims.

## Canonical distinctions

```txt
History
  Prior turns in one conversation. Needed for normal chat continuity.

Memory
  Durable extracted knowledge, scoped to user/workspace/conversation.
  It is lossy by design and must not replace history.

RAG
  Authorized external/indexed knowledge retrieved before model execution.
  It belongs in prepared context by default, not as a model-called tool.

Research
  Optional pre-answer synthesis/gathering. More workflow-like than basic RAG.
  It should be added only when there is a real product need.

Context admission
  The policy that decides which history/memory/RAG/research/host context fits
  into the model input budget and why other candidates were dropped.
```

## Recommended implementation sequence

```txt
Phase 1: Capability status and config foundation
Phase 2: Conversation history in model context
Phase 3: Durable Postgres persistence path
Phase 4: Context admission and budgeting
Phase 5: Real memory implementation
Phase 6: Real RAG implementation
Phase 7: Research agent implementation, only if needed now
Phase 8: App-path tests and harnesses
Phase 9: Documentation and status sync
Phase 10: Final definition of done review
```

The phases can be split into smaller PRs, but the order should not be changed casually. In particular, do not build memory and RAG on top of silent no-op configuration, and do not claim memory/RAG/research are implemented before the default app can enable concrete adapters.

## Current high-level gap list

```txt
[ ] Default service status does not clearly expose no-op/disabled capabilities.
[ ] Service config cannot enable concrete memory/RAG/research/history budgets.
[ ] Conversation history is persisted/fetchable but not admitted to model context.
[ ] Postgres local path needs durable verification/fix.
[ ] Memory uses a no-op adapter by default.
[ ] RAG uses a no-op retriever by default.
[ ] Research uses a no-op agent by default.
[ ] Context admission is simple include-all, with hard-coded budget values.
[ ] Tests prove seams with fakes more than default app behavior.
[ ] Docs can still overstate intended architecture as implemented behavior.
```

## Definition of a useful implementation patch

Every worker patch should report:

```txt
1. Which missing capability was implemented or explicitly marked disabled.
2. Which files changed.
3. Which config keys or policies were added.
4. Which context manifest/runtime request fields prove the behavior.
5. Which app-path tests were added or updated.
6. Which docs/status notes were updated.
7. Any remaining explicit limitation.
```

## Scope reminders

Likely implementation files:

```txt
apps/partner-ai-service/src/composition/service-composition.ts
apps/partner-ai-service/src/composition/manifest/service-capability-manifest.ts
apps/partner-ai-service/src/composition/context-manager/service-context-manager.ts
apps/partner-ai-service/src/composition/context-manager/sources/context-source-gathering.ts
apps/partner-ai-service/src/composition/context-manager/candidates/context-candidate-creation.ts
apps/partner-ai-service/src/composition/context-manager/candidates/context-candidate-selection.ts
apps/partner-ai-service/src/composition/context-manager/rendering/runtime-message-rendering.ts
apps/partner-ai-service/src/config/service-config.ts
apps/partner-ai-service/src/adapters/memory/**
apps/partner-ai-service/src/adapters/rag/**
apps/partner-ai-service/src/adapters/agents/**
packages/db/src/schema-contract/repositories.ts
packages/db/src/repositories/postgres-drizzle/**
packages/db/src/repositories/memory/**
```

Likely tests:

```txt
apps/partner-ai-service/src/composition/context-manager/service-context-manager.test.ts
apps/partner-ai-service/src/inbound/http/app.persistence.test.ts
apps/partner-ai-service/src/config/service-config.test.ts
test-harness/adoption-harness/src/adoption-golden-path.test.ts
test-harness/widget-harness/e2e/persistent.spec.ts
test-harness/widget-harness/e2e/widget-harness.spec.ts
```

Likely docs:

```txt
docs/architecture/extension-seams.md
docs/architecture/assistant-turn.md
docs/product/requirements.md
docs/operations/verification.md
apps/partner-ai-service/README.md
apps/partner-ai-service/src/adapters/README.md
packages/partner-ai-core/src/application/stream-chat/README.md
```

---

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

---

# 02 — Conversation History in Model Context

## Goal

Make normal chat continuity work.

The audit says conversation and message persistence exist and history endpoints can fetch/reset history, but prior conversation turns are not admitted back into model context. The runtime currently receives only the current user message as a runtime message.

This is the most user-visible gap. A second turn in the same conversation should be able to use the first turn.

## Recommended design decision

Use a two-layer strategy:

```txt
MVP now:
  Render recent prior user/assistant turns as runtime messages.

Later, when needed:
  Render older history summaries as context-board candidates.
```

Why:

```txt
Recent chat continuity is best represented as messages.
Older long-running history needs summarization and budget control.
Memory must not be used as the only continuity path because memory extraction is lossy.
```

## Add history policy

Suggested type:

```ts
export type HistoryAdmissionPolicy = {
  readonly mode: "disabled" | "recent_messages" | "recent_plus_summary";
  readonly maxMessages: number;
  readonly maxEstimatedTokens: number;
  readonly includeAssistantMessages: boolean;
};
```

Source of policy:

```txt
service config default
profile/policy override
turn policy decision
context manager input
```

The policy should be visible in the prepared context snapshot or runtime request metadata.

## Retrieval flow

Target files:

```txt
apps/partner-ai-service/src/composition/context-manager/service-context-manager.ts
apps/partner-ai-service/src/composition/context-manager/sources/context-source-gathering.ts
apps/partner-ai-service/src/composition/context-manager/rendering/runtime-message-rendering.ts
packages/partner-ai-core/src/application/stream-chat/turn/prepare-stream-chat-turn.ts
packages/db/src/schema-contract/repositories.ts
packages/db/src/repositories/memory/records/conversations.ts
packages/db/src/repositories/postgres-drizzle/records/conversations.ts
```

Suggested staged flow:

```ts
const gatheredContext =
  yield *
  gatherContextSources({
    input,
    turnPlan,
    conversation,
    userMessage,
  });

const admittedHistory = admitConversationHistory({
  historyMessages: gatheredContext.historyMessages,
  policy: turnPlan.historyPolicy,
  budget: turnPlan.contextBudget,
});

const runtimeMessages = renderRuntimeMessages({
  admittedHistory,
  currentUserMessage: userMessage,
});
```

Keep the stages separate:

```txt
gather history records
filter by auth/conversation/workspace
admit under history policy
render admitted turns as runtime messages
record admission in manifest/snapshot
```

## Important invariants

```txt
[ ] Do not include the current user message twice.
[ ] Do not include turns from another conversation.
[ ] Do not include turns outside the authorized workspace/tenant.
[ ] Reset conversation prevents old turns from influencing future model calls.
[ ] History admission must be visible in a snapshot or manifest for debugging.
[ ] If history is disabled, the runtime request contains only the current turn messages.
```

## Runtime message shape

The model input should be ordered like this:

```txt
profile system message
trusted context board system message
admitted recent history messages
current user message
```

The context board should not duplicate the same recent messages unless the strategy explicitly uses context-board-only history.

## Manifest / snapshot additions

Add a lightweight section to the context manifest:

```ts
export type HistoryContextManifest = {
  readonly policyMode: "disabled" | "recent_messages" | "recent_plus_summary";
  readonly consideredMessageCount: number;
  readonly admittedMessageCount: number;
  readonly droppedMessageCount: number;
  readonly estimatedTokens: number;
};
```

No message content needs to be duplicated in diagnostics if that would leak data. The persisted context snapshot can include references or safe summaries depending on existing design.

## Tests to add

```txt
[ ] First turn persists user and assistant messages.
[ ] Second turn in same conversation includes first turn in runtime messages.
[ ] Disabled history policy sends only the current user message.
[ ] History max message limit drops older messages deterministically.
[ ] History token limit drops older/lower-priority messages deterministically.
[ ] Reset conversation prevents previous turns from entering a future runtime request.
[ ] Cross-conversation history is not admitted.
[ ] Cross-workspace/tenant history is not admitted.
[ ] Widget harness smoke proves a follow-up question can refer to the previous answer.
```

## Suggested acceptance scenario

```txt
Turn 1:
  User: "My project codename is Blue Lynx."
  Assistant: acknowledges.

Turn 2, same conversation:
  User: "What is my project codename?"
  Runtime request includes Turn 1 as admitted history.
  Model can answer "Blue Lynx" without memory/RAG.

After reset:
  User: "What is my project codename?"
  Runtime request does not include old turns.
```

This test should verify the runtime request or context manifest directly. A real-model harness can be added as smoke, but deterministic inspection is more reliable.

## Acceptance criteria

```txt
[ ] A second turn in the same conversation can see the first turn.
[ ] Reset conversation prevents old turns from influencing future answers.
[ ] History inclusion is visible in prepared context snapshot or runtime request.
[ ] History admission is token-budgeted.
[ ] History respects auth/workspace/subject/conversation boundaries.
[ ] History behavior is covered by service-level tests and widget harness smoke.
```

---

# 03 — Durable Postgres Persistence Path

## Goal

Make the real-model local app run with the real Postgres persistence path.

The audit says the real-model run successfully called OpenAI, but the Postgres insert path failed, so the service was run with `SIDECHAT_DATABASE_URL` cleared and fell back to in-memory repositories. That proves provider integration, not durable history or durable memory.

## Why this phase matters

History and memory should not be built on a persistence path that only works in process memory.

This phase does not need to implement memory yet. It must make durable conversation/message/context snapshot persistence trustworthy before memory write persistence depends on it.

## Target files

```txt
apps/partner-ai-service/src/config/service-config.ts
apps/partner-ai-service/src/composition/service-composition.ts
apps/partner-ai-service/src/inbound/http/app.persistence.test.ts
packages/db/src/schema-contract/repositories.ts
packages/db/src/repositories/postgres-drizzle/**
packages/db/src/repositories/memory/**
test-harness/widget-harness/e2e/persistent.spec.ts
```

## Implementation tasks

```txt
[ ] Reproduce and document the exact Postgres insert failure.
[ ] Identify whether the root cause is schema drift, migration mismatch, runtime defaults, nullability, enum mismatch, or timestamp/id generation.
[ ] Fix the schema/migration/repository mismatch in one final-state shape.
[ ] Remove any local workaround that clears SIDECHAT_DATABASE_URL to get the real-model harness running.
[ ] Ensure conversation creation, user message append, assistant turn creation, context snapshot persistence, terminal completion/failure, and history read all use the same Postgres repository path.
[ ] Ensure reset behavior is durable.
[ ] Add diagnostics that indicate the active persistence adapter.
```

## Persistence invariants

```txt
[ ] User turn insert and assistant turn insert are durable.
[ ] Assistant terminal update is durable.
[ ] Context snapshot persistence uses the same request/turn identifiers as runtime execution.
[ ] History endpoint returns persisted messages after service restart.
[ ] In-memory repositories remain available for local/dev tests, but production-like config does not silently fall back to them.
```

## Tests to add/update

```txt
[ ] Postgres-backed service can create a conversation and append user/assistant messages.
[ ] History endpoint returns persisted messages after restart or fresh service composition.
[ ] Reset conversation removes or hides previous messages from future history/context.
[ ] Context snapshot persistence works on the Postgres path.
[ ] A production-like config with database URL uses Postgres, not memory repositories.
```

If test environment setup is heavy, separate deterministic repository tests from one persistent harness smoke. But do not rely only on in-memory tests.

## Acceptance criteria

```txt
[ ] Real-model service can run with Postgres enabled.
[ ] User and assistant turns persist without insert errors.
[ ] History endpoint returns persisted messages after restart.
[ ] Context snapshot persistence works on the same path.
[ ] Diagnostics expose active persistence adapter without secrets.
```

---

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

---

# 05 — Real Memory Implementation

## Goal

Implement durable memory recall and write behavior through a concrete adapter.

The audit says the core has a `MemoryPort`, but the default running service falls back to `noop-memory-port`, so recall returns `[]`, write candidate proposal returns `[]`, and writes do nothing. The result is that no durable user/workspace/conversation knowledge is recalled or saved.

## Do not confuse memory with history

```txt
History = prior turns in one conversation.
Memory = durable extracted facts/preferences/summaries scoped to user, workspace, or conversation.
```

Memory extraction is lossy. Chat continuity must work through history even if memory is disabled.

## Memory scope model

Suggested scopes:

```txt
conversation
  Knowledge useful only inside one conversation.

workspace
  Knowledge useful across conversations inside one workspace/project.

user
  User preferences/facts that can follow the user across workspaces only if policy allows.
```

Each memory record must have explicit scope. No global memory by accident.

## Suggested memory record shape

```ts
export type MemoryRecord = {
  readonly memoryId: string;
  readonly scope: MemoryScope;
  readonly kind: "fact" | "preference" | "summary" | "instruction";
  readonly content: string;
  readonly confidence: number;
  readonly status: "active" | "superseded" | "deleted";
  readonly sourceConversationId?: string;
  readonly sourceMessageIds?: readonly string[];
  readonly provenance?: JsonObject;
  readonly createdAt: Date;
  readonly updatedAt: Date;
};

export type MemoryScope =
  | { readonly kind: "conversation"; readonly conversationId: string }
  | { readonly kind: "workspace"; readonly workspaceId: string }
  | { readonly kind: "user"; readonly userId: string };
```

Use existing ID/time/json primitives where possible.

## Suggested memory candidate shape

```ts
export type MemoryWriteCandidate = {
  readonly candidateId: string;
  readonly action: "create" | "update" | "delete";
  readonly scope: MemoryScope;
  readonly kind: MemoryRecord["kind"];
  readonly content: string;
  readonly confidence: number;
  readonly reason: string;
  readonly sourceConversationId: string;
  readonly sourceMessageIds: readonly string[];
  readonly status: "proposed" | "approved" | "rejected" | "applied";
};
```

If there is no approval UI yet, make auto-apply an explicit config/policy mode. Do not silently auto-write in all modes.

## Implementation layers

### 1. Repository/storage layer

Target files:

```txt
packages/db/src/schema-contract/repositories.ts
packages/db/src/repositories/memory/**
packages/db/src/repositories/postgres-drizzle/**
```

Tasks:

```txt
[ ] Add memory record storage contract.
[ ] Add memory write candidate storage if candidates are persisted separately.
[ ] Add Postgres schema/repository implementation.
[ ] Add in-memory repository implementation for tests/local.
[ ] Add query methods by scope, relevance input, status, and limits.
```

### 2. Adapter layer

Target files:

```txt
apps/partner-ai-service/src/adapters/memory/**
apps/partner-ai-service/src/composition/service-composition.ts
```

Tasks:

```txt
[ ] Implement a concrete MemoryPort backed by the repository.
[ ] Implement recall by explicit allowed scopes.
[ ] Implement proposeWriteCandidates.
[ ] Implement writeCandidates with dedupe/update behavior.
[ ] Return no-op only when config says memory is disabled/noop.
```

### 3. Core/context layer

Target files:

```txt
apps/partner-ai-service/src/composition/context-manager/sources/context-source-gathering.ts
apps/partner-ai-service/src/composition/context-manager/candidates/context-candidate-creation.ts
apps/partner-ai-service/src/composition/context-manager/service-context-manager.ts
packages/partner-ai-core/src/application/stream-chat/protocol/protocol-terminal-lifecycle.ts
```

Tasks:

```txt
[ ] Recall allowed memory during context preparation.
[ ] Convert recalled memory into context candidates.
[ ] Include memory candidates through context admission.
[ ] Record memory provenance in context manifest.
[ ] After successful answer, propose write candidates from final turn data.
[ ] Apply or persist candidates according to memory policy.
[ ] Observe memory write failures without creating a second terminal stream event.
```

## Memory extraction strategy

Start simple and explicit.

Recommended v1 options:

```txt
Mode: disabled
  No recall, no propose, no write.

Mode: propose_only
  Extract candidates and persist them as proposed; not recalled until approved/applied.

Mode: auto_apply
  Extract and write active memory immediately. Allowed only in explicit local/dev or accepted product mode.
```

Extraction can be:

```txt
Deterministic test extractor
  Used in tests to prove write/read lifecycle.

LLM-based extractor
  Optional adapter that reads final answer/transcript and proposes candidates.

Host-provided extractor
  Enterprise app provides memory candidates from its own logic.
```

Do not hide the extractor inside a broad `MemoryPort` if it becomes complex. If needed, introduce `MemoryExtractorPort`, but only if it reduces concept load.

## Dedupe/update rules

V1 can be simple:

```txt
same scope + same kind + normalized content => update timestamp/confidence/provenance
new content => create new active record
explicit delete candidate => mark deleted/superseded, do not hard-delete by default
```

If semantic dedupe is not implemented, say so explicitly in status/docs.

## Tests to add

```txt
[ ] Memory disabled: no recall, no propose, no write.
[ ] Memory enabled: first turn produces write candidates.
[ ] Auto-apply mode persists candidates.
[ ] Later turn recalls relevant active memory.
[ ] Recalled memory appears in context manifest.
[ ] Recalled memory appears in runtime context board.
[ ] Memory respects user/workspace/conversation scope.
[ ] Memory write failure is observable and does not create a second terminal event.
[ ] Memory persists across service restart when Postgres is enabled.
```

## Acceptance criteria

```txt
[ ] A first turn can produce memory write candidates.
[ ] Approved/applied candidates are persisted under explicit scope.
[ ] A later turn recalls relevant memory through MemoryPort.
[ ] Recalled memory appears in the prepared context manifest.
[ ] Recalled memory appears in the runtime context board.
[ ] Disabled memory policy recalls and writes nothing.
[ ] Memory write failures are observable and do not create a second terminal event.
```

---

# 06 — Real RAG Implementation

## Goal

Implement a concrete RAG retrieval path that can be enabled by config and admitted into model context.

The audit says the core has a `RagRetrieverPort`, but the default running service falls back to `noop-rag-retriever`, so no documents, embeddings, external search index, or knowledge source are queried.

## Default design rule

RAG should be pre-model prepared context by default.

Do not solve default RAG as a model-callable tool. A `search_documents` tool can exist later for iterative model-controlled search, but enterprise RAG should first be policy-controlled, authorized, and visible in the context manifest.

## Retrieval source registration

Add explicit source registration in the service capability manifest.

Suggested source shape:

```ts
export type RetrievalSourceManifest = {
  readonly sourceId: string;
  readonly displayName: string;
  readonly description: string;
  readonly adapterId: string;
  readonly defaultEnabled: boolean;
  readonly trustLevel: "host" | "retrieved" | "external";
  readonly redactionClass: "public" | "internal" | "confidential";
};
```

Profiles/policies should select allowed source IDs.

## RAG input/output contract

Suggested input:

```ts
export type RagRetrievalInput = {
  readonly requestId: string;
  readonly authContext: AuthContext;
  readonly workspace: WorkspaceRef;
  readonly userMessage: string;
  readonly hostContext: JsonObject | undefined;
  readonly allowedSourceIds: readonly string[];
  readonly maxCandidates: number;
  readonly abortSignal?: AbortSignal;
};
```

Suggested candidate:

```ts
export type RagContextCandidate = {
  readonly candidateId: string;
  readonly sourceId: string;
  readonly title: string;
  readonly content: string;
  readonly url?: string;
  readonly score: number;
  readonly estimatedTokens: number;
  readonly trustLevel: "retrieved" | "host" | "external";
  readonly redactionClass: "public" | "internal" | "confidential";
  readonly provenance: JsonObject;
};
```

Align with existing port names/types. Do not duplicate if equivalent types already exist.

## Initial concrete adapter choice

Pick one concrete adapter for the default app path.

Recommended pragmatic sequence:

```txt
1. File/static source retriever for local/dev/adoption harness.
   Purpose: prove config, manifest, retrieval, provenance, context admission, and tests.
   It is a reference adapter, not a demo app and not the enterprise production retriever.

2. HTTP/external retriever adapter.
   Purpose: let adopting teams connect enterprise search/vector/RAG services.
```

Avoid implementing a full embedding pipeline unless that is the current product need. The important near-term gap is that the app has no concrete retrieval path at all.

## Implementation tasks

Target files:

```txt
apps/partner-ai-service/src/config/service-config.ts
apps/partner-ai-service/src/composition/manifest/service-capability-manifest.ts
apps/partner-ai-service/src/composition/service-composition.ts
apps/partner-ai-service/src/adapters/rag/**
apps/partner-ai-service/src/composition/context-manager/sources/context-source-gathering.ts
apps/partner-ai-service/src/composition/context-manager/candidates/context-candidate-creation.ts
apps/partner-ai-service/src/composition/context-manager/service-context-manager.ts
```

Tasks:

```txt
[ ] Add RAG source config fields.
[ ] Add source registration to service capability manifest.
[ ] Enforce allowedSourceIds from turn policy.
[ ] Implement at least one non-noop retriever adapter.
[ ] Pass auth/workspace/request/host context into the retriever.
[ ] Map retrieved results into context candidates with provenance/trust/redaction/token metadata.
[ ] Add failure mode config: degrade vs fail_turn.
[ ] Add tests for enabled, disabled, empty, unauthorized source, and failure behavior.
```

## Authorization rules

```txt
[ ] Retriever receives only allowed source IDs.
[ ] Retriever receives auth/workspace scope and must not search outside it.
[ ] If requested/manifest source is not allowed by policy, it is ignored or rejected by explicit policy.
[ ] Retrieved candidates carry sourceId and provenance so output can be audited.
```

## Failure behavior

Make this explicit per profile/config.

```txt
degrade
  Log/observe retrieval failure, continue without RAG context.

fail_turn
  Fail before model execution with explicit safe error.
```

Do not let adapter exceptions become untyped stream behavior.

## Tests to add

```txt
[ ] Manifest declares at least one retrieval source when RAG is enabled.
[ ] Turn policy passes allowedSourceIds into retrieval.
[ ] Disabled retrieval policy does not call the retriever.
[ ] Enabled retriever receives auth/workspace/request scope.
[ ] Retrieved candidates include provenance, trust, redaction class, and token estimate.
[ ] Retrieved candidates appear in the context manifest.
[ ] Retrieved sections appear in the runtime context board.
[ ] Retrieval failure behavior is explicit and tested for degrade/fail_turn.
```

## Acceptance criteria

```txt
[ ] RAG can be enabled by config.
[ ] Enabled RAG retrieves from at least one concrete source.
[ ] Turn policy controls allowed source IDs.
[ ] Retrieved candidates enter context admission, not runtime/provider directly.
[ ] Runtime receives prepared RAG context, not retriever DTOs.
[ ] Docs state which adapter is reference/local and which is production/external.
```

---

# 07 — Research Agent Implementation

## Goal

Implement research only when the product needs pre-answer synthesis beyond basic RAG.

The audit says the core has a `ResearchAgentPort`, but the default running service falls back to `noop-research-agent`, returning an empty summary and no sources.

Research is lower priority than history, durable persistence, memory, RAG, and context admission. It should not block those fundamentals unless a current use case needs it now.

## Decide whether research is needed now

Before implementation, answer:

```txt
What does research do that RAG does not?
Does it produce a summary for the main assistant?
Does it follow multiple sources/steps?
Does it call an external LangGraph agent?
Does it need durable artifacts?
Does it stream user-visible progress, or is it private pre-context work?
```

If the answer is unclear, do not implement research yet. Keep it disabled and documented honestly.

## Research modes

```txt
disabled
  No research runs.

external/langgraph
  Calls an external research agent/workflow and receives a summary + sources.

internal
  Uses local model/tool/RAG workflow to synthesize research context.
```

Do not make research a generic plugin. Keep a clear `ResearchAgentPort` or `AgentExecutor` boundary depending on behavior.

## Recommended shape

Research as pre-answer context producer:

```ts
export type ResearchAgentInput = {
  readonly requestId: string;
  readonly authContext: AuthContext;
  readonly workspace: WorkspaceRef;
  readonly userMessage: string;
  readonly allowedSourceIds: readonly string[];
  readonly maxResearchSteps: number;
  readonly abortSignal?: AbortSignal;
};

export type ResearchAgentOutput = {
  readonly artifactId?: string;
  readonly summary: string;
  readonly sources: readonly RagContextCandidate[];
  readonly estimatedTokens: number;
  readonly provenance: JsonObject;
};
```

Research output becomes context candidates. It should not become browser protocol DTOs directly.

## Implementation tasks

Target files:

```txt
apps/partner-ai-service/src/config/service-config.ts
apps/partner-ai-service/src/adapters/agents/**
apps/partner-ai-service/src/composition/service-composition.ts
apps/partner-ai-service/src/composition/context-manager/sources/context-source-gathering.ts
apps/partner-ai-service/src/composition/context-manager/candidates/context-candidate-creation.ts
apps/partner-ai-service/src/composition/manifest/service-capability-manifest.ts
```

Tasks if research is implemented now:

```txt
[ ] Add research mode config.
[ ] Add research capability registration.
[ ] Add profile/policy switch for research_context.
[ ] Implement concrete ResearchAgentPort adapter.
[ ] Pass auth/workspace/request/allowed source scope into research.
[ ] Convert research output into context candidates.
[ ] Decide whether research artifacts are persisted or explicitly ephemeral.
[ ] Add failure policy: degrade or fail_turn.
[ ] Add tests for enabled, disabled, empty, failure, and source provenance.
```

Tasks if research is not implemented now:

```txt
[ ] Keep ResearchAgentPort seam.
[ ] Keep config mode disabled/noop explicit.
[ ] Diagnostics report research disabled/noop.
[ ] Docs state research is an extension seam, not implemented default behavior.
[ ] Tests assert production-like config cannot enable research without a concrete adapter.
```

## When research should be an AgentExecutor instead

If the external agent produces the final answer stream, do not model it as research context. Model it as an `AgentExecutor` selected by profile/policy.

```txt
ResearchAgentPort
  produces context for the main assistant.

AgentExecutor
  produces the final RuntimeEvent stream for the turn.
```

This distinction matters for readability and boundary safety.

## Acceptance criteria

```txt
[ ] Research runs only when profile/policy allows it.
[ ] Research receives request, auth, workspace, and allowed source scope.
[ ] Research output becomes context candidates and artifacts.
[ ] Research artifacts are persisted or explicitly declared ephemeral.
[ ] Research sources appear in the context manifest.
[ ] Runtime receives prepared research context, not browser protocol DTOs.
[ ] Disabled research policy does not call the research agent.
[ ] Research failure behavior is explicit and tested.
```

---

# 08 — App-Path Tests and Harnesses

## Goal

Move from seam tests with fakes to app-path tests that prove the default/configured service behavior.

The audit says existing tests are useful because they prove extension seams can carry memory, RAG, and research through the context board. But they can mislead review because they do not prove the default launched app has concrete sources of that data.

## Test principle

Every capability should have both:

```txt
Seam test
  Proves the port/adapter contract can carry data.

App-path test
  Proves service config/composition wires a concrete or explicit disabled adapter.
```

A test that injects a fake directly into a context manager is not enough to prove the app behavior.

## Required test groups

### Capability status/config tests

Target:

```txt
apps/partner-ai-service/src/config/service-config.test.ts
apps/partner-ai-service/src/composition/service-composition.test.ts
```

Cases:

```txt
[ ] Default local config reports explicit disabled/noop memory/RAG/research.
[ ] Production-like config rejects enabled memory with no concrete adapter.
[ ] Production-like config rejects enabled RAG with no retrieval source.
[ ] Production-like config rejects enabled research with no concrete adapter.
[ ] Diagnostics contain capability state and adapter id, but no secrets.
```

### History behavior tests

Target:

```txt
apps/partner-ai-service/src/inbound/http/app.persistence.test.ts
test-harness/adoption-harness/src/adoption-golden-path.test.ts
test-harness/widget-harness/e2e/widget-harness.spec.ts
```

Cases:

```txt
[ ] Turn N+1 includes Turn N according to history policy.
[ ] Disabled history policy includes no prior turns.
[ ] Reset removes prior turns from future model context.
[ ] History respects conversation/workspace boundary.
[ ] Runtime request or context manifest proves history inclusion deterministically.
```

### Postgres durability tests

Target:

```txt
test-harness/widget-harness/e2e/persistent.spec.ts
apps/partner-ai-service/src/inbound/http/app.persistence.test.ts
packages/db/src/repositories/postgres-drizzle/**
```

Cases:

```txt
[ ] Postgres insert path works for conversation, user message, assistant turn, terminal update.
[ ] History survives service restart/fresh composition.
[ ] Context snapshot persists through Postgres path.
[ ] Service does not silently fall back to memory repository when database URL is configured.
```

### Memory app-path tests

Cases:

```txt
[ ] Enabled memory recalls via concrete adapter.
[ ] First turn can produce write candidates.
[ ] Auto-apply or approved candidates are persisted.
[ ] Later turn recalls memory through configured service path.
[ ] Disabled memory does not recall/write.
[ ] Memory failure is observable and does not produce a second terminal event.
```

### RAG app-path tests

Cases:

```txt
[ ] Enabled RAG config registers source manifest.
[ ] Retriever receives allowedSourceIds and auth/workspace scope.
[ ] Retrieved candidates enter context manifest and runtime context board.
[ ] Disabled RAG does not call retriever.
[ ] Retrieval failure mode degrade/fail_turn is tested.
```

### Context admission tests

Cases:

```txt
[ ] No-pressure includes all candidates.
[ ] Budget-pressure drops lower-priority candidates.
[ ] Source caps are enforced.
[ ] Dropped candidates are visible in the manifest.
[ ] Required context cannot be displaced by RAG/history overflow.
```

### Research tests, if implemented

Cases:

```txt
[ ] Research runs only when policy/profile allows it.
[ ] Research output becomes context candidates.
[ ] Research sources appear in manifest.
[ ] Research failure behavior is explicit.
```

## Harness expectations

Widget harness should prove user-visible behavior, but deterministic service tests should prove exact context admission.

Suggested harness smoke:

```txt
1. Run configured service with real model and durable persistence.
2. Send first message that establishes a conversation fact.
3. Send follow-up question in same conversation.
4. Verify model can answer based on prior turn.
5. Restart service or fresh composition.
6. Verify history endpoint still returns persisted messages.
```

Do not make the only proof depend on model wording. The deterministic proof should inspect the runtime request/context manifest.

## Acceptance criteria

```txt
[ ] A test fails if default production config silently uses no-op memory.
[ ] A test fails if enabled RAG has no retrieval source.
[ ] A test fails if enabled research has no concrete agent.
[ ] A test proves history is included in a follow-up turn.
[ ] A test proves memory recall/write survives through configured persistence.
[ ] Harness smoke proves normal chat continuity.
```

---

# 09 — Documentation and Status Sync

## Goal

Keep docs honest and compact while implementation catches up to architecture.

The audit says canonical docs describe intended architecture, while implementation is still partly ports, no-ops, and fake-injected tests. That mismatch is dangerous because it makes the repo look feature-complete when the default app behavior is not.

## Documentation rule

```txt
Do not write docs as if seams are features.
Do not add more large architecture text.
Compress docs and add concrete status notes.
```

The documentation reset/readability work is already in implementation. This phase only covers status alignment for memory/history/RAG/research/context.

## Required docs updates

Target docs:

```txt
docs/architecture/extension-seams.md
docs/architecture/assistant-turn.md
docs/product/requirements.md
docs/operations/verification.md
apps/partner-ai-service/README.md
apps/partner-ai-service/src/adapters/README.md
packages/partner-ai-core/src/application/stream-chat/README.md
```

## Add a capability status table

Add a concise table to the service README or extension seams doc:

```md
| Capability               | Default app status               | Concrete adapter                  | How to enable                     | Notes                 |
| ------------------------ | -------------------------------- | --------------------------------- | --------------------------------- | --------------------- |
| History API              | implemented                      | conversation repository           | enabled by persistence config     | fetch/reset history   |
| History in model context | implemented/disabled/in progress | context manager history admission | SIDECHAT_HISTORY_MODE             | recent messages first |
| Memory recall/write      | disabled/noop/implemented        | MemoryPort adapter                | SIDECHAT_MEMORY_MODE              | not same as history   |
| RAG                      | disabled/noop/implemented        | RagRetrieverPort adapter          | SIDECHAT_RAG_MODE                 | pre-model context     |
| Research                 | disabled/noop/implemented        | ResearchAgentPort adapter         | SIDECHAT_RESEARCH_MODE            | optional              |
| Context admission        | simple/deterministic_v1          | context manager                   | SIDECHAT_CONTEXT_ADMISSION_POLICY | include/drop manifest |
```

Keep this table updated as each phase lands.

## Update assistant turn doc

`docs/architecture/assistant-turn.md` should show the real current pipeline.

For example:

```txt
authorize
resolve profile/policy
run guards
persist user turn
gather history/memory/RAG/research sources according to policy
admit context under budget
execute runtime
finalize
record memory write candidates, if memory policy enables it
```

For each step, state whether it is currently implemented, disabled by default, or extension seam only.

## Update extension seams doc

For each seam:

```txt
MemoryPort
  Purpose
  Default adapter state
  Concrete adapters available
  Config key
  What tests prove

RagRetrieverPort
  Purpose
  Default adapter state
  Concrete adapters available
  Config key
  What tests prove

ResearchAgentPort
  Purpose
  Default adapter state
  Concrete adapters available
  Config key
  What tests prove
```

Do not duplicate full architecture. Link to vocabulary and assistant-turn docs if needed.

## Update verification docs

`docs/operations/verification.md` should include commands/checklists for:

```txt
[ ] checking capability diagnostics
[ ] running configured service with Postgres
[ ] proving history survives restart
[ ] proving follow-up turns include history
[ ] proving memory/RAG are enabled only when concrete adapters exist
```

Do not claim these pass until they do.

## Close or update working plan docs

If current-iteration plan docs are kept in repo, update unchecked criteria as work lands. If they are temporary agent artifacts, delete or archive them after they are converted into implementation/docs.

## Acceptance criteria

```txt
[ ] Docs state which capabilities are concrete and which are extension seams.
[ ] Extension seam docs include default app behavior notes.
[ ] Service README lists enabled default capabilities.
[ ] Verification docs include memory/history/RAG/research checks.
[ ] Docs do not overpromise production-ready memory/RAG/research before concrete adapters exist.
[ ] Current iteration acceptance criteria are updated, closed, or removed once superseded.
```

---

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

---

# Appendix A — Agent Prompts

Use these as focused prompts for worker agents.

## Phase 1 prompt — status/config

```md
Use `00-orchestrator-brief.md` and `01-capability-status-and-config-foundation.md`.

Implement explicit capability status and config foundation for memory, RAG, research, history, and context admission.

Do not implement memory/RAG/research behavior yet.
Do not hide no-op fallbacks.
Production-like config must fail if an enabled capability has no concrete adapter.
Add diagnostics without leaking secrets.
Update docs minimally with honest status.
```

## Phase 2 prompt — history

```md
Use `00-orchestrator-brief.md` and `02-conversation-history-in-model-context.md`.

Implement conversation history admission into model context.
Choose recent prior messages as runtime messages for MVP.
Do not solve chat continuity through memory.
Do not include the current user message twice.
Add reset and second-turn tests.
Expose history admission in context manifest or runtime request inspection.
```

## Phase 3 prompt — Postgres

```md
Use `00-orchestrator-brief.md` and `03-durable-postgres-persistence-path.md`.

Fix the Postgres-backed persistence path for the real service.
Do not fall back to in-memory repositories when SIDECHAT_DATABASE_URL is configured.
Prove persisted history survives fresh service composition/restart.
Do not implement memory/RAG in this phase.
```

## Phase 4 prompt — context admission

```md
Use `00-orchestrator-brief.md` and `04-context-admission-and-budgeting.md`.

Replace simple include-all context selection with deterministic_v1 admission.
Move token budget out of hidden constants.
Record included and dropped candidates in manifest.
Keep the algorithm boring and locally readable.
```

## Phase 5 prompt — memory

```md
Use `00-orchestrator-brief.md` and `05-real-memory-implementation.md`.

Implement concrete memory recall/write through configured service path.
Keep history separate from memory.
Memory records must have explicit scope.
Disabled memory must recall/write nothing.
Memory write failures must be observable without creating duplicate terminal stream events.
```

## Phase 6 prompt — RAG

```md
Use `00-orchestrator-brief.md` and `06-real-rag-implementation.md`.

Implement a concrete RAG retriever path enabled by config.
Do not implement default RAG as a model-callable tool.
Register retrieval sources in the service manifest.
Pass auth/workspace/allowedSourceIds into retrieval.
Retrieved context must enter context admission before runtime.
```

## Phase 7 prompt — research

```md
Use `00-orchestrator-brief.md` and `07-research-agent-implementation.md`.

First decide if research is currently needed.
If not needed, keep it disabled/noop explicitly and update status/docs/tests.
If needed, implement ResearchAgentPort as a context producer, not browser protocol output.
Research must run only when policy/profile allows it.
```

## Phase 8 prompt — tests

```md
Use `00-orchestrator-brief.md` and `08-app-path-tests-and-harnesses.md`.

Add app-path tests that prove default/configured service behavior.
Do not rely only on fake-injected seam tests.
Tests should inspect runtime request/context manifest where possible instead of relying only on model wording.
```

## Phase 9 prompt — docs

```md
Use `00-orchestrator-brief.md` and `09-documentation-and-status-sync.md`.

Update docs to match implemented behavior.
Do not add wall-of-text docs.
Add concise status tables and verification notes.
Clearly distinguish implemented capability from extension seam.
```

---

# Appendix B — Suggested Types and Config

This appendix collects optional snippets. Agents should adapt them to existing repo types instead of copying blindly.

## Config keys

```txt
SIDECHAT_PROFILE_ENV=local|production

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

SIDECHAT_MEMORY_MODE=disabled|noop|postgres|external
SIDECHAT_MEMORY_AUTO_WRITE=disabled|propose_only|auto_apply
SIDECHAT_MEMORY_DEFAULT_SCOPE=conversation|workspace|user

SIDECHAT_RAG_MODE=disabled|noop|static|http|external
SIDECHAT_RAG_SOURCES=source-a,source-b
SIDECHAT_RAG_FAILURE_MODE=degrade|fail_turn

SIDECHAT_RESEARCH_MODE=disabled|noop|external|langgraph
SIDECHAT_RESEARCH_FAILURE_MODE=degrade|fail_turn
```

## Capability status

```ts
export type CapabilityStatus = {
  readonly capability: string;
  readonly state: "enabled" | "disabled" | "noop" | "misconfigured";
  readonly adapterId?: string;
  readonly reason?: string;
  readonly safeForProduction: boolean;
};
```

## History policy

```ts
export type HistoryAdmissionPolicy = {
  readonly mode: "disabled" | "recent_messages" | "recent_plus_summary";
  readonly maxMessages: number;
  readonly maxEstimatedTokens: number;
  readonly includeAssistantMessages: boolean;
};
```

## Context admission

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

## Memory

```ts
export type MemoryScope =
  | { readonly kind: "conversation"; readonly conversationId: string }
  | { readonly kind: "workspace"; readonly workspaceId: string }
  | { readonly kind: "user"; readonly userId: string };

export type MemoryRecord = {
  readonly memoryId: string;
  readonly scope: MemoryScope;
  readonly kind: "fact" | "preference" | "summary" | "instruction";
  readonly content: string;
  readonly confidence: number;
  readonly status: "active" | "superseded" | "deleted";
  readonly sourceConversationId?: string;
  readonly sourceMessageIds?: readonly string[];
  readonly provenance?: JsonObject;
  readonly createdAt: Date;
  readonly updatedAt: Date;
};
```

## RAG

```ts
export type RetrievalSourceManifest = {
  readonly sourceId: string;
  readonly displayName: string;
  readonly description: string;
  readonly adapterId: string;
  readonly defaultEnabled: boolean;
  readonly trustLevel: "host" | "retrieved" | "external";
  readonly redactionClass: "public" | "internal" | "confidential";
};

export type RagContextCandidate = {
  readonly candidateId: string;
  readonly sourceId: string;
  readonly title: string;
  readonly content: string;
  readonly url?: string;
  readonly score: number;
  readonly estimatedTokens: number;
  readonly trustLevel: "retrieved" | "host" | "external";
  readonly redactionClass: "public" | "internal" | "confidential";
  readonly provenance: JsonObject;
};
```

## Research

```ts
export type ResearchAgentOutput = {
  readonly artifactId?: string;
  readonly summary: string;
  readonly sources: readonly RagContextCandidate[];
  readonly estimatedTokens: number;
  readonly provenance: JsonObject;
};
```
