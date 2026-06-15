# Comment Context Bridge Patterns

Use these when a comment must help a reader who does not know the whole Side Chat context.
Use source, target, hidden detail, and invariant as drafting questions. Do not
paste `Source:`, `Target:`, or `Invariant:` labels into code unless that labeled
shape is clearer than prose in the local file.

## Spine function

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

Stage comments should name what the step makes true before the next step:

```ts
// Pick the instructions and usual defaults before applying request choices.
const profile = resolveProfile(state.profiles, request.profileId);

// Choose the execution engine before any provider stream can open.
const executor = resolveAgentExecutor(state.executors, request);

// Keep only the tools selected for this turn.
const tools = selectRuntimeTools(state.tools, profile, request);
```

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
 * AI SDK parts may contain provider or tool exceptions. Those raw values stay
 * inside `agent-runtime`; downstream packages receive only a failed activity,
 * the stable `TOOL_FAILED` code, and safe metadata they can render or persist.
 */
```

## Context privacy

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

## Diagnostics privacy

```ts
/**
 * Report whether configured capabilities are safe for this service profile.
 *
 * Health output may expose capability names, ids, counts, and adapter status.
 * It must not expose credentials, provider options, memory records, retrieved
 * content, or raw tool/provider errors.
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
