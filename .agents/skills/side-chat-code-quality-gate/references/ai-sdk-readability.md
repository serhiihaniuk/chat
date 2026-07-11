# Stream and SDK readability

Use this reference when a boundary combines streams, an AI SDK, a provider adapter, tools, or protocol mapping. Discover the repository's actual module names and public contracts before applying these patterns.

## Local mental model

A reader should be able to reconstruct the local path without simulating the entire application:

```txt
prepare the allowed request
-> resolve the execution adapter and tools
-> open the provider or external stream
-> normalize external parts into internal events
-> map internal events into the public contract
-> render or persist the public result
```

If code or comments force the reader to infer this chain from vague terms, improve names, extract a boundary step, or add a short context bridge comment.

## Failure model

Keep expected validation, provider, persistence, policy, and tool failures distinct from unexpected failures. Boundary handlers may normalize unexpected failures as a safety net, but they must not make ordinary failure semantics invisible.

A useful local comment says where conversion happens and what representation downstream callers receive.

## External-to-internal mapping

Keep provider-native or framework-native parts inside the adapter that owns them. Normalize them once into the repository's stable internal event or domain shape.

Preserve the stable identity, sequence, ordering, cancellation, and terminal-state rules defined by the public contract. Do not invent a second mapper in a downstream package.

For a multi-part external operation, a generic mapping table might be:

```txt
external-start  -> one running public activity with empty input
external-call   -> the same activity with completed input
external-result -> the same activity completed with safe output
external-error  -> the same activity failed with a public error code
```

The operation id is the stable identity. Several external parts may update one public activity; creating a new id for every part causes duplicate rows.

## Dense pipeline smell

Flag one expression that combines request preparation, adapter selection, tool selection, stream opening, external-part mapping, and public-protocol mapping.

Prefer named steps:

```ts
const execution = createExecution(state, request)
const externalStream = openExternalStream(execution)
const internalEvents = normalizeExternalStream(externalStream)

return mapToPublicEvents(internalEvents)
```

Use the shape only when it reduces cognitive load more than it increases navigation.

Avoid helper names such as `handle`, `process`, `map`, or `run` when the boundary can be named directly, for example `normalizeExternalEvents` or `mapActivityToPublicEvent`.

## Review questions

1. Which module owns this decision?
2. What representation enters this function?
3. What representation leaves it?
4. Which identity, order, cancellation, and failure rules are preserved?
5. Which external details must stay private?
6. Is the expected failure behavior visible?
7. Would a reader outside the current change understand the local sequence?
