# Generic testing examples

Use these as shapes, not as exact code. Discover the repository's actual names, builders, matchers, and test runner before adapting an example. Keep the examples generic; the current repository supplies the real paths and commands.

## Contract test for interchangeable implementations

```ts
const repositoryContract = (createRepository: () => ConversationRepository) => {
  it('saves and reads a conversation by id', async () => {
    const repository = createRepository()
    const conversation = createConversation({ id: 'conversation-1' })

    await repository.save(conversation)

    expect(await repository.findById(conversation.id)).toEqual(conversation)
  })
}

describe('in-memory conversation repository', () => {
  repositoryContract(() => createMemoryConversationRepository())
})
```

The same contract can run against a slower opt-in persistent implementation when the repository provides one. This catches fake drift without forcing every ordinary test to use a real database. Do not create contract suites for trivial one-off stubs.

## Component test with a fake boundary

```ts
it('renders the failed-send state when the client rejects', async () => {
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

This verifies visible behavior, controls the boundary, and avoids hook calls or internal state assertions. It also avoids assuming a particular DOM assertion extension: use matchers that the repository actually configures.

## Protocol validator test

```ts
it('rejects an unsupported protocol version', () => {
  const result = validateRequest(
    createRequest({ protocolVersion: 'protocol.v0' }),
  )

  expect(result.ok).toBe(false)
})
```

Protect the versioned public contract through its validator. Do not involve the service, database, UI, or provider unless that collaboration is the behavior under test.

## Runtime normalization test

```ts
it('normalizes provider text deltas into runtime events', () => {
  const events = normalizeProviderEvents([
    createProviderTextDelta({ text: 'Hello' }),
  ])

  expect(events).toEqual([
    createRuntimeTextDelta({ text: 'Hello' }),
  ])
})
```

Keep provider-native shapes inside the provider adapter test. Assert the normalized event through the public runtime contract.

## Service boundary test

```ts
it('maps policy denial to a forbidden response', async () => {
  const app = createServiceApp({
    repository: createMemoryRepository(),
    provider: createFakeProvider(),
    policy: createDenyAllPolicy(),
  })

  const response = await app.request('/v1/chat', {
    method: 'POST',
    body: JSON.stringify(createRequest()),
  })

  expect(response.status).toBe(403)
  expect((await response.json()).code).toBe('policy_denied')
})
```

Assert the transport contract, not the framework's internal object graph. If the route also persists state, assert the public response and the repository's observable state separately. Do not assert framework request objects or database rows outside their owning adapter tests.

## Browser harness test

```ts
test('shows an error when the stream fails', async ({ page }) => {
  await page.route('**/v1/chat', route =>
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

Use browser automation only for browser-level behavior. Prefer semantic locators and observable state over arbitrary sleeps. Use route interception for hard-to-reach browser states such as a backend failure, malformed stream, or policy denial; do not use it to compensate for a missing unit or service seam.

## Characterization test before a legacy refactor

```ts
describe('legacy decoder characterization', () => {
  it('keeps empty text deltas as empty strings', () => {
    expect(decodeChunk(createLegacyEmptyDelta())).toEqual(
      createRuntimeTextDelta({ text: '' }),
    )
  })
})
```

Capture unclear current behavior before refactoring behind the safety net. The test is temporary only if the behavior is intentionally changed later; once the desired contract is known, rewrite it as a normal behavior test.
