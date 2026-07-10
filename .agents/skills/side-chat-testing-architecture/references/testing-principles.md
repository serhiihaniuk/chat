# Testing principles

Use these principles when a test design needs more detail than the main skill provides. Discover the repository's actual package names, public exports, test helpers, commands, and configured libraries before applying an example.

## Protect behavior, not implementation

Start with the behavior a user, caller, package, or operator can observe. Name the contract and its owner. Assert the smallest stable result that proves the behavior.

A resilient test fails when the protected behavior breaks and survives a refactor that preserves that behavior. A fragile test passes while behavior is wrong or fails because an internal helper moved.

Prefer:

- public functions, ports, route responses, protocol values, rendered roles, and visible state;
- deterministic inputs and explicit time or stream control;
- assertions about output, errors, ordering, ownership, and resource cleanup;
- small fixtures that show the behavior under test.

Avoid:

- private helper calls;
- hook-call assertions;
- exact internal object graphs;
- whole-tree snapshots;
- incidental CSS selectors;
- arbitrary timeouts;
- assertion of framework internals.

## Choose test level by risk

Use a unit test for a pure rule, parser, validator, mapper, codec, normalizer, or local error conversion.

Use a contract test when multiple implementations or modules must preserve the same public behavior. Run the same contract against deterministic and persistent implementations when the repository provides both.

Use a component test for user-visible UI behavior through the component's public props and boundary doubles.

Use a service or route test for transport status, request validation, authentication or policy decisions, response encoding, and composition behavior.

Use an integration test when real module collaboration is the risk and a unit test would miss a translation, wiring, or ownership failure.

Use browser automation only for critical browser behavior that lower-level tests cannot prove. Keep the browser suite small and wait for observable state.

## Test boundary ownership

Every representation has an owner. Keep provider-native events, persistence rows, server framework objects, runtime details, and host internals inside their owning module. Assert the normalized public contract at the boundary where it becomes visible.

For a streamed assistant or event-driven system, test each translation separately:

1. provider or external input becomes a normalized internal event;
2. internal state becomes a public protocol event;
3. the browser or consumer turns protocol events into visible state.

Do not combine all translations in one oversized test unless the end-to-end flow itself is the behavior under test.

## Deterministic doubles

Use existing in-memory adapters, fake providers, fake transports, controlled streams, fake host boundaries, fixtures, and builders. If no seam exists, identify the smallest production refactor that creates one.

A fake should preserve the public contract and the failure modes relevant to the test. Do not build a fake that returns an easier shape than the real adapter if that would hide a boundary bug.

Use real persistence or network only in an explicit integration lane. Keep credentials, external state, and test data isolated.

## Async and stream tests

Control time, cancellation, completion, and failure explicitly. Test:

- success and terminal failure;
- cancellation and cleanup;
- client disconnect or consumer cancellation when relevant;
- duplicate, missing, malformed, or out-of-order events;
- backpressure and slow-consumer behavior when the system buffers or drops data;
- retry and idempotency behavior only when implemented by the current code.

Do not use sleeps to hide a race. Use a deferred promise, controlled stream, fake clock, event waiter, or repository-supported polling helper.

## Error and security tests

Test that invalid input fails at the owning boundary, unauthorized data remains inaccessible, and private details do not cross into responses, logs, diagnostics, or protocol events.

For each important failure, assert both the public error and the durable or visible state after the failure. A test that only sees a thrown error may miss a stranded row, leaked resource, or incorrect retry state.

## Test data and fixtures

Name fixtures by the behavior they support. Keep required fields visible. Prefer builders that make invalid states deliberate instead of silently filling every field with plausible defaults.

Avoid global mutable fixtures. Create state inside each test or reset it through the repository's supported lifecycle. Keep timestamps, ids, and randomness deterministic unless nondeterminism is the subject of the test.

## Flakiness diagnosis

When a test flakes, classify the cause before changing it:

