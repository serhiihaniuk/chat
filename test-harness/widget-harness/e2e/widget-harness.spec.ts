import { expect, test, type APIRequestContext, type Locator, type Page } from "playwright/test";

const serviceBaseUrl = "http://127.0.0.1:3101";
const authToken = "local-compose-token";
const workspaceId = "workspace_e2e";
const pageErrorLog = new WeakMap<Page, string[]>();

test.beforeEach(({ page }) => {
  const pageErrors: string[] = [];
  pageErrorLog.set(page, pageErrors);
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") pageErrors.push(message.text());
  });
});

test.afterEach(async ({ page }, testInfo) => {
  const pageErrors = pageErrorLog.get(page) ?? [];
  if (pageErrors.length > 0) {
    await testInfo.attach("page-errors", {
      body: Buffer.from(pageErrors.join("\n")),
      contentType: "text/plain",
    });
  }
  expect(pageErrors).toEqual([]);
});

test("runs the widget harness in a browser with deterministic mock streaming", async ({ page }) => {
  await page.goto("/?mode=mock-stream");

  await expect(page.getByRole("heading", { name: "Workspace Assistant" })).toBeVisible();
  await page.getByLabel("Message").fill("hello browser");
  await page.getByRole("button", { name: "Send" }).click();

  await expect(page.getByText("Mock response: hello browser")).toBeVisible();
  await openActivityPanel(page);
  await expect(page.getByText("Open resource")).toBeVisible();
  await expect(page.getByText(/harness_local_only/u)).toBeVisible();
});

test("streams through the real widget and real backend with mocked DB and model", async ({
  page,
  request,
}) => {
  await expectServiceHealth(request);
  await openLocalServiceWidget(page);

  const streamResponse = page.waitForResponse((response) =>
    response.url().includes("/api/chat/stream"),
  );

  await page.getByLabel("Message").fill("hello e2e backend");
  await page.getByRole("button", { name: "Send" }).click();

  expect((await streamResponse).status()).toBe(200);
  await expect(page.getByText("hello e2e backend", { exact: true })).toBeVisible();
  await expect(page.getByText("Fake response: hello e2e backend")).toBeVisible({
    timeout: 15_000,
  });
  await openActivityPanel(page);
  await expectUsageWasRecorded(request);
});

test("renders tool activity details from the canonical activity stream", async ({ page }) => {
  await page.goto("/?mode=mock-stream");
  await expect(page.getByRole("heading", { name: "Workspace Assistant" })).toBeVisible();

  await page.getByLabel("Message").fill("search web for current portfolio news");
  await page.getByRole("button", { name: "Send" }).click();

  await expect(page.getByRole("button", { name: /Thought/u }).last()).toBeVisible({
    timeout: 15_000,
  });
  await waitForActivityPanelAutoClose(page);
  await openActivityPanel(page, { timeout: 15_000 });
  const toolTrigger = page.getByRole("button", { name: /mock_web_search/u });
  await expect(toolTrigger).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("Search query")).toBeVisible();
  await expect(
    page.getByText("search web for current portfolio news", { exact: true }).last(),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "Result", exact: true }).first()).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByText(/Mocked web search found/u)).toBeVisible();
  await expect(page.getByRole("heading", { name: "Search results", exact: true })).toBeVisible();
  await expect(page.getByText("Mock Search Result")).toBeVisible();
  await expect(page.getByText("example.test")).toBeVisible();

  await toolTrigger.click();
  await expect(page.getByText("Search query")).toBeHidden();
});

test("keeps prompt input context and model controls visible as anchored popovers", async ({
  page,
}) => {
  await page.setViewportSize({ height: 486, width: 864 });
  await page.goto("/?mode=mock-stream");

  const contextButton = page.getByRole("button", { name: /Context usage/u });
  await expect(contextButton).toBeVisible();
  await contextButton.hover();

  const contextDetails = page.getByText(/Visible conversation context is trimmed/u);
  await expect(contextDetails).toBeVisible();
  await expectElementWithinViewport(page, contextDetails);

  await page.getByRole("button", { name: "Select model" }).click();
  const modelSearch = page.getByPlaceholder("Search models...");
  await expect(modelSearch).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expectElementWithinViewport(page, modelSearch);
});

const openLocalServiceWidget = async (page: Page) => {
  await page.goto(`/?mode=local-service&authToken=${authToken}&workspaceId=${workspaceId}`);
  await expect(page.getByRole("heading", { name: "Workspace Assistant" })).toBeVisible();
};

const openActivityPanel = async (page: Page, options: { readonly timeout?: number } = {}) => {
  const trigger = page.getByRole("button", { name: /Thinking|Thought/u }).last();
  await expect(trigger).toBeVisible({ timeout: options.timeout ?? 5_000 });
  if ((await trigger.getAttribute("aria-expanded")) !== "true") {
    await trigger.click();
  }
};

const waitForActivityPanelAutoClose = async (page: Page) => {
  const trigger = page.getByRole("button", { name: /Thinking|Thought/u }).last();
  if ((await trigger.getAttribute("aria-expanded")) === "true") {
    await expect(trigger).toHaveAttribute("aria-expanded", "false", { timeout: 2_000 });
  }
};

const expectServiceHealth = async (request: APIRequestContext) => {
  const response = await request.get(`${serviceBaseUrl}/healthz`);
  expect(response.ok()).toBe(true);
  const health = (await response.json()) as unknown;
  expect(health).toMatchObject({
    modelId: "fake-echo",
    persistence: "memory",
    providerId: "fake",
    status: "ok",
  });
};

const expectUsageWasRecorded = async (request: APIRequestContext) => {
  const response = await request.get(`${serviceBaseUrl}/usage`, {
    headers: { authorization: `Bearer ${authToken}` },
  });
  expect(response.ok()).toBe(true);
  const usage = (await response.json()) as {
    readonly totalTokens?: unknown;
  };
  expect(typeof usage.totalTokens).toBe("number");
  expect(usage.totalTokens).toBeGreaterThan(0);
};

const expectElementWithinViewport = async (page: Page, locator: Locator) => {
  const viewport = page.viewportSize();
  if (viewport === null) throw new Error("Expected page viewport to be available.");

  const box = await locator.boundingBox();
  if (box === null) throw new Error("Expected element to have a bounding box.");

  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
  expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
};
