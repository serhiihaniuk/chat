import {
  expect,
  test,
  type APIRequestContext,
  type FrameLocator,
  type Locator,
  type Page,
} from "playwright/test";

const servicePort = readPortEnv("SIDECHAT_E2E_SERVICE_PORT", 3101);
const hostPort = readPortEnv("SIDECHAT_E2E_HOST_PORT", 5180);
const serviceBaseUrl = `http://127.0.0.1:${servicePort}`;
const hostBaseUrl = `http://127.0.0.1:${hostPort}`;
const widgetFramePath = "/side-chat-frame/";
const authToken = "local-compose-token";
const workspaceId = "workspace_e2e";
const pageErrorLog = new WeakMap<Page, string[]>();

function readPortEnv(name: string, fallback: number): number {
  const value = process.env[name];
  if (!value) return fallback;

  const port = Number(value);
  if (Number.isInteger(port) && port > 0 && port <= 65535) return port;

  throw new Error(`Invalid ${name} value: ${value}`);
}

const widgetAppUrl = (query: string): string => `${widgetFramePath}${query}`;

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
  await page.goto(widgetAppUrl("?mode=mock-stream"));

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
    response.url().includes("/side-chat-api/chat/stream"),
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

test("showcases the fake provider with slow markdown and local tool activity", async ({
  page,
  request,
}) => {
  await expectServiceHealth(request);
  await openLocalServiceWidget(page);

  await page.getByLabel("Message").fill("tool");
  await page.getByRole("button", { name: "Send" }).click();

  await expect(page.getByRole("heading", { name: "Tool-Backed Showcase" })).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByText("Runtime surface")).toBeVisible();
  await expect(page.getByText(/Use this during the demo/u)).toBeVisible();

  await openActivityPanel(page, { timeout: 30_000 });
  await expect(page.getByText("Run mock_web_search")).toBeVisible({ timeout: 5_000 });
  await expect(page.getByText(/"query": "Side Chat demo briefing: tool"/u)).toBeVisible();
  await expect(page.getByText(/Mocked web search found/u)).toBeVisible();
  await expect(page.getByLabel("Message")).toBeEnabled({ timeout: 30_000 });
  await expectUsageWasRecorded(request);
});

test("shows fake demo thinking levels and seeded conversations", async ({ page, request }) => {
  await expectServiceHealth(request);
  await expectFakeThinkingCatalog(request);
  await expectSeededConversations(request);
  await openLocalServiceWidget(page);

  await expect(page.getByText("Medium")).toBeVisible();
  await expect(page.getByText("Assistant Mission Overview")).toBeVisible();
  await page.getByText("Thinking levels demo").click();

  await expect(
    page.getByRole("log").getByText("Show how fake thinking levels work."),
  ).toBeVisible();
  await expect(page.getByText(/Pick low, medium, or high/u)).toBeVisible();
});

