# Comment context-bridge patterns

Use these patterns when names and structure do not give a lower-context reader enough information. Replace placeholders with the repository's actual entities and contracts. The examples are deliberately generic so they can be reused without copying stale paths or package names.

## File-level orientation

```ts
/**
 * A <workflow> sees <outside system> through this <local contract/menu>.
 *
 * Each capability performs one job required by the workflow: <job one>,
 * <job two>, or <job three>. Composition binds them to concrete adapters, so
 * this file coordinates the contract but does not own <outside details>.
 * Update this comment when the workflow gains or loses a capability or when a
 * capability moves across a boundary.
 */
```

## Spine function

```ts
/**
 * Prepare the inputs needed before <next lifecycle boundary>.
 *
 * Authorization, policy, and adapter selection are settled here. The external
 * operation has not started yet, so preparation failures cannot look like a
 * partial response to the caller.
 */
```

Stage comments should name what becomes true before the next step:

```ts
// Prove authorization before private data or external work is exposed.
const authorization = checkAuthorization(input)

// Select the adapter after the request is validated.
const adapter = selectAdapter(authorization, configuration)

// Keep only the capabilities admitted for this operation.
const capabilities = selectCapabilities(adapter, policy)
```

## Boundary mapper

```ts
/**
 * Convert <source system/entity> into <target contract>.
 *
 * <Sensitive or vendor detail> stays inside <owning boundary>; callers receive
 * only <stable fields, identity, or error code>.
 */
```

Concrete generic example:

```ts
/**
 * Convert an external tool-error part into the public tool-activity record.
 *
 * The provider exception stays inside the adapter; downstream callers receive
 * one failed activity, its stable call id, and a safe public error code.
 */
```

## Context privacy

```ts
/**
 * Select the prior records admitted for the next operation.
 *
 * The input is already authorized. This function applies the configured
 * admission policy and records safe ids and reasons without copying private
 * content into diagnostics.
 */
```

## Diagnostics privacy

```ts
/**
 * Report safe status for the configured capability.
 *
 * Diagnostics may expose names, counts, and adapter state. They must not expose
 * credentials, private records, retrieved content, or raw external errors.
 */
```

## Stable identity

```ts
// Keep `callId` as the activity id. One external operation may emit several
// parts, and the consumer must update one activity instead of rendering duplicates.
```

## Effect or stream boundary

```ts
/**
 * Run one assistant turn through the private provider adapter.
 *
 * Keep the result in the repository's effect/stream abstraction until the
 * transport boundary so typed failures, cancellation, and event ordering stay
 * visible to the workflow.
 */
```

## Non-guarantee

```ts
/**
 * Returns the prepared provider request for the next execution stage.
 *
 * The request has passed input normalization, but this function does not make
 * policy decisions or authorize capabilities; those checks happen earlier.
 */
```

## Deletion candidate

Delete comments that only narrate syntax. If a comment is needed, explain the contract, hidden detail, or invariant that the code cannot carry by itself.
