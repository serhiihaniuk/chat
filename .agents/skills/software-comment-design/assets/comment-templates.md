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

## File-level orientation

Use this only for concept-dense files. Do not add it to simple leaf files,
barrels, or tiny helpers. The first line must state the file's mental model, not
the visible declaration category.

```ts
/**
 * A core assistant turn sees the host app through this capability menu.
 *
 * Each service names one job the host can perform for the workflow: persist
 * conversation and assistant-turn state, publish host capabilities, resolve
 * policy and guards, prepare context and memory, run the model-side runtime,
 * mint ids and timestamps, enforce request policy, and emit observability.
 * The Effect Layer binds these jobs to real app adapters at composition time, so
 * partner-ai-core can coordinate the turn without importing HTTP, database,
 * provider, or tool-adapter packages.
 *
 * Update this comment when the core workflow gains or loses an app-supplied
 * capability, or when a capability's job moves across package boundaries.
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

## Checklist to prose

Use source, target, invariant, privacy, and non-guarantee as drafting notes.
Do not paste those labels into code unless the surrounding file already uses a
labeled contract style and the labels are clearer than sentences.

Better:

```ts
/**
 * Select prior conversation messages for the next assistant turn.
 *
 * The input is already authorized and model-safe; this function only decides
 * which messages are admitted under the configured history policy. Disabled
 * modes return no messages, admitted messages keep repository order, and the
 * manifest records ids, order, token estimates, and drop reasons without
 * copying message text.
 */
```

Worse:

```ts
/**
 * Source: prior conversation messages.
 * Target: runtime messages plus manifest.
 * Invariant: message content never enters the manifest.
 */
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

## AI/runtime lifecycle

```ts
/**
 * Prepare the runtime-side inputs needed before model streaming starts.
 *
 * Profile defaults, executor choice, provider/model selection, tool exposure,
 * and final messages are resolved here. The provider stream is not opened until
 * this returns, so selection failures stay pre-stream and never look like a
 * partial model response.
 */
```

## AI boundary with hidden detail

```ts
/**
 * Convert AI SDK `tool-error` stream parts into the public tool activity row.
 *
 * AI SDK parts may contain provider or tool exceptions. Those raw values stay
 * inside the runtime boundary; downstream packages receive only a failed
 * activity, stable failure code, and safe metadata they can render or persist.
 */
```

## TODO with removal trigger

```ts
// TODO: Remove <fallback/workaround> after <condition/event>. Until then,
// <reason it must remain>.
```
