# Comment Templates

Use these as patterns. Replace placeholders with facts from the codebase. Do not paste a template if the facts are not known.

## Public function or method

```ts
/**
 * <Does one caller-visible job>.
 *
 * <Important guarantee or non-guarantee>. <Side effect, error, timing, or
 * lifecycle rule when relevant>.
 */
```

## React hook

```ts
/**
 * Provides <state/capability> for <consumer/context>.
 *
 * The hook <subscribes/caches/schedules/mutates> <thing>. Callers must <cleanup
 * rule / stable input rule / rendering constraint>.
 */
```

## React component

```tsx
/**
 * Renders <UI abstraction> for <domain object or state>.
 *
 * This component owns <local state/side effect> but does not <non-guarantee>.
 */
```

## Inline invariant

```ts
// Keep <condition> true while <operation/lifecycle> is active; otherwise
// <specific failure mode>.
```

## Async race

```ts
// Only the latest request may update state. Older responses can resolve later
// and must be ignored to avoid showing stale data.
```

## Stable ordering

```ts
// Preserve input order as the final tie-breaker so equal items do not move
// between renders.
```

## External quirk

```ts
// <Platform/API> reports <surprising behavior>, so <workaround> keeps
// <observable contract> stable.
```

## Performance trade-off

```ts
// Cache by <key> because <operation> is expensive and inputs are immutable for
// the lifetime of <scope>.
```

## Non-guarantee

```ts
// This value is for display only. Do not use it as an identifier; it is not
// unique and may change when profile data is refreshed.
```

## TODO with removal trigger

```ts
// TODO: Remove <fallback/workaround> after <condition/event>. Until then,
// <reason it must remain>.
```
