import { expect, test, type Locator } from "playwright/test";

const fixturePort = readPort("SIDECHAT_WORKFLOW_FIXTURE_PORT", 8788);
const fixtureUrl = `http://127.0.0.1:${String(fixturePort)}`;
const viewport = { width: 390, height: 844 } as const;
const widgetUrl = "/side-chat-frame/?workspaceId=responsive-mobile";

test.use({ viewport });

test("keeps the mobile sheet and its portaled controls inside the viewport", async ({
  page,
  request,
}) => {
  await request.post(`${fixtureUrl}/__test/reset`);
  await page.goto(widgetUrl);

  const panel = page.locator(".sc-widget-panel");
  await expect(panel).toBeVisible();
  await panel.evaluate(async (element) => {
    await Promise.all(element.getAnimations().map((animation) => animation.finished));
  });
  const panelBox = await requireBoundingBox(panel, "mobile panel");
  expect(Math.round(panelBox.x)).toBe(0);
  expect(Math.round(panelBox.width)).toBe(viewport.width);
  expect(Math.round(panelBox.y + panelBox.height)).toBe(viewport.height);
  await expect(page.getByRole("button", { name: /Resize panel/u })).toHaveCount(0);

  await page.getByRole("button", { name: "Add context and tools" }).click();
  const toolsPopup = page.locator('[data-slot="dropdown-menu-content"]');
  await expect(toolsPopup).toBeVisible();
  const popupBox = await requireBoundingBox(toolsPopup, "tools popup");
  expect(popupBox.x).toBeGreaterThanOrEqual(0);
  expect(popupBox.y).toBeGreaterThanOrEqual(panelBox.y);
  expect(popupBox.x + popupBox.width).toBeLessThanOrEqual(viewport.width);
  expect(popupBox.y + popupBox.height).toBeLessThanOrEqual(viewport.height);

  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Settings" }).click();
  await expect(page.getByRole("button", { name: "Back to chat" })).toBeVisible();
  await page.getByRole("button", { name: "Back to chat" }).click();
  await expect(page.getByLabel("Message")).toBeVisible();
});

type BoundingBox = Readonly<{
  x: number;
  y: number;
  width: number;
  height: number;
}>;

async function requireBoundingBox(locator: Locator, label: string): Promise<BoundingBox> {
  const box = await locator.boundingBox();
  if (box === null) throw new Error(`Expected a bounding box for ${label}.`);
  return box;
}

function readPort(name: string, fallback: number): number {
  const value = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isInteger(value) && value > 0 ? value : fallback;
}
