# Comment Readability Rubric

This skill folds the earlier comment-design guidance into Side Chat's quality gate. A comment is good only when it reduces context load or prevents misuse.

## Useful comment jobs

Use comments for:

- source-to-target boundary translation;
- caller-visible contract;
- invariant or stable identity rule;
- non-guarantee;
- failure, cancellation, ordering, timeout, privacy, or normalization rule;
- reason a simpler-looking alternative is wrong.

## Failing comments

Flag comments that:

- restate the function or next line;
- say “convert”, “map”, “handle”, “process”, “stable”, “typed”, “adapter boundary”, “runtime contract”, or “provider-ready” without naming concrete source and target entities;
- assume the reader already knows architecture docs;
- explain many details but omit the local invariant;
- become a substitute for simpler names or less nesting;
- invent intent not visible in code, tests, docs, or user instruction.

## Context bridge pattern

Prefer this shape:

```ts
/**
 * <Local role in the pipeline.>
 *
 * <Source representation> becomes <target representation>. <Identity, privacy,
 * ordering, failure, or non-guarantee that future edits must preserve.>
 */
```

Example:

```ts
/**
 * Convert AI SDK `tool-error` stream parts into Side Chat's tool activity row.
 *
 * The thrown provider/tool value stays inside `agent-runtime`; downstream
 * packages only receive a failed activity and the stable `TOOL_FAILED` code.
 */
```

## Comment versus refactor

Refactor before commenting when:

- one helper name would explain the step;
- an anonymous callback hides a domain operation;
- variable names are too generic for boundary code;
- a dense expression requires a comment only to be parsed;
- a long comment explains multiple responsibilities in one function.

Comment after refactoring when stable design knowledge remains hidden.

## Not overdone rule

Do not add comments everywhere. Most private helpers need no comment when their name, parameters, and return type are enough.

Add a comment when the code crosses a boundary or preserves a rule that is easy to break later.
