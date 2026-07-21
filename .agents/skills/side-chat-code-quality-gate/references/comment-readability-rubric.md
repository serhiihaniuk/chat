# Comment readability rubric

A comment earns its space when it reduces context load or prevents misuse. Write for the maintainer who knows the language but not the current change.

## Comment jobs

Use comments for:

- file-level orientation and a local mental model;
- public API purpose and caller-visible contracts;
- defaults, units, valid ranges, and mutually exclusive options;
- provider, model, framework, or environment limitations;
- lifecycle timing, ordering, cancellation, retries, and timeouts;
- source-to-target conversion at a boundary;
- identity, privacy, normalization, failure, and non-guarantees;
- reasons a simpler-looking alternative would be wrong.

Do not comment syntax, repeat a clear name, or defend complexity that should be removed through structure.

## Public API and JSDoc standard

For an exported API whose caller-visible contract is not evident from its name and types, use comments as compact reference documentation:

1. Open with one direct purpose sentence.
2. State an important non-goal and name the alternative when useful.
3. Document non-obvious caller constraints with `@param` or the local equivalent; do not repeat self-explanatory names or type properties.
4. Add defaults, units, ranges, conflicts, and conditional support claims.
5. Describe observable timing and operational behavior when callers depend on it.
6. Use inline code for symbols, option names, literals, and alternatives.
7. Group related options so the reader can scan the contract by concern.

Example:

```ts
/**
 * Generate a response and execute tools for one prompt.
 *
 * This function does not stream output. Use `streamResponse` when callers
 * need incremental events.
 *
 * @param prompt - A text prompt. Use either `prompt` or `messages`, not both.
 * @param temperature - Sampling control passed to the provider. The range is
 *   provider- and model-dependent; do not combine it with `topP`.
 */
```

## File-level orientation

Concept-dense files need a short comment before the first exported concept. It must explain:

- the file's local role;
- why the grouped concepts belong together;
- what stays outside the file;
- what future change requires updating the comment.

Do not add this boilerplate to simple leaves, barrels, or tiny helpers.

## Boundary comments

Name the local role first, then explain the conversion in ordinary prose:

```ts
/**
 * Convert provider tool failures into public activity records.
 *
 * The raw provider error stays inside the adapter; callers receive one stable
 * activity id and a safe public error code.
 */
```

The reader should be able to identify the source representation, target contract, hidden detail, and preserved invariant without learning the entire architecture.

Avoid a labeled `Source/Target/Invariant` worksheet unless the surrounding code already uses it and it genuinely improves clarity.

## Spine functions

For a function that coordinates a lifecycle, comment what each stage proves, selects, records, publishes, hides, prepares, finalizes, or fails before the next stage. Prefer named stages over comments that explain a dense expression.

## Comment versus refactor

Refactor first when:

- a helper name would explain the operation;
- an anonymous callback hides a domain step;
- variables are too generic;
- a comment is needed merely to parse an expression;
- one comment explains several responsibilities.

Comment after the refactor when stable design knowledge remains hidden.

## Review questions

1. Does this comment explain behavior the code cannot express clearly?
2. Can a lower-context maintainer tell what the API does and does not guarantee?
3. Are defaults, constraints, timing, and provider limitations documented where relevant?
4. Does a boundary comment name source, target, hidden detail, and preserved invariant?
5. Could the comment become stale after an ownership or lifecycle change?
6. Would better names or structure remove the need for it?
