# Comment templates for Side Chat readability

Use these only when names and structure are not enough. Prefer replacing the bracketed wording with concrete Side Chat terms.

## Boundary mapper

```ts
/**
 * Convert [source-system] [source-entity] into Side Chat's [target-contract].
 *
 * [Hidden detail] stays inside [owning package/boundary]. Downstream packages
 * only receive [stable target fields or guarantees].
 */
```

Example:

```ts
/**
 * Convert AI SDK `tool-error` stream parts into Side Chat's canonical tool activity.
 *
 * The provider/tool exception stays inside `agent-runtime`. Downstream packages
 * only receive the failed activity row and the stable `TOOL_FAILED` protocol code.
 */
```

## Effect/Stream boundary

```ts
/**
 * Run one [product action] through the [private adapter/public port].
 *
 * This remains an Effect Stream because [typed failures/cancellation/streaming]
 * must stay in the workflow until [transport or package boundary].
 */
```

## Invariant

```ts
// Keep [entity/id/order] stable across [event/update]. The widget/core/runtime
// treats it as [contract], so changing it creates [specific failure].
```

## Non-guarantee

```ts
/**
 * Returns [value] for [caller use].
 *
 * The result is [guarantee], but it is not [non-guarantee]. Callers that need
 * [stronger behavior] must use [other API or explicit check].
 */
```

## Deletion candidates

Delete or rewrite comments that say only:

- "handle the request"
- "convert the data"
- "process the event"
- "map to the contract" without naming source and target
- "adapter boundary" without naming which adapter and which downstream contract
- line-by-line explanations of obvious code
