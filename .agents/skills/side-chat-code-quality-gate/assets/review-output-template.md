# Review Output Template

Use this structure for code-quality reviews unless the user asks for another format.

```md
## Summary
<1-3 sentences. State the dominant risk and scope inspected.>

## Mechanical gate
| Check | Result | Notes |
|---|---|---|
| format:check | run / skipped / blocked | ... |
| lint:oxlint | run / skipped / blocked | ... |
| typecheck | run / skipped / blocked | ... |
| test | run / skipped / blocked | ... |
| build | run / skipped / blocked | ... |
| repository governance check | run / skipped / blocked | ... |

## Findings
| Severity | Category | Evidence | Why it matters | Suggested fix | Confidence |
|---|---|---|---|---|---|
| high | stream-sdk-context-gap | `path/to/file:line` | ... | ... | high |

## Readability/comment improvements
<Use only when useful. Include exact replacement comments or code-shape suggestion.>

## Verification
<Commands actually run and exact blockers.>

## Not inspected / uncertainty
<Scope limits.>
```

Severity guidance:

- `high`: breaks mechanical gate, risks boundary leakage, likely correctness issue, or makes core/runtime behavior unsafe to change.
- `medium`: clear maintainability/readability risk with concrete local evidence.
- `low`: minor local cleanup; include only when already touching the area or the user requested detail.

Categories:

```txt
mechanical-gate
complexity-hotspot
ai-readability
comment-context-gap
stream-sdk-context-gap
boundary-leak
type-safety
ui-state-behavior
testability-gap
size-budget
dependency-governance
```

Avoid praise sections. Avoid filler findings.
