# Testing Principles

## Research-backed principles

Use the testing literature as strong guidance, not dogma.

Durable principles:

- Verify behavior through stable public seams.
- Prefer state/output/user-visible effects over internal interaction checks.
- Control non-determinism explicitly.
- Prefer fakes and ports over deep mock trees.
- Use characterization tests before refactoring unclear legacy behavior.
- Treat test smells as maintainability risks, not style complaints.
- Say when a requested “unit test” is really a contract, integration, service, or E2E test.

TDD is useful when behavior is clear enough to specify before implementation, but it is not mandatory for exploratory work. Use red-green-refactor when it helps; otherwise write tests as soon as behavior stabilizes.

## Compact glossary

SUT:
System under test. The package, function, service, component, route, adapter, or harness behavior being exercised.

Fixture:
The test data and environment needed before the behavior can be exercised.

Dummy:
A value passed only because an API requires it. It is not used.

Stub:
A dependency that returns predefined data.

Fake:
A simplified working implementation, such as a memory repository or fake provider.

Spy:
A double that records calls for later inspection.

Mock:
A double with expectations about interactions. Use sparingly.

Characterization test:
A test that captures current behavior before changing unclear or legacy code.

## Test portfolio heuristic

Use many fast unit/component/contract tests, fewer integration/service tests, and very few Playwright E2E tests.

This is a portfolio heuristic, not a law. If the main risk is a package boundary, prefer a contract test. If the main risk is collaboration between real packages, prefer an integration test. If the main risk is browser behavior in the harness, use Playwright.

## State over interaction

Prefer final state, output, normalized event, protocol DTO, rendered UI, HTTP response, or repository result over internal call counts.

Interaction assertions are acceptable when the interaction is the public contract:

- host bridge command emitted
- analytics/audit event emitted, if such boundary exists
- runtime tool invoked as part of public runtime behavior
- repository port called with a domain object in a core use-case test
- API client receives a `sidechat.v1` request payload

Avoid asserting:

- internal helper was called
- React hook was called
- exact provider SDK method was called outside adapter tests
- exact Hono implementation detail outside route tests
- exact Drizzle call outside DB adapter tests

## FIRST + determinism

Tests should be:

Fast:
Ordinary tests should not use real networks, real Postgres, arbitrary sleeps, or full browser flows.

Independent:
Tests should not depend on execution order or shared mutable state.

Repeatable:
Tests should not depend on current date, timezone, locale, unseeded randomness, external services, or machine-specific environment.

Self-validating:
Tests must pass or fail automatically. No manual inspection of logs, screenshots, console output, or generated files.

Timely:
Tests should be written near the behavior change while intent is still known.

Extra rule:
Time, randomness, network, environment variables, browser APIs, provider behavior, DB state, and global singletons are volatility sources. Control them explicitly.

## Test shape

Prefer Arrange, Act, Assert, with cleanup when globals/timers/mocks are involved.

Arrange:
Create inputs, fixtures, fake ports, fake providers, memory repositories, fake host bridge, and protocol fixtures.

Act:
Execute the behavior once.

Assert:
Check the public result, protocol event, rendered UI, HTTP response, or repository state.

Cleanup:
Restore timers, globals, mocks, DB state, network routes, and filesystem artifacts when used.

## Naming tests

Name tests as behavior specifications.

Good:

```ts
it('rejects a chat request when the protocol version is unsupported')
it('decodes assistant delta events from an SSE stream')
it('maps policy denial to a forbidden protocol error')
it('renders the failed-send state when the chat client rejects')
it('normalizes provider text deltas into runtime events')
it('persists and reads conversations through the repository contract')
```

Bad:

```ts
it('works')
it('renders')
it('calls handler')
it('uses service')
it('returns data')
```

## React widget testing rules

Test like a user of the embeddable widget, not like an inspector of React internals.

Prefer queries in this order:

1. `getByRole`
2. `getByLabelText`
3. `getByPlaceholderText` when appropriate
4. `getByText`
5. `getByDisplayValue`
6. `getByTestId` only when no semantic query makes sense

Use `userEvent.setup()` for realistic interaction.

Avoid CSS selectors and DOM structure assertions unless structure is the public contract.

For async UI:

- use `findBy...` when an element should appear later
- use `queryBy...` when asserting absence
- use `waitFor` when waiting for an async state transition
- use `waitForElementToBeRemoved` or `waitFor` when something disappears asynchronously
- avoid arbitrary sleeps
- assert visible outcomes, not internal promises

jest-dom is not part of the repo’s default test setup. Do not generate `toBeInTheDocument`, `toHaveTextContent`, `toBeVisible`, or other jest-dom matchers unless the user shows that a specific package config enables them. Prefer Vitest-compatible assertions already available in the repo, such as truthiness/null checks, `textContent`, DOM properties, or existing local assertion helpers.

## Static widget render tests

`renderToStaticMarkup` may be used for simple widget render or markup/a11y smoke checks when the repo already uses that style.

Use it for:

- basic markup smoke tests
- simple static render states
- checking obvious accessible attributes in static output

