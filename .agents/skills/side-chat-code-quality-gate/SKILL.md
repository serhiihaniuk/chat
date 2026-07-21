---
name: side-chat-code-quality-gate
description: Review, write, refactor, or gate TypeScript, React, Node, documentation, tests, architecture, comments, and repository governance for human-level readability, simplicity, maintainability, correctness, security, and configured quality checks. Use for hard-to-understand code, oversized functions/files, unclear async or framework boundaries, AI-generated code review, code smells, or repository-wide audits. Do not use for testing-only design; use the testing skill when the main task is test strategy.
---

# Repository Code Quality Gate

Use this skill to keep code boring, explicit, locally understandable, and compatible with the repository's actual architecture and gates. The goal is not generic clean-code advice. The goal is code that a maintainer can read and safely change without already knowing the entire system.

## When to use this skill

Use it for code quality, docs quality, readability, maintainability, code smells, cognitive complexity, oversized code, hard-to-understand generated code, async/framework readability, comments, architecture cleanup, static checks, package boundaries, UI quality, service quality, or repository-wide review.

Use it during any non-trivial implementation or durable-documentation change. Before finalizing the change, check the diff against this gate.

Use the testing skill instead when test design, fixture strategy, test level, or test architecture is the primary task. Keep using this skill for production-code readability and maintainability in a testing change.

## Discover current repository truth first

Before making or reviewing changes:

1. Read the root `AGENTS.md`.
2. Read the repository documentation index and the nearest package or folder README.
3. Read the architecture, lifecycle, boundary, and operations docs relevant to the touched area.
4. Inspect the package manifests, formatter, linter, compiler, test, build, and custom-governance configuration.
5. Discover the actual commands from the repository's package scripts. Do not copy commands or thresholds from this skill when the repository says otherwise.

Do not invent architecture rules. Use current imports, public exports, tests, configuration, and source-of-truth docs as evidence. Treat old plans, target-state docs, compatibility wrappers, and copied examples as suspect until verified.

## Verification guidance

Run the narrowest relevant check first. Then run the repository's documented full gate when the change affects shared types, public APIs, architecture, generated artifacts, or multiple packages. Use the actual script names from the current package manifest.

Report each check as passed, failed, skipped, or blocked. Include the exact command and blocker. Never turn an environment failure into a claim that the code passed.

Do not recommend a formatter, linter, test runner, or assertion library that the repository does not configure. Do not add a dependency merely to make a quality check easier.

## AI-critical behavior rules

1. Prefer explicit, named steps over clever one-liners, deeply nested callbacks, compressed ternaries, and type tricks.
2. Treat complexity metrics as a smoke alarm. Inspect the flow, responsibilities, failure modes, and tests before refactoring.
3. Keep one abstraction level per function. Do not mix policy, selection, provider or framework adaptation, protocol mapping, persistence, rendering, and error conversion in one block.
4. Introduce domain terms close to where they matter. A reader should know what a local term means without reconstructing the whole architecture.
5. Use names, structure, guard clauses, typed objects, and smaller orchestration stages before adding explanatory comments.
6. Comments are part of the quality gate. Add them when a changed contract, boundary, privacy rule, lifecycle point, failure rule, or invariant would otherwise require hidden context.
7. Do not over-comment. Delete comments that narrate syntax, repeat a name, defend avoidable complexity, or describe a design that no longer exists.
8. Preserve behavior and public contracts unless the user explicitly requests a behavior change.
9. Use a final-state rewrite for unshipped internal shapes. Do not preserve aliases or wrappers solely for history.
10. Separate confirmed findings from uncertain design questions.

## Human cognitive-load gate

Write for the maintainer who returns to the code after the current conversation is gone. Prefer low cognitive complexity, shallow nesting, one responsibility per function, and cohesive files. Treat configured repository limits as hard ceilings, not targets.

Refactor when a function mixes responsibilities, failure modes, domain vocabularies, or lifecycle stages. Extract by responsibility and vocabulary, not by arbitrary line count. Do not create tiny helpers that make the reader jump through more files without reducing concepts.

For async, stream, provider, framework, and React state code, make execution order visible. Name preparation, invocation, mapping, cleanup, and error-conversion stages. Keep expected failures, unexpected failures, provider errors, tool errors, protocol errors, and UI errors distinct.

## Comment quality gate

Every kept comment should answer at least one question:

- What mental model explains this concept-dense file?
- What contract can callers rely on?
- What local role does this concept play in the system?
- Why does this boundary transform one representation into another?
- What invariant, privacy rule, ordering rule, or failure rule must future edits preserve?
- What information is intentionally hidden, normalized, or not guaranteed?

Public API and JSDoc comments should read like compact reference documentation:

- Start with the API's purpose in one direct sentence.
- State an important non-goal and name the alternative API when that prevents misuse.
- Document every caller-facing option with `@param` or an equivalent local form.
- Include defaults, units, valid ranges, mutually exclusive options, and provider or model limitations when they affect behavior.
- Describe conditional guarantees honestly, using phrases such as "if supported" when the implementation cannot promise universal support.
- Explain lifecycle timing, retries, cancellation, timeouts, observable behavior, and ordering when callers need to rely on them.
- Use inline code formatting for symbols, option names, literal values, and alternatives.
- Group related parameters in a readable order instead of presenting an undifferentiated option dump.

