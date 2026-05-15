import { expect, test } from '@playwright/test'

test('embedded host imports public widget and shows launcher', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Revenue Dashboard' })).toBeVisible()
  await expect(page.getByRole('button', { name: /open assistant/i })).toBeVisible()
})

test('embedded widget streams markdown from backend through Streamdown', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: /open assistant/i }).click()
  await expect(page.getByTestId('side-chat-widget')).toBeVisible()

  await page.getByLabel('chat-input').fill('summarize markdown')

  const streamResponse = page.waitForResponse((response) => (
    response.url().includes('/chat/stream') && response.status() === 200
  ))
  await page.getByRole('button', { name: /^send$/i }).click()
  await streamResponse

  await expect(page.getByRole('heading', { name: 'Assistant answer' })).toBeVisible()
  await expect(page.getByText(/Model gpt-4\.1-mini received: summarize markdown/)).toBeVisible()
  await expect(page.getByText('deterministic mocked streaming')).toBeVisible()
  await expect(page.getByText('markdown-ready output')).toBeVisible()
  await expect(page.getByText('Tokens: 20')).toBeVisible()
})

test('embedded widget loads seeded history when opening conversation by id', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: /open assistant/i }).click()

  await page.getByLabel('chat-input').fill('seed me once')
  const streamResponse = page.waitForResponse((response) => (
    response.url().includes('/chat/stream') && response.status() === 200
  ))
  await page.getByRole('button', { name: /^send$/i }).click()
  await streamResponse

  await expect(page.getByText(/Model gpt-4\.1-mini received: seed me once/)).toBeVisible()

  const historyResponse = page.waitForResponse((response) => response.url().includes('/chat/history') && response.status() === 200)
  await page.reload()
  await page.getByRole('button', { name: /open assistant/i }).click()
  await historyResponse

  await expect(page.locator('[data-role="user"]').getByText('seed me once')).toBeVisible()
  await expect(page.locator('[data-role="assistant"]').getByText(/markdown-ready output|deterministic mocked streaming/).first()).toBeVisible()
})

test('embedded widget surfaces retry control on stream failure', async ({ page }) => {
  await page.route('**/chat/stream', (route) => route.abort('failed'))

  await page.goto('/')
  await page.getByRole('button', { name: /open assistant/i }).click()

  await page.getByLabel('chat-input').fill('retryable message')
  await page.getByRole('button', { name: /^send$/i }).click()

  await expect(page.getByRole('alert')).toBeVisible()
  const retryButton = page.getByRole('button', { name: /^retry$/i })
  await expect(retryButton).toBeVisible()

  await page.unroute('**/chat/stream')
  const streamResponse = page.waitForResponse((response) => (
    response.url().includes('/chat/stream') && response.status() === 200
  ))
  await retryButton.click()
  await page.getByLabel('chat-input').waitFor({ state: 'visible' })
  await streamResponse

  await expect(page.getByRole('alert')).not.toBeVisible()
  await expect(page.locator('[data-role="user"]').getByText('retryable message')).toBeVisible()
  await expect(page.getByText(/Model gpt-4\.1-mini received: retryable message/)).toBeVisible()

  await page.unroute('**/chat/stream')
})
