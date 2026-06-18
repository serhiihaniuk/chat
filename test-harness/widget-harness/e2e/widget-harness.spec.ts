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

  await expect(page.getByRole("region", { name: "Workspace Assistant" })).toBeVisible();
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
  // Scope to the conversation log: the wide sidebar also lists the conversation title.
  await expect(page.getByRole("log").getByText("hello e2e backend", { exact: true })).toBeVisible();
  await expect(page.getByText("Fake response: hello e2e backend")).toBeVisible({
    timeout: 15_000,
  });
  await openActivityPanel(page);
  await expectUsageWasRecorded(request);
});

test("renders tool activity details from the canonical activity stream", async ({ page }) => {
  await page.goto("/?mode=mock-stream&scenario=tool");
  await expect(page.getByRole("region", { name: "Workspace Assistant" })).toBeVisible();

  await page.getByLabel("Message").fill("current portfolio news");
  await page.getByRole("button", { name: "Send" }).click();

  await expect(page.getByRole("button", { name: /Thought/u }).last()).toBeVisible({
    timeout: 15_000,
  });
  await waitForActivityPanelAutoClose(page);
  await openActivityPanel(page, { timeout: 15_000 });
  const toolTrigger = page.getByRole("button", { name: /mock_web_search/u });
  await expect(toolTrigger).toBeVisible({ timeout: 15_000 });
  // Tool rows are collapsed by default; expand to reveal the details.
  await expect(page.getByText("Search query")).toBeHidden();
  await toolTrigger.click();
  await expect(page.getByText("Search query")).toBeVisible();
  await expect(page.getByText("current portfolio news", { exact: true }).last()).toBeVisible();
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

test("renders a failed host-command result from the mock harness", async ({ page }) => {
  await page.goto("/?mode=mock-stream&scenario=failed-host-command");

  await page.getByLabel("Message").fill("open the linked record");
  await page.getByRole("button", { name: "Send" }).click();

  await openActivityPanel(page, { timeout: 15_000 });
  await expect(page.getByText("Open resource")).toBeVisible();
  await expect(page.getByText(/harness_command_failed/u)).toBeVisible();
});

test("sends assistant profile and host context through public widget seams", async ({ page }) => {
  await page.goto("/?mode=mock-stream&scenario=echo-request&workspaceId=workspace_context_a");

  await page.getByLabel("Message").fill("echo request metadata");
  await page.getByRole("button", { name: "Send" }).click();

  await expect(
    page.getByText(
      "Mock response: echo request metadata model=default workspace=workspace_context_a",
    ),
  ).toBeVisible();
});

test("shows a stream error state without arbitrary waits", async ({ page }) => {
  await page.goto("/?mode=mock-stream&scenario=error");

  await page.getByLabel("Message").fill("trigger mock failure");
  await page.getByRole("button", { name: "Send" }).click();

  await expect(page.getByText("Mock stream failed")).toBeVisible();
  await page.getByRole("button", { name: "Dismiss error" }).click();
  await expect(page.getByText("Mock stream failed")).toBeHidden();
});

test("opens the narrow conversation switcher menu without crashing", async ({ page }) => {
  // Regression: each date-group label is a Base UI MenuGroupLabel that must sit inside a
  // MenuGroup. Without the group, opening the menu throws and blanks the widget
  // (afterEach asserts no page errors). A sent message seeds a conversation so a
  // labelled group actually renders.
  await page.setViewportSize({ height: 760, width: 460 });
  await page.goto("/?mode=mock-stream");

  await page.getByLabel("Message").fill("seed a conversation");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByText("Mock response: seed a conversation")).toBeVisible();

  await page.getByRole("button", { name: "Select chat" }).click();

  // The seeded conversation renders inside its (labelled) date group without crashing.
  await expect(page.getByRole("menuitem", { name: /seed a conversation/u })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "New chat" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Workspace Assistant" })).toBeVisible();
});

test("keeps the widget usable on a mobile viewport", async ({ page }) => {
  await page.setViewportSize({ height: 740, width: 390 });
  await page.goto("/?mode=mock-stream");

  const widget = page.getByRole("region", { name: "Workspace Assistant" });
  await expect(widget).toBeVisible();
  await expectElementWithinViewport(page, widget);
  await expectElementWithinViewport(page, page.getByLabel("Message"));
  await expectElementWithinViewport(page, page.getByRole("button", { name: "Send" }));
});

test("keeps prompt input chat-size and model controls visible as anchored popovers", async ({
  page,
}) => {
  await page.setViewportSize({ height: 486, width: 864 });
  await page.goto("/?mode=mock-stream");

  const contextButton = page.getByRole("button", { name: "Chat size estimate" });
  await expect(contextButton).toBeVisible();
  await contextButton.hover();

  const contextDetails = page.getByText(/not the selected model's context window/u);
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
  await expect(page.getByRole("region", { name: "Workspace Assistant" })).toBeVisible();
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
