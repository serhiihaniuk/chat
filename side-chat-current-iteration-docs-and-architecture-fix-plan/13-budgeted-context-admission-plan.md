# Budgeted Context Admission Plan

## 1. Goal

Replace simple include-all context admission with an explicit, deterministic
budgeted admission policy that can include, drop, and explain context candidates
from history, host context, memory, RAG, research, and tool context.

This plan covers audit gap `4.5`.

## 2. Current gap

The current implementation:

```txt
apps/partner-ai-service/src/composition/context-manager/candidates/context-candidate-selection.ts
```

includes every gathered candidate, records estimated token use, and uses hidden
constants for input/output budgets. That is honest only as a simple bootstrap
strategy. It is not robust context management.

## 3. Ownership

| Concern                | Owner                                                                                   |
| ---------------------- | --------------------------------------------------------------------------------------- |
| Admission policy shape | `packages/partner-ai-core` policy/profile terms or service context profile              |
| Candidate gathering    | `apps/partner-ai-service/src/composition/context-manager/sources/**`                    |
| Candidate selection    | `apps/partner-ai-service/src/composition/context-manager/candidates/**`                 |
| Manifest explanation   | `apps/partner-ai-service/src/composition/context-manager/rendering/context-manifest.ts` |
| Runtime rendering      | `apps/partner-ai-service/src/composition/context-manager/rendering/**`                  |

Runtime should receive prepared context only. It should not choose which product
context is authorized or dropped.

## 4. Admission contract

Define a named policy such as:

```txt
simple_include_all
budgeted_priority_v1
```

For the budgeted policy, define:

```txt
max input tokens
reserved output tokens
source-specific caps
required candidate classes
priority ordering
tie-break ordering
oversized candidate behavior
dropped-candidate manifest reasons
```

Do not call the policy budgeted until it can actually drop candidates under
pressure.

## 5. Implementation sequence

1. Add a context budget profile.

   Resolve it from service config/profile rather than hidden constants.

2. Normalize candidates before selection.

   Each candidate should have:

   ```txt
   source kind
   source id
   priority
   estimated tokens
   trust/redaction class
   required/optional flag
   stable tie-break key
   ```

3. Implement deterministic ordering.

   The same input must produce the same include/drop decision. Use stable
   ordering, not adapter return order alone.

4. Implement include/drop behavior.

   Required safety/profile context should be protected from low-priority RAG or
   memory. Optional candidates can be dropped when the budget is exhausted.

5. Handle oversized candidates.

   Choose one:

   ```txt
   drop oversized candidate
   truncate with explicit marker
   summarize through a separate planned summarizer
   fail if required candidate is oversized
   ```

6. Record manifest reasons.

   The context manifest should include included and dropped candidates with
   source kind, safe provenance, estimated tokens, and reason.

7. Keep simple admission available only as an explicit mode.

   Local development may still use simple include-all, but docs and status must
   name it honestly.

## 6. Tests

Required scenarios:

```txt
[ ] no-pressure case includes all optional candidates
[ ] budget pressure drops lower-priority candidates
[ ] stable tie-break ordering is deterministic
[ ] required safety/profile context cannot be displaced by RAG
[ ] source-specific caps are enforced
[ ] oversized optional candidate follows chosen behavior
[ ] dropped candidates appear in manifest with reasons
[ ] token budget comes from config/profile
```

Likely test files:

```txt
apps/partner-ai-service/src/composition/context-manager/service-context-manager.test.ts
apps/partner-ai-service/src/composition/context-manager/candidates/context-candidate-selection.test.ts
apps/partner-ai-service/src/config/service-config.test.ts
```

## 7. Documentation updates

Update:

```txt
docs/architecture/assistant-turn.md
docs/product/requirements.md
apps/partner-ai-service/README.md
side-chat-current-iteration-docs-and-architecture-fix-plan/07-acceptance-criteria.md
```

Docs should describe the policy name and contract, not the private scoring
implementation.

## 8. Acceptance criteria

```txt
[ ] Admission policy has an explicit name and contract.
[ ] Token budget comes from profile/config, not a hidden constant.
[ ] Candidates can be dropped under budget pressure.
[ ] Dropped candidates are recorded in the manifest.
[ ] High-priority safety/profile context cannot be displaced by low-priority RAG.
[ ] Tests cover simple no-pressure and budget-pressure cases.
```
