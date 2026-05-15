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
