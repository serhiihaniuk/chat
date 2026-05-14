import { expect, test } from '@playwright/test'
test('embedded host imports public widget and shows launcher', async ({ page }) => { await page.goto('/'); await expect(page.getByRole('heading', { name: 'Revenue Dashboard' })).toBeVisible(); await expect(page.getByRole('button', { name: /open assistant/i })).toBeVisible() })
