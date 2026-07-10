# Comment templates

Use these only when names and structure are not enough. Replace every bracketed phrase with concrete local entities.

## Boundary mapper

```ts
/**
 * Convert [source system] [source entity] into [target contract].
 *
 * [Hidden detail] stays inside [owning boundary]. Callers receive only
 * [stable fields or guarantees].
 */
```

Example:

```ts
/**
 * Convert external tool-error parts into the public activity record.
 *
 * The provider exception stays inside the adapter. Callers receive only the
 * stable activity id, safe input metadata, and public error code.
 */
```

## Effect or stream boundary

```ts
/**
 * Run [product action] through [private adapter or public port].
 *
 * The result remains [effect/stream/async abstraction] until [boundary] so
 * [typed failures, cancellation, ordering, or streaming] stay visible.
 */
```

## Invariant

```ts
// Keep [entity, id, or order] stable across [event or update]. Downstream code
// treats it as [contract], so changing it would cause [specific failure].
```

Example:

```ts
// Keep `callId` stable across start, progress, and completion events. The
// consumer merges updates by this id instead of rendering duplicate activities.
```

## Non-guarantee

```ts
/**
 * Returns [value] for [caller use].
 *
 * The result guarantees [behavior], but it does not guarantee [stronger
 * behavior]. Callers that need that behavior must use [explicit API/check].
 */
```

Delete comments that only say “handle,” “convert,” “process,” or “map” without naming source and target entities, or that explain obvious lines one by one.
