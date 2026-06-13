# Comment Context Bridge Patterns

Use these when a comment must help a reader who does not know the whole Side Chat context.

## Boundary mapper

```ts
/**
 * Convert <source-system> <source-entity> into <target-contract>.
 *
 * <Hidden detail> stays inside <owning boundary>; downstream code only receives
 * <stable fields, identity, or error code>.
 */
```

Concrete example:

```ts
/**
 * Convert AI SDK `tool-error` stream parts into Side Chat's tool activity row.
 *
 * The thrown provider/tool value stays inside `agent-runtime`; downstream
 * packages only receive a failed activity and the stable `TOOL_FAILED` code.
 */
```

## Stable identity

```ts
// Keep `toolCallId` as the activity id. AI SDK emits multiple parts for one
// tool call, and the widget must update one row rather than render duplicates.
```

## Effect boundary

```ts
/**
 * Run one assistant turn through the private AI SDK adapter.
 *
 * The result stays as an Effect Stream so provider failures, cancellation, and
 * runtime defects are normalized before the HTTP/SSE boundary sees them.
 */
```

## Non-guarantee

```ts
/**
 * Returns the model-facing provider request for this turn.
 *
 * The request is ready for AI SDK execution, but it is not a policy decision;
 * tool exposure and context selection must already be resolved before this step.
 */
```

## Deletion candidates

Delete comments like:

```ts
// Set failed status.
status: ACTIVITY_STATUS_FAILED,
```

The code already says that. If a comment is needed, explain why failure becomes a protocol-safe code or why the raw error is hidden.
