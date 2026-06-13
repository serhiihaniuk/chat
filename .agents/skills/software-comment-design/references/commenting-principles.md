# Commenting Principles Reference

This reference is an original, AI-facing distillation inspired by John K. Ousterhout's *A Philosophy of Software Design*. It is not a replacement for the book and does not quote the book.

## Core model

A useful comment is part of the software design. It helps define or preserve an abstraction by recording information that code alone does not expose clearly enough.

The goal is not more comments. The goal is less rediscovery of hidden knowledge.

## Useful comment categories

Use comments for:

- abstraction meaning: what a module, class, function, hook, component, field, or protocol means at a higher level;
- contract: valid inputs, output meaning, errors, side effects, idempotency, ownership, lifecycle, cleanup, timing, and guarantees;
- constraints: invariants, ordering rules, state-machine requirements, concurrency assumptions, units, ranges, nullability, mutability, and security constraints;
- rationale: why this design exists, why an apparent alternative was rejected, or why a workaround is necessary;
- warnings: what future edits can break and why;
- non-guarantees: what callers must not rely on, especially uniqueness, ordering, stability, sync/async timing, caching, and persistence.

Avoid comments that:

- repeat names or syntax;
- narrate obvious control flow;
- use vague verbs such as handle, process, manage, fix, update without saying the real behavior;
- document accidental behavior as intended behavior;
- hide uncertainty behind confident prose;
- explain implementation details at a public interface when callers do not need them;
- compensate for confusing code that can reasonably be refactored instead.

## Self-documenting code limit

Good names, types, tests, and structure are the first layer. They usually answer what the code does. They often do not answer why, what contract callers may rely on, what must stay true, or what edge cases shaped the design.

When code already communicates the fact, delete the comment. When code cannot communicate the fact cleanly, use a comment.

## Interface comments

Interface comments are for callers. They should hide implementation details unless those details affect correct use.

Good interface comments mention:

- abstraction purpose;
- input meaning, not just input type;
- output meaning and guarantees;
- important non-guarantees;
- side effects, I/O, caching, retries, mutation, rendering constraints, or thrown errors;
- lifecycle or cleanup rules;
- performance characteristics only when callers must account for them.

Bad interface comments leak private steps or repeat a function name.

### Interface example

```ts
/**
 * Returns the account label shown in search results and navigation.
 *
 * The label is safe for display but is not unique. Incomplete profiles fall
 * back to email so callers can still render a useful row.
 */
export function getAccountLabel(account: Account): string;
```

## Implementation comments

Implementation comments are for maintainers. They explain why code is shaped a particular way or what invariant must survive edits.

Good implementation comments mention:

- algorithm sketch when the algorithm is not standard or obvious;
- tie-breakers, stable ordering, rounding, batching, debounce/throttle reasons;
- async races, stale responses, cleanup, cancellation, retries;
- framework or browser quirks;
- performance constraints;
- compatibility workarounds;
- security assumptions.

### Implementation example

```ts
// Keep the original index as the final tie-breaker. Equal-score items must keep
// stable ordering so virtualized rows are not remounted between renders.
const ranked = items
  .map((item, originalIndex) => ({ item, originalIndex, score: scoreItem(item) }))
  .sort((a, b) => b.score - a.score || a.originalIndex - b.originalIndex);
```

## TODO comments

Only add TODO comments when there is actionable future work. Prefer including owner, ticket, condition, or removal trigger when available. Do not invent ticket IDs or owners.

Better:

```ts
// TODO: Remove this fallback after the legacy profile endpoint is retired.
```

Worse:

```ts
// TODO: fix later
```

## Comment durability

A comment should be easy to keep correct. Prefer comments about stable contracts, invariants, and rationale over descriptions of local mechanics that change during ordinary refactors.

If a comment needs to mention implementation, anchor it to a real constraint: ordering, race prevention, API quirk, performance, or compatibility.
