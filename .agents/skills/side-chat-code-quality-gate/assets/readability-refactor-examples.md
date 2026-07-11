# Readability refactor examples

These examples target code that is correct but forces a maintainer to reconstruct too much context. Adapt them to the repository's actual types and APIs. They illustrate a shape, not a dependency or package contract.

## Example 1: nested stream expression

Problem shape:

```ts
/**
 * The external stream must not open until request preparation succeeds.
 * Keeping the boundary in one expression makes that lifecycle easy to miss.
 */
const publicEvents = normalizeExternalStream(
  openExternalStream(prepareExecution(state, request)),
)
```

What is wrong:

- the important domain steps are anonymous;
- the reader must unpack preparation, stream opening, and normalization at the same time;
- the expression does not show where external details stop being visible.

Preferred shape:

```ts
const execution = prepareExecution(state, request)
const externalStream = openExternalStream(execution)
const publicEvents = normalizeExternalStream(externalStream)
```

Why this is better:

- preparation, stream opening, normalization, and publication are visible stages;
- the domain operations have names instead of being hidden inside a nested call;
- the boundary is visible, so provider details do not leak into the public result.

Do not mechanically apply this exact diff if the surrounding code would become worse. Extract only the steps that reduce context load.

## Example 2: context-gap comment

Weak:

```ts
/** Convert a failure into the runtime activity contract. */
```

Stronger:

```ts
/**
 * Convert an external tool failure into the public activity record.
 *
 * The raw exception stays inside the adapter; callers receive a failed record
 * and a stable public error code.
 */
```

Name the source, target, owner, and downstream guarantee. The comment should not explain ordinary syntax.

## Example 3: comment versus structure

Bad:

```ts
// Prepare the request and open the external stream.
const stream = normalizeExternalStream(openExternalStream(prepareExecution(state, request)))
```

Better:

```ts
const execution = prepareExecution(state, request)
const preparedStream = openExternalStream(execution)
const stream = normalizeExternalStream(preparedStream)
```

Named stages are stronger than a comment that labels a dense expression. If the expression still mixes policy, mapping, transport, and cleanup, split by responsibility rather than by line count.

## Example 4: boundary mapping with stable identity

Problem shape:

```ts
const activity = mapPart(part)
```

Preferred shape:

```ts
const externalFailurePart = part
const publicActivity = mapExternalFailureToActivity({
  callId: externalFailurePart.callId,
  safeCode: toPublicErrorCode(externalFailurePart.error),
})
```

The names show which representation is private, which representation is public, and which identity must survive the translation.
