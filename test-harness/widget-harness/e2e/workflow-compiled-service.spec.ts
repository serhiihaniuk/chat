import { expect, test } from "playwright/test";

const compiledWidgetPort = readPort("SIDECHAT_COMPILED_WIDGET_PORT", 5176);
const compiledWidgetUrl = `http://127.0.0.1:${String(compiledWidgetPort)}/compiled-side-chat/`;

test("streams a real compiled service turn through the browser widget", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") pageErrors.push(message.text());
  });

  await page.goto(
    `${compiledWidgetUrl}?authToken=local-test-token` +
      "&workspaceId=local-workspace&clientTools=false",
  );
  await expect(page.getByText("How can I help with this page?")).toBeVisible({ timeout: 15_000 });

  const acceptedTurn = page.waitForResponse((response) => {
    const request = response.request();
    return request.method() === "POST" && new URL(response.url()).pathname.endsWith("/api/chat");
  });
  await page.getByLabel("Message").fill("compiled browser contract");
  await page.getByRole("button", { name: "Send" }).click();

  const response = await acceptedTurn;
  expect(response.status()).toBe(200);
  expect(response.headers()["x-workflow-run-id"]).toBeTruthy();
  await expect(page.getByText(/Scripted reply:/u)).toBeVisible({ timeout: 30_000 });
  await expect(page.getByLabel("Generating")).toHaveCount(0);
  expect(pageErrors).toEqual([]);
});

function readPort(name: string, fallback: number): number {
  const value = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isInteger(value) && value > 0 ? value : fallback;
}