- uncontrolled time or scheduler;
- hidden network or persistence;
- shared mutable state;
- race between producer and assertion;
- unstable selector or snapshot;
- leaked resource or unclosed stream;
- order-dependent test setup.

Repair the cause at the test seam. Do not add retries, sleeps, wider timeouts, or weaker assertions without proving why they are correct.

## Coverage and review

Coverage percentage is a signal, not proof. Prioritize public contracts, security boundaries, failure paths, lifecycle transitions, persistence races, and code that is difficult to reason about.

Before finalizing a test, explain what failure it would catch, what it intentionally does not prove, and which repository command verifies it. Keep the explanation close to the test when the reason is non-obvious.

## Reusable test examples

### Name tests as behavior

Prefer names that describe the observable contract:

```ts
it('rejects an unsupported protocol version')
it('maps a policy denial to a forbidden response')
it('renders the failed-send state when the client rejects')
it('normalizes external text deltas into public runtime events')
```

Avoid names such as `works`, `renders`, `calls handler`, or `returns data`. A good name tells a future maintainer why the test exists before they read its setup.

### Arrange, act, assert, cleanup

```ts
it('releases a subscription when the consumer cancels', async () => {
  const subscription = createControlledSubscription()

  const result = await consumeOne(subscription.stream)
  await result.cancel()

  expect(subscription.isClosed()).toBe(true)
})
```

Arrange controlled inputs and resources, act through the public seam, assert the observable result and cleanup, then restore any timers, globals, routes, streams, files, or persistent state changed by the test.

### UI behavior through a fake boundary

```ts
it('shows a send error when the client rejects', async () => {
  const user = userEvent.setup()
  const client = createFakeClient({
    send: vi.fn().mockRejectedValue(new Error('failed')),
  })

  render(<AssistantWidget client={client} />)

  await user.type(screen.getByRole('textbox', { name: /message/i }), 'Hello')
  await user.click(screen.getByRole('button', { name: /send/i }))

  expect(await screen.findByText(/could not send/i)).toBeTruthy()
})
```

Use semantic queries and visible state. Do not assert hook calls, private state, or incidental DOM structure. Use the assertion helpers already configured by the repository; do not assume an extra DOM matcher package.

### Browser-level failure state

```ts
test('shows a recoverable error when the backend fails', async ({ page }) => {
  await page.route('**/api/messages', route =>
    route.fulfill({
      status: 500,
      contentType: 'application/json',
      body: JSON.stringify({ code: 'internal_error' }),
    }),
  )

  await page.goto('/')
  await page.getByRole('textbox', { name: /message/i }).fill('Hello')
  await page.getByRole('button', { name: /send/i }).click()

  await expect(page.getByText(/something went wrong/i)).toBeVisible()
})
```

Use browser routing only for a browser-level state that is difficult to produce through the real test service. Never use arbitrary sleeps to wait for it.

### Time and randomness

When time affects behavior, use the configured fake-clock facility or inject a clock and restore it afterward:

```ts
beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-01-15T12:00:00Z'))
})

afterEach(() => {
  vi.useRealTimers()
})
```

Apply the same discipline to generated ids, random values, locale, timezone, environment variables, storage, and browser globals. Advance timers explicitly when a user-event library requires it.

### Fixtures and snapshots

Good builders produce valid defaults, make important differences obvious, avoid hidden external work, avoid shared mutation, and use product vocabulary:

```ts
const request = createRequest({
  protocolVersion: 'protocol.v1',
  message: 'Hello',
})
```

Prefer this over a large opaque fixture imported from another test. Use snapshots only for stable, intentionally structural output whose diff someone will review. Whole component trees and large generated output are poor snapshot targets.

### Smell-to-fix map

- implementation-detail assertion -> assert public output, state, event, response, or repository result;
- deep mock tree -> replace it with one fake at a stable seam;
- external or database leakage -> assert the normalized domain/public shape outside the owning adapter;
- missing seam -> introduce the smallest port, fake, or controlled adapter needed;
- arbitrary wait -> control time or await observable state;
- unclear legacy behavior -> add a characterization test before refactoring.