Concept-dense files need a short file-level orientation comment before the first exported concept. The comment should state the local role, why the grouped concepts belong together, what responsibility stays outside the file, and what future change requires updating the comment. Do not add this boilerplate to simple leaf files, barrels, or tiny helpers.

Boundary-heavy comments should explain the source representation, target contract, hidden detail, and preserved invariant in readable prose. Do not use a labeled `Source/Target/Invariant` worksheet unless the surrounding code already uses that form and it is genuinely clearer.

## Framework and SDK boundaries

Keep framework and vendor details behind the boundary that owns them. Keep browser-facing contracts free of server objects, database rows, provider-native DTOs, and runtime internals. Keep database details behind repositories or the repository's declared persistence boundary. Keep transport conversions at transport edges.

When reviewing stream, AI SDK, or framework code, flag nested callbacks or adapters that hide execution order, callbacks with too many unrelated domain objects, and error mapping that hides expected versus unexpected failures. Prefer named preparation, adapter invocation, boundary mapping, and cleanup stages.

## Type and contract discipline

Reuse canonical types from the owning module. Do not create a second option, status, policy, or protocol shape that can drift from the first.

For closed runtime value sets, follow the repository's established runtime representation. If the repository uses a frozen value object plus a derived type, preserve that pattern. Verify the local convention before introducing a new enum-like shape.

Keep public contracts narrow. Validate untrusted input at the owning boundary. Do not leak internal errors, database rows, provider options, private content, or framework objects across a public boundary.

## Security and data-handling gate

Treat authentication, authorization, tenant and workspace ownership, client and server tools, stream validation, and database access as trust boundaries. Verify that each decision is made from authenticated server-owned identity rather than host context, request metadata, model output, or another untrusted representation.

Keep credentials, prompts, retrieved content, tool payloads, private conversation data, and raw provider errors out of logs, diagnostics, public protocol events, tests, and review output. Check both success and failure paths for accidental disclosure.

Preserve ownership checks, idempotency, cancellation, timeouts, size limits, rate limits, and resource bounds when changing a boundary or lifecycle. Report a security claim only when the relevant enforcement and failure behavior were inspected; otherwise state the unverified surface explicitly.

**High-frequency regression — magic values and copied helpers. Check this explicitly on every change; it slips through most often.**

- Extract repeated or domain literals — status values, error codes, result codes, reason strings, tuned numbers — into a named `const` at the owning module. Do not inline the same string or number in more than one place, and do not re-type a union inline when the owning module already exports it.
- Reuse an existing shared helper or type instead of re-declaring it. A guard, projector, or record-narrowing utility copied into a second file is a defect: import it (for example from `@side-chat/shared`) and delete the copy. When a value set already exists, reuse it — do not stand up a parallel enum-like shape that can drift.
- Never hardcode another package's contract values. If a client must react to a service error code or status, key off the boundary signal it already owns (HTTP status) or import a shared constant. A duplicated string silently breaks when the owner renames it.

## Documentation quality gate

Treat documentation and comments as maintainability behavior. Update the canonical document when code changes a term, lifecycle order, boundary, public contract, configuration model, command, or verification rule.

Link to the repository's documentation source of truth instead of copying global vocabulary or architecture into a local README. Delete or clearly quarantine stale plans and replaced sources of truth. Verify every command, path, symbol, endpoint, and example before documenting it.

## Review mode output

When reviewing without editing, report actionable findings only:

```md
## Summary
<Scope inspected, evidence checked, and dominant quality risk.>

## Findings
| Severity | Category | Evidence | Why it matters | Suggested fix | Confidence |
|---|---|---|---|---|---|
| high | readability-context-gap | `path/to/file:line` | ... | ... | high |

## Verification
- Ran: `<commands>`
- Not run: `<reason>`

## Uncertainty
<Files not inspected, unavailable tools, or unresolved intent.>
```

Useful categories include `correctness-risk`, `security-boundary`, `data-exposure`, `type-safety-risk`, `complexity-hotspot`, `readability-context-gap`, `cleverness-debt`, `comment-quality`, `coupling-boundary`, `ui-state-behavior`, `async-resource`, `testability-gap`, and `repo-gate-mismatch`.

## Edit mode output

Before broad edits, state the intended safe transformation. Then make the smallest coherent diff, preserve public behavior unless asked otherwise, and run the narrowest relevant checks.

Report changed files, the readability or quality issue fixed, comments added or deleted, docs updated or deleted, vocabulary changes, verification, and remaining risk.

## Large-repository audit workflow

1. Read repository context and package scripts.
2. Inspect the configured formatter, linter, compiler, test runner, build, and governance checks.
3. Inventory changed, oversized, high-complexity, boundary-crossing, and framework-heavy files.
4. Inspect the highest-risk hotspots manually.
5. Separate mechanical gate failures from maintainability opportunities.
6. Verify each finding against current source and tests.
7. Recommend quick safe refactors, context bridges, larger structural changes, and the checks that prove each change.

## References

Load references relative to this skill directory only when needed:

- `references/human-cognitive-load-budget.md` for complexity and simplification review.
- `references/ai-sdk-readability.md` for stream, provider, and SDK boundaries.
- `references/comment-readability-rubric.md` for context bridges and comment coverage.
- `assets/comment-context-bridge-patterns.md` for boundary-comment examples.
- `references/eval-prompts.md` when validating this skill's behavior.
