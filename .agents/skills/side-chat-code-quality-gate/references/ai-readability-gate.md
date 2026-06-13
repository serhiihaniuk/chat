# AI readability gate

This reference exists because AI-generated code often passes syntax and lint checks while being hard for a human maintainer to read.

The target reader knows TypeScript and the Side Chat folder map. They do not necessarily know the current AI SDK, Effect, or domain-thread context. Code should not require them to reconstruct that context from a dense expression.

## Human-level bar

AI-generated code must be held to a lower cognitive-complexity bar than the model can personally tolerate. The target is not "the AI can still reason about it." The target is "a human maintainer can keep the local story in working memory."

Practical rule:

- `0-8` cognitive complexity: usually acceptable if the function has one job.
- `9-12`: inspect carefully; keep only when the function is cohesive and tests protect the behavior.
- `>12`: do not introduce; refactor before finalizing.

For AI SDK/Effect code, prefer explicit local steps even if they add a few lines. A few more lines with named concepts are usually cheaper than one compressed expression that requires global context.

## Main failure modes

### 1. Clever code

Clever code compresses decisions that should be visible:

- deeply nested expressions;
- anonymous domain callbacks;
- too many object spreads with conditional meaning;
- type-level tricks where a simple domain type would be clearer;
- `.pipe` chains where every step is abstract;
- table-driven dispatch where ordinary branching would be more readable;
- generic helper factories introduced for one call site.

Gate response: simplify names and structure before adding comments.

### 2. Too-big code

Too-big code is not only about lines. It is too big when a reader cannot hold the local story in memory.

Red flags:

- one file mixes orchestration, mapping, validation, policy, rendering, and test fixtures;
- one function has several reasons to change;
- `Effect.gen` becomes a script with unrelated steps;
- a React component owns fetching, state machine, formatting, and JSX;
- a mapper also performs policy decisions;
- a helper file becomes a domain dumping ground.

Gate response: split along ownership and change reason. Do not split into tiny helpers that force constant jumping.

### 3. Term tracking failure

Side Chat uses many terms that sound generic but are domain-specific.

High-risk terms:

- `runtime`
- `provider`
- `tool`
- `activity`
- `protocol`
- `event`
- `stream`
- `turn`
- `context`
- `adapter`
- `contract`
- `part`
- `request`
- `result`
- `source`

A comment or name fails when it uses those terms without telling the reader which side of a boundary they belong to.

Better:

- `aiSdkToolErrorPart`
- `runtimeToolActivity`
- `sidechatProtocolEvent`
- `providerRequest`
- `preparedRuntimeTurn`
- `hostCommandResultActivity`

Worse:

- `part`
- `event`
- `data`
- `result`
- `contract`
- `adapter boundary`

Short scopes can use short names. Boundary code cannot.

### 4. Context-gap comments

A technically accurate comment can still fail if it assumes the missing context is already known.

Weak:

```ts
/**
 * Convert a provider/tool execution failure into the runtime activity contract.
 */
```

Stronger:

```ts
/**
 * Convert AI SDK `tool-error` stream parts into Side Chat's tool activity row.
 */
```

The stronger version names the source system, source entity, product target, and contract shape.

## The out-of-context reader test

Before accepting code, ask:

1. Can I tell what product boundary this code is in?
2. Can I tell which entities enter and leave this function?
3. Can I tell which failure mode is expected and which is a defect?
4. Can I tell what must stay stable for downstream packages or the UI?
5. Can I explain the local flow without mentally evaluating nested combinators?

If not, improve names, split the expression, or add a context-bearing comment.

## Comment policy

Comments should carry stable design knowledge:

- source -> target translation;
- caller-visible contract;
- invariant;
- reason a simple-looking alternative is wrong;
- lifecycle, cancellation, ordering, or timeout rule;
- non-guarantee;
- ownership boundary.

Avoid comments that:

- repeat names or syntax;
- say “handle”, “process”, “map”, or “convert” without concrete entities;
- over-explain standard TypeScript;
- compensate for avoidable nesting;
- sound confident about intent not visible in code/tests/docs.

## The right amount of comment

Private helper:

- usually 1-3 sentences;
- name source, target, and invariant if crossing a boundary;
- avoid tutorial tone.

Exported API:

- 1 short summary paragraph;
- optional second paragraph for guarantees, non-guarantees, lifecycle, errors, or cancellation;
- do not leak private implementation details unless callers must account for them.

Large comment is acceptable only when the code encodes a durable architectural decision. If the comment is large because the code is hard to parse, refactor first.

## Refactor patterns

Use these in order:

1. Rename unclear entities.
2. Extract named predicates or mappers.
3. Introduce a small domain type or options object.
4. Split orchestration from translation/mapping.
5. Move boundary-specific logic to the owning package/folder.
6. Add a short context comment for the remaining non-obvious boundary.

Avoid these unless they clearly reduce local complexity:

- generic helper factories;
- deep inheritance or class wrappers;
- over-abstracted “manager” services;
- table dispatch that hides business terms;
- type-level programming for simple runtime values;
- comments that explain every line.