test("streams from the local service while embedded in an iframe", async ({ page, request }) => {
  await expectServiceHealth(request);
  await page.setViewportSize({ height: 1200, width: 1400 });
  await page.goto(
    `/workbench-embed.html?authToken=${encodeURIComponent(authToken)}` +
      `&workspaceId=${encodeURIComponent(workspaceId)}` +
      `&apiBaseUrl=${encodeURIComponent("/side-chat-api")}` +
      `&framePath=${encodeURIComponent(widgetFramePath)}`,
  );
  const iframe = page.locator('iframe[title="Workspace Assistant"]');
  const frameSrc = await iframe.getAttribute("src");
  expect(new URL(frameSrc ?? "", hostBaseUrl).origin).toBe(hostBaseUrl);
  expect(new URL(frameSrc ?? "", hostBaseUrl).pathname).toBe(widgetFramePath);
  await expect(iframe).toBeHidden();
  const hostOpenButton = page.getByRole("button", { name: "Open assistant" });
  await expect(hostOpenButton).toHaveAttribute("aria-expanded", "false");
  await expectElementDockedBottomRight(page, hostOpenButton, { bottom: 16, right: 16 });

  await hostOpenButton.click();
  await expect(iframe).toBeVisible();
  await expectElementDockedBottomRight(page, iframe, { bottom: 64, right: 16 });
  await expectElementHeight(iframe, 1080);
  const hostCloseButton = page.getByRole("button", { name: "Close assistant" });
  await expect(hostCloseButton).toHaveAttribute("aria-expanded", "true");
  await expectElementDockedBottomRight(page, hostCloseButton, { bottom: 16, right: 16 });

  const frame = page.frameLocator('iframe[title="Workspace Assistant"]');
  await expect(frame.getByRole("region", { name: "Workspace Assistant" })).toBeVisible();
  const resizedPanelWidth = await resizePanelFromLeftEdge(page, frame, 72);

  const streamResponse = page.waitForResponse((response) =>
    response.url().includes("/side-chat-api/chat/stream"),
  );

  await frame.getByLabel("Message").fill("hello iframe backend");
  await frame.getByRole("button", { name: "Send" }).click();

  expect((await streamResponse).status()).toBe(200);
  await expect(
    frame.getByRole("log").getByText("hello iframe backend", { exact: true }),
  ).toBeVisible();
  await expect(frame.getByText("Fake response: hello iframe backend")).toBeVisible({
    timeout: 15_000,
  });
  await expectUsageWasRecorded(request);

  await hostCloseButton.click();
  await expect(iframe).toBeHidden();
  await expect(frame.getByRole("region", { name: "Workspace Assistant" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Open assistant" })).toHaveAttribute(
    "aria-expanded",
    "false",
  );

  await page.getByRole("button", { name: "Open assistant" }).click();
  await expect(frame.getByRole("region", { name: "Workspace Assistant" })).toBeVisible();
  const reopenedBox = await readBox(frame.getByRole("region", { name: "Workspace Assistant" }));
  expect(Math.abs(reopenedBox.width - resizedPanelWidth)).toBeLessThanOrEqual(2);
});

test("renders tool activity details from the canonical activity stream", async ({ page }) => {
  await page.goto(widgetAppUrl("?mode=mock-stream&scenario=tool"));
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
  await page.goto(widgetAppUrl("?mode=mock-stream&scenario=failed-host-command"));

  await page.getByLabel("Message").fill("open the linked record");
  await page.getByRole("button", { name: "Send" }).click();

  await openActivityPanel(page, { timeout: 15_000 });
  await expect(page.getByText("Open resource")).toBeVisible();
  await expect(page.getByText(/harness_command_failed/u)).toBeVisible();
});

test("sends turn profile and host context through public widget seams", async ({ page }) => {
  await page.goto(
    widgetAppUrl("?mode=mock-stream&scenario=echo-request&workspaceId=workspace_context_a"),
  );

  await page.getByLabel("Message").fill("echo request metadata");
  await page.getByRole("button", { name: "Send" }).click();

  await expect(
    page.getByText(
      "Mock response: echo request metadata model=default workspace=workspace_context_a",
    ),
  ).toBeVisible();
});

test("shows a stream error state without arbitrary waits", async ({ page }) => {
  await page.goto(widgetAppUrl("?mode=mock-stream&scenario=error"));

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
  await page.goto(widgetAppUrl("?mode=mock-stream"));

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
  await page.goto(widgetAppUrl("?mode=mock-stream"));

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
  await page.goto(widgetAppUrl("?mode=mock-stream"));

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
  await page.goto(
    widgetAppUrl(
      `?mode=local-service&authToken=${encodeURIComponent(authToken)}` +
        `&workspaceId=${encodeURIComponent(workspaceId)}`,
    ),
  );
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

const expectFakeThinkingCatalog = async (request: APIRequestContext) => {
  const response = await request.get(`${serviceBaseUrl}/models`, {
    headers: { authorization: `Bearer ${authToken}` },
  });
  expect(response.ok()).toBe(true);
  const catalog = (await response.json()) as {
    readonly models?: readonly {
      readonly modelId?: unknown;
      readonly providerId?: unknown;
      readonly reasoning?: unknown;
    }[];
  };
  expect(catalog.models?.[0]).toMatchObject({
    providerId: "fake",
    modelId: "fake-echo",
    reasoning: {
      defaultEffort: "medium",
      efforts: ["low", "medium", "high"],
    },
  });
};

const expectSeededConversations = async (request: APIRequestContext) => {
  const response = await request.get(`${serviceBaseUrl}/chat/conversations`, {
    headers: { authorization: `Bearer ${authToken}` },
  });
  expect(response.ok()).toBe(true);
  const list = (await response.json()) as {
    readonly conversations?: readonly { readonly title?: unknown }[];
  };
  expect(list.conversations?.map((conversation) => conversation.title)).toContain(
    "Assistant Mission Overview",
  );
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

const resizePanelFromLeftEdge = async (
  page: Page,
  frame: FrameLocator,
  distance: number,
): Promise<number> => {
  const panel = frame.getByRole("region", { name: "Workspace Assistant" });
  const before = await readBox(panel);
  const handle = await readBox(frame.getByRole("button", { name: "Resize panel from left edge" }));
  const startX = handle.x + handle.width / 2;
  const startY = handle.y + handle.height / 2;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX - distance, startY, { steps: 4 });
  await page.mouse.up();

  const after = await readBox(panel);
  expect(after.width).toBeGreaterThan(before.width + distance / 2);
  return after.width;
};

const readBox = async (
  locator: Locator,
): Promise<{
  readonly height: number;
  readonly width: number;
  readonly x: number;
  readonly y: number;
}> => {
  const box = await locator.boundingBox();
  if (box === null) throw new Error("Expected element to have a bounding box.");
  return box;
};

const expectElementDockedBottomRight = async (
  page: Page,
  locator: Locator,
  expected: { readonly bottom: number; readonly right: number },
) => {
  const viewport = page.viewportSize();
  if (viewport === null) throw new Error("Expected page viewport to be available.");

  const box = await locator.boundingBox();
  if (box === null) throw new Error("Expected element to have a bounding box.");

  const actualRight = viewport.width - (box.x + box.width);
  const actualBottom = viewport.height - (box.y + box.height);
  expect(Math.abs(actualRight - expected.right)).toBeLessThanOrEqual(2);
  expect(Math.abs(actualBottom - expected.bottom)).toBeLessThanOrEqual(2);
};

const expectElementHeight = async (locator: Locator, expectedHeight: number): Promise<void> => {
  const box = await readBox(locator);
  expect(Math.abs(box.height - expectedHeight)).toBeLessThanOrEqual(2);
};
