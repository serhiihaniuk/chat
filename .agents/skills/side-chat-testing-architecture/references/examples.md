# Side Chat Testing Examples

Use these examples as patterns, not as exact code to paste. Prefer existing repo helpers, builders, and naming conventions.

## Contract test for a repository fake

Use shared contract tests when a fake stands in for an important implementation.

```ts
const repositoryContract = (createRepository: () => ConversationRepository) => {
  it('saves and reads a conversation by id', async () => {
    const repository = createRepository()

    await repository.save(createConversation({ id: 'conversation-1' }))

    expect(await repository.findById('conversation-1')).toEqual(
      createConversation({ id: 'conversation-1' })
    )
  })
}

describe('memory conversation repository', () => {
  repositoryContract(() => createMemoryConversationRepository())
})

// A slower opt-in DB suite can run the same contract against Postgres.
```

Use contract tests where fake drift would create false confidence. Do not overdo them for tiny one-off stubs.

## Widget component test with fake chat client

```ts
it('renders the failed-send state when the chat client rejects', async () => {
  const user = userEvent.setup()
  const chatClient = createFakeChatClient({
    sendMessage: vi.fn().mockRejectedValue(new Error('failed')),
  })

  render(<SideChatWidget chatClient={chatClient} />)

  await user.type(screen.getByRole('textbox', { name: /message/i }), 'Hello')
  await user.click(screen.getByRole('button', { name: /send/i }))

  const error = await screen.findByText(/could not send/i)
  expect(error).toBeTruthy()
})
```

Why this is resilient:

- It verifies visible widget behavior.
- It controls the chat-client seam.
- It does not assert hook calls or internal React state.
- It does not assume jest-dom matchers.

## Protocol validator unit test

```ts
it('rejects a chat request when the protocol version is unsupported', () => {
  const result = validateChatRequest(
    createChatRequest({ protocolVersion: 'sidechat.v0' })
  )

  expect(result.ok).toBe(false)
})
```

Why this is resilient:

- It protects the `sidechat.v1` contract.
- It tests the validator through its public result.
- It does not depend on service, DB, widget, or provider internals.

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

Why this is resilient:

- Provider-native shape is contained inside `agent-runtime`.
- Public assertions use normalized runtime events.
- It protects the boundary that prevents provider leakage.

## Service route test with memory repository and fake provider

```ts
it('maps policy denial to a forbidden protocol error', async () => {
  const app = createPartnerAiServiceApp({
    conversationRepository: createMemoryConversationRepository(),
    provider: createFakeProvider(),
    policy: createDenyAllPolicy(),
  })

  const response = await app.request('/v1/chat', {
    method: 'POST',
    body: JSON.stringify(createChatRequest()),
  })

  expect(response.status).toBe(403)

  const body = await response.json()
  expect(body.code).toBe('policy_denied')
})
```

Why this is resilient:

- It asserts HTTP/protocol behavior.
- It uses memory repository and fake provider.
- It does not assert Hono internals.

## Playwright harness test

```ts
test('shows an error when the backend stream fails', async ({ page }) => {
  await page.route('**/v1/chat', route => {
    return route.fulfill({
      status: 500,
      contentType: 'application/json',
      body: JSON.stringify({ code: 'internal_error' }),
    })
  })

  await page.goto('/')

  await page.getByRole('textbox', { name: /message/i }).fill('Hello')
  await page.getByRole('button', { name: /send/i }).click()

  await expect(page.getByText(/something went wrong/i)).toBeVisible()
})
```

Why this is resilient:

- It uses Playwright only for a browser-level failure state.
- It uses semantic locators.
- It avoids arbitrary sleeps.
- It uses route interception only for a hard-to-reach edge case.

## Characterization test before legacy refactor

```ts
describe('legacy stream decoder characterization', () => {
  it('keeps empty text deltas as empty strings', () => {
    expect(decodeStreamChunk(createLegacyEmptyDelta())).toEqual(
      createRuntimeTextDelta({ text: '' })
    )
  })
})
```

Use this when behavior is unclear. First capture current behavior, then refactor behind that safety net.
