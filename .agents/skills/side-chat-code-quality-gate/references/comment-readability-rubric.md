# Comment readability rubric

A comment is good only when it reduces context load or prevents misuse. Discover the repository's current terms and boundaries before writing the final prose.

## Useful comment jobs

Use comments for file-level orientation, source-to-target translation, caller-visible contracts, invariants, stable identity, non-guarantees, failure, cancellation, ordering, timeout, privacy, normalization, and reasons a simpler-looking alternative is wrong.

## Failing comments

Flag comments that restate code, use vague verbs without concrete entities, assume architecture knowledge, omit the local invariant, become stale after ownership changes, replace a needed refactor, or claim intent not supported by code, tests, or docs.

Do not paste `Source`, `Target`, or `Invariant` labels into every comment. Use ordinary prose unless labels genuinely improve a dense contract.

## Context bridge pattern

Use source, target, hidden detail, and invariant as drafting questions:

```ts
/**
 * <Local role in the pipeline.>
 *
 * <Source representation> becomes <target representation>. <Identity, privacy,
 * ordering, failure, or non-guarantee future edits must preserve.>
 */
```

A boundary comment should name the local role first, then the lifecycle, privacy, failure, ordering, or non-guarantee that matters to callers.

Example:

```ts
/**
 * Select records admitted to the next workflow step.
 *
 * The input is already authorized; this function applies the history policy,
 * preserves repository order, and records safe ids and drop reasons without
 * copying private content into diagnostics.
 */
```

## Comment versus refactor

Refactor before commenting when a helper name would explain the step, an anonymous callback hides a domain operation, variable names are too generic, a dense expression needs a comment merely to be parsed, or one comment explains several responsibilities.

Comment after refactoring when stable design knowledge remains hidden.

## Coverage triggers

Add or verify comments for concept-dense files, exported types with domain meaning, fields whose names hide units or lifecycle, spine functions, boundary mappers, adapter selectors, composition roots, and diagnostics that must not leak private data.

Do not add orientation boilerplate to simple leaves, barrels, or tiny helpers.

## File-level orientation

The comment should name the file's non-obvious role, why its concepts belong together, what stays outside the file, and what future change requires updating it. A visible declaration category such as “contains helpers” is not enough.

## Spine-function comments

For a function that coordinates lifecycle stages, comment what each stage proves, records, publishes, selects, hides, prepares, finalizes, or fails before the next stage.

## Type-contract comments

For an exported type, answer where values come from, who consumes them, what rule future edits must preserve, and what callers must not assume. Keep the prose close to the type and avoid private implementation details.

```ts
/**
 * Secret-safe status for one optional capability.
 *
 * Diagnostics may expose the capability name and adapter state, but must not
 * expose credentials, provider options, private records, or raw exceptions.
 */
export type CapabilityStatus = {
  readonly name: string
  readonly state: CapabilityState
}
```