Do not use it for:

- interactive behavior
- async UI
- streaming states
- realistic user flows

For interactions, use Testing Library or Playwright harness tests.

## Playwright harness rules

Use Playwright for browser-level confidence in `test-harness/widget-harness`.

Never use arbitrary sleeps:

```ts
await page.waitForTimeout(1000)
```

Prefer semantic locators and web-first assertions:

```ts
await page.getByRole('textbox', { name: /message/i }).fill('Hello')
await page.getByRole('button', { name: /send/i }).click()
await expect(page.getByText(/assistant response/i)).toBeVisible()
```

Use `page.route()` only for hard-to-reach browser-level states:

- backend 500 response
- slow stream
- malformed stream
- auth/policy failure
- empty stream

Do not use Playwright routing to compensate for poor unit/service seams.

## Vitest rules

Use Vitest as the default runner for unit, contract, service, and integration tests.

Recommended defaults should match the repo’s actual config. Do not invent setup files or assertion libraries.

Prefer:

- explicit imports from Vitest unless repo convention differs
- isolated tests
- deterministic fake timers where time matters
- colocated `*.test.ts` / `*.test.tsx` beside source
- shared builders from `packages/testing` when they reduce noise

Be careful with setup files because modules imported there can be cached before individual tests mock them.

## user-event and fake timers

When fake timers are active and user-event is used, wire timer advancement explicitly if the repo’s user-event version supports it.

```ts
const user = userEvent.setup({
  advanceTimers: vi.advanceTimersByTime,
})
```

Always restore real timers after the test. Do not mix real waiting with fake timers unless there is a clear reason.

## Time, randomness, and globals

Never let tests depend on real time when time affects behavior.

Use fake timers, fixed system time, or an injected clock.

```ts
beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-05-25T12:00:00Z'))
})

afterEach(() => {
  vi.useRealTimers()
})
```

Control or inject:

- `Date.now`
- `new Date()`
- timers
- `crypto.randomUUID()`
- `Math.random()`
- environment variables
- localStorage/sessionStorage
- browser globals
- provider IDs
- generated message IDs

Restore modified globals after each test.

## Data builders and fixtures

Use `packages/testing` builders and protocol helpers when available.

Good builders:

- produce valid defaults
- make important differences obvious
- avoid hidden external dependencies
- avoid mutation shared across tests
- encode product vocabulary, not random mock data

Avoid huge opaque Object Mother fixtures.

Prefer:

```ts
const request = createChatRequest({
  protocolVersion: 'sidechat.v1',
  message: 'Hello',
})
```

Over:

```ts
const request = hugeFixtureFromAnotherTest
```

## Snapshot policy

Snapshots are allowed only when the output is stable, intentionally structural, and the diff is meaningful.

Good candidates:

- small protocol fixture snapshots
- generated schema snapshots if reviewed deliberately
- compact static markup snapshots when already accepted by the repo

Bad candidates:

- whole React trees
- provider-native events
- large generated output nobody reviews
- snapshots replacing explicit behavior assertions

A snapshot that nobody reads is not a useful test.

## Coverage policy

Coverage is a signal, not a goal.

Prefer covering:

- protocol validation branches
- SSE decode/encode failure paths
- policy denial paths
- typed error mapping
- runtime event normalization edge cases
- repository contract edge cases
- widget error/loading/disabled states
- service auth/config/persistence failures

Avoid meaningless tests just to hit line coverage.

## Fragile test smells

Call out and fix these smells:

- testing implementation details
- asserting private/helper/hook calls
- mocking every module in a dependency chain
- snapshot-only tests
- CSS selector queries
- exact DOM structure assertions
- real network calls in ordinary tests
- real Postgres in non-opt-in tests
- arbitrary sleeps
- uncontrolled dates/timers/randomness
- uncontrolled timezone/locale
- shared mutable fixtures
- giant opaque fixtures
- tests that pass only when run alone
- provider-native event assertions outside `agent-runtime`
- DB row assertions outside `packages/db`
- Hono object assertions outside service route tests
- protocol tests that include non-`sidechat.v1` shapes
- Playwright tests using `.locator('.btn-primary')` instead of semantic locators

## Smell to refactor map

Implementation-detail assertion: Replace helper/hook call assertions with public output, protocol DTO/event, rendered UI, HTTP response, or repository state.

Deep mock tree: Replace many mocks with one fake at a stable package boundary.

Protocol leakage: Move provider/DB/HTTP-specific assertions into the owning package and assert `sidechat.v1` at public boundaries.

Provider-native leakage: Assert normalized runtime events outside provider adapter tests.

DB leakage: Assert repository/domain objects outside `packages/db`, not Drizzle rows.

Missing seam: Introduce a minimal port, adapter, fake provider, fake repository, fake transport, or fake host bridge.

Real time / arbitrary wait: Use fake timers in Vitest tests and web-first assertions in Playwright.

Escaping network: Use fake transport/service, in-process route tests, or Playwright route only at E2E level.

Legacy refactor without tests: Add characterization tests first.
