import { expect, test } from "playwright/test";

test("runs the widget harness in a browser with deterministic mock streaming", async ({ page }) => {
  await page.goto("/?mode=mock-stream");

  await expect(page.getByRole("heading", { name: "Workspace Assistant" })).toBeVisible();
  await page.getByLabel("Message").fill("hello browser");
  await page.getByRole("button", { name: "Send" }).click();

  await expect(page.getByText("Mock response: hello browser")).toBeVisible();
  await expect(page.getByText("open_resource: applied")).toBeVisible();
});
