---
name: software-comment-design
description: Write, review, refactor, or delete code comments using abstraction-first software design rules. Use for JSDoc, TSDoc, docstrings, public API comments, inline implementation comments, stale or missing comments, TODOs, invariants, side effects, edge cases, units, ranges, lifecycle, concurrency, ordering, or code review feedback about comments. Do not use for broad README or architecture docs unless code-level comments are requested.
compatibility: Codex CLI, Codex IDE extension, Codex app; instruction-only skill; no scripts or network needed.
metadata:
  version: "1.0.0"
  source: "Original guide inspired by A Philosophy of Software Design"
---

# Software Comment Design

Apply this skill to make code comments reduce cognitive load and preserve design knowledge. Operate on code, diffs, tests, and nearby documentation. Do not teach the philosophy unless the user explicitly asks.

## Activation boundary

Use this skill when the task mentions adding, writing, reviewing, refactoring, deleting, cleaning, or standardizing code comments, docstrings, JSDoc, TSDoc, inline explanations, TODOs, public API docs, or stale comments.

Also use it during code review when comments affect correctness or maintainability: exported APIs without contracts, surprising logic, hidden invariants, side effects, lifecycle rules, concurrency, ordering, units/ranges, external platform quirks, caching, idempotency, ownership, error behavior, or non-obvious trade-offs.

Do not use this skill for general README writing, user-facing docs, changelogs, marketing copy, release notes, or architecture narratives unless the requested output is code-level comments.

## AI-critical rules

1. Never invent intent. Derive rationale from code, tests, surrounding comments, names, tickets in context, or explicit user instruction. If intent is missing, document only observable contract or ask.
2. Prefer better code over comments that compensate for confusing names or structure. If a rename or extraction is safer and in scope, do that instead of explaining bad code.
3. Add comments only when they say something useful that code, names, types, and tests do not already make obvious.
4. Treat stale comments as defects. Update or delete comments that contradict code.
5. Keep comments near the abstraction or decision they describe. Do not bury durable design knowledge in the final response only.
6. Preserve the repository’s comment style and language conventions.
7. Do not mention the book, this skill, or “philosophy” inside code comments.

## Decision algorithm

For each candidate location:

1. Classify the comment type.
   - Interface comment: caller-visible contract for exported functions, classes, components, hooks, modules, endpoints, config, public fields, or shared utilities.
   - Implementation comment: maintainer-facing reason, invariant, workaround, algorithm sketch, ordering rule, performance constraint, concurrency/lifecycle rule, or surprising edge case.
   - Noise comment: restates nearby code, mirrors the name, narrates obvious control flow, or compensates for code that should be simplified.

2. Apply the comment test.
   - Reader needs this to use or safely change the code: yes/no.
   - The information is not obvious from code/types/names/tests: yes/no.
   - The statement is stable enough to survive local implementation changes: yes/no.
   - Add or keep the comment only when the first two are yes and the third is usually yes.

3. Choose the smallest safe action.
   - Keep: accurate and useful.
   - Update: useful purpose, stale wording.
   - Delete: redundant, misleading, vague, or obsolete.
   - Add: missing contract or non-obvious design knowledge.
   - Refactor instead: comment would explain avoidable complexity.

4. Draft the comment.
   - Start with meaning, contract, or reason; avoid narrating syntax.
   - Include exact units, ranges, ordering, ownership, lifecycle, side effects, errors, non-guarantees, or invariants when relevant.
   - Use one short paragraph for most inline comments.
   - For public interfaces, state what callers may assume and what they must not assume.

5. Validate before finalizing.
   - Compare each claim against code and tests.
   - Remove phrases like “obviously”, “simply”, “just”, “handle”, “process”, “stuff”, or “magic” unless domain wording requires them.
   - Check that future maintainers can tell when the comment must be updated.

## Interface comment contract

For public APIs and shared abstractions, prefer this information order:

1. What abstraction the symbol represents or provides.
2. Caller-visible inputs, outputs, side effects, errors, or lifecycle rules.
3. Guarantees and non-guarantees.
4. Only implementation detail that affects callers.

Do not describe private steps in an interface comment. If callers do not need the implementation detail to use the API correctly, put it inside the implementation or omit it.

## Implementation comment contract

Use implementation comments for non-obvious internal knowledge:

- why the code uses this shape;
- why a simpler-looking alternative is wrong;
- invariant that later edits must preserve;
- ordering or timing dependency;
- browser, framework, API, or platform quirk;
- performance, caching, or memory trade-off;
- concurrency, async, ownership, cleanup, or lifecycle rule;
- surprising edge case backed by code or tests.

Write implementation comments as constraints or rationale, not as line-by-line narration.

## Comment templates

Interface:

```ts
/**
 * Returns the label used for rendering an account in navigation and search.
 *
 * The result is display-safe but not guaranteed to be unique. It prefers the
 * legal name when available and falls back to email for incomplete profiles.
 */
```

Implementation rationale:

```ts
// Keep the original index as the final tie-breaker. Equal-score items must keep
// stable ordering so consumers do not remount rows between renders.
```

Invariant:

```ts
// `pendingRequestId` is cleared only by the matching response. Older responses
// may arrive later and must not overwrite newer state.
```

Workaround:

```ts
// Safari fires this event before layout has settled, so defer the measurement
// one frame to avoid caching a zero-width value.
```

Deletion candidate:

```ts
// Bad: repeats the expression without adding meaning.
// Increment count by one.
count += 1;
```

See [assets/comment-templates.md](assets/comment-templates.md) for more copyable forms.

## Review mode output

When asked to review comments without editing files, output only actionable findings:

- `file:line` or symbol name;
- severity: `bug`, `stale`, `misleading`, `redundant`, `missing-contract`, or `style`;
- why it matters;
- exact replacement, deletion, or insertion text.

Skip praise and skip low-value preferences.

## Edit mode output

When editing files:

1. Make the smallest diff that improves comment quality.
2. Update neighboring stale comments while already touching the area.
3. Do not run tests for comment-only edits unless repository instructions require it.
4. If code behavior was changed as part of a refactor, follow repository verification rules.
5. Final response: changed files, what changed, verification performed, and unresolved uncertainty.

## When to read references

Read [references/commenting-principles.md](references/commenting-principles.md) when the task is broad, ambiguous, or asks for examples.

Read [references/review-rubric.md](references/review-rubric.md) when performing PR review, comment audit, or bulk cleanup.

Read [references/eval-prompts.md](references/eval-prompts.md) when testing whether this skill triggers and behaves correctly.
