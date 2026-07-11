# AI readability gate

AI-generated code can pass syntax and lint checks while remaining difficult for a human maintainer to understand. Hold it to the local repository's configured thresholds and a lower human cognitive-load target.

## Human-level bar

The target is not “the model can still reason about it.” The target is that a maintainer can keep the local story in working memory.

For generated code, inspect deeply nested expressions, anonymous domain callbacks, conditional object spreads, type tricks, generic factories used once, functions with several reasons to change, and files that mix orchestration with mapping, policy, rendering, or fixtures.

For stream and SDK-heavy code, a few extra local variables are usually cheaper than one compressed expression that requires global context:

```ts
const execution = createExecution(state, request)
const externalStream = openExternalStream(execution)
const publicEvents = Stream.map(externalStream, normalizeExternalEvent)
```

The exact operators may differ, but the stages should remain visible: prepare, open, normalize, and publish.

## Term tracking

Terms such as runtime, provider, tool, activity, protocol, event, stream, turn, context, adapter, contract, part, request, result, and source are ambiguous outside their boundary. A name or comment should say which side of the boundary the term belongs to.

Prefer names such as:

- `externalToolErrorPart`;
- `runtimeToolActivity`;
- `publicProtocolEvent`;
- `providerRequest`;
- `preparedTurn`;
- `hostCommandResult`.

Avoid bare names such as `part`, `event`, `data`, `result`, or `adapter` in boundary-heavy code.

## Out-of-context reader test

Ask:

1. Can I tell which product or technical boundary this code belongs to?
2. Can I tell which entities enter and leave the function?
3. Can I tell which failure is expected and which is a defect?
4. Can I tell what must stay stable for downstream callers?
5. Can I explain the local flow without evaluating nested combinators?

If not, improve names, split the expression, or add a context-bearing comment.

## Comment policy

Comments should carry stable design knowledge: source-to-target translation, caller-visible contract, invariant, reason a simpler alternative is wrong, lifecycle or cancellation rule, ordering, timeout, ownership, or non-guarantee.

Avoid comments that repeat syntax, use vague verbs without concrete entities, over-explain standard language behavior, compensate for avoidable nesting, or claim intent not supported by current code, tests, or docs.

Weak:

```ts
/** Convert the data to the contract. */
```

Stronger:

```ts
/**
 * Convert external error parts into the public activity record.
 *
 * Raw exceptions stay inside the adapter; callers receive a stable id and safe
 * error code that can be rendered without exposing provider details.
 */
```

## Refactor order

1. Rename unclear entities.
2. Extract named predicates or mappers.
3. Introduce a small domain type or options object when it reduces concepts.
4. Split orchestration from translation.
5. Move boundary-specific logic to its owning module.
6. Add a short context comment for the remaining non-obvious rule.

Reject generic factories, deep wrappers, manager services, hidden table dispatch, type-level programming for simple runtime values, and line-by-line comments unless they clearly reduce future change cost.
