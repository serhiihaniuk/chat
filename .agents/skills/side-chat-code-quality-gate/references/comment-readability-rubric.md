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

## Required coverage triggers

Missing comments are failures for complex Side Chat code, even when existing comments are not wrong.

Add or verify comments for:

- exported complex types, option objects, config objects, status objects, manifest shapes, protocol shapes, and context-board shapes;
- fields whose names do not reveal units, privacy rules, lifecycle stage, failure behavior, or whether the value is model-visible;
- spine functions that coordinate several lifecycle steps;
- boundary mappers such as env-to-config, config-to-manifest, manifest-to-status, provider-to-runtime, runtime-to-protocol, DB-to-domain, and context-candidate-to-context-board conversion;
- adapter selectors and composition roots where missing dependencies become no-op ports, concrete ports, or startup failures;
- diagnostics and health/readiness objects that must expose safe status without leaking secrets or private content.

## Spine-function comment shape

Use this when a function sequences a request lifecycle or service composition flow:

```ts
/**
 * Prepare everything that must be settled before <next lifecycle boundary>.
 *
 * <What is still allowed to fail here, and what must not have started yet.>
 */
export const prepareThing = (...) =>
  Effect.gen(function* () {
    // Prove <authorization/config/policy/resource availability> before <private data/model/stream> is exposed.
    const first = yield* ...

    // Record <durable/auditable state> before <downstream work> can start.
    yield* ...

    // Publish/select <manifest/port/runtime/context> that later code will consume.
    const selected = ...
  });
```

Every stage comment should use a strong verb such as prove, record, publish, select, hide, prepare, finalize, or fail. Avoid comments that merely say "build", "map", "handle", or "process".

## Type contract comment shape

Use this for exported types that carry domain meaning:

```ts
/**
 * <Local role of this shape.>
 *
 * Source: <where values come from>.
 * Target: <who consumes this shape>.
 * Invariant: <rule future edits must preserve>.
 * Non-guarantee: <what callers must not assume>, when relevant.
 */
export type Example = {
  /** <Units, lifecycle, visibility, or side effect if not obvious from the name.> */
  readonly value: number;
};
```

Do not let compact AI-friendly phrases stand alone. If a comment says "control plane", "adapter boundary", "runtime contract", "typed config", or "validates intent", it must also name concrete source and target entities plus the invariant.
