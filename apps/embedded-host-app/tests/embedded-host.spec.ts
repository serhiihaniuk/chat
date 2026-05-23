import { expect, test, type FrameLocator, type Page } from "@playwright/test";

type AssistantSurface = {
  getByLabel: Page["getByLabel"];
  getByRole: Page["getByRole"];
  getByTestId: Page["getByTestId"];
  getByText: Page["getByText"];
  locator: Page["locator"];
};

const assistantFrame = (page: Page): FrameLocator =>
  page.frameLocator('iframe[title="Workspace Assistant"]');

const openWidget = async (page: Page) => {
  const assistant = assistantFrame(page);
  const launcher = assistant.getByRole("button", { name: /open assistant/i });
  await expect(launcher).toBeVisible();
  await launcher.click();
  await expect(assistant.getByTestId("side-chat-widget"))
    .toBeVisible({ timeout: 1_000 })
    .catch(async () => {
      await launcher.click();
      await expect(assistant.getByTestId("side-chat-widget")).toBeVisible();
    });
};

const userMessages = (surface: AssistantSurface) =>
  surface.locator('[data-message-from="user"]');

const assistantMessages = (surface: AssistantSurface) =>
  surface.locator('[data-message-from="assistant"]');

const chooseModelAlias = async (
  surface: AssistantSurface,
  optionName: RegExp,
) => {
  await surface.getByLabel("Assistant model").click();
  await surface.getByRole("option", { name: optionName }).click();
};

const expectFakeStreamedAnswer = async (
  surface: AssistantSurface,
  modelId: string,
  prompt: string,
) => {
  await expect(
    surface.getByText(new RegExp(`Model ${modelId} received: ${prompt}`)).last(),
  ).toBeVisible();
};

test("embedded host imports public widget and shows launcher", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Advisory Dashboard" }),
  ).toBeVisible();
  await expect(page.getByText("Advisory Dashboard").first()).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Workbench page controls" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Portfolio Worklist" }),
  ).toBeVisible();
  const assistant = assistantFrame(page);
  await expect(
    assistant.getByRole("button", { name: /open assistant/i }),
  ).toBeVisible();
  await expect(
    assistant.getByRole("button", { name: /open assistant/i }),
  ).toHaveAttribute("aria-expanded", "false");
});

test("embedded Workbench page scrolls normally on mobile", async ({ page }) => {
  await page.setViewportSize({ width: 700, height: 760 });
  await page.goto("/");

  await expect(
    page.getByRole("heading", { name: "Advisory Dashboard" }),
  ).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Workbench page controls" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Risk Intelligence Overview" }),
  ).toBeHidden();
  await expect(
    page.getByRole("heading", { name: "Portfolio Worklist" }),
  ).toBeVisible();

  const metrics = await page.evaluate(() => ({
    bodyOverflowY: getComputedStyle(document.body).overflowY,
    mainOverflowY: getComputedStyle(document.querySelector(".workbench-main")!)
      .overflowY,
    scrollHeight: document.documentElement.scrollHeight,
    scrollWidth: document.documentElement.scrollWidth,
    viewportHeight: window.innerHeight,
    viewportWidth: window.innerWidth,
  }));

  expect(metrics.bodyOverflowY).not.toBe("hidden");
  expect(metrics.mainOverflowY).not.toBe("hidden");
  expect(metrics.scrollHeight).toBeGreaterThan(metrics.viewportHeight);
  expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.viewportWidth + 2);

  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await expect
    .poll(() => page.evaluate(() => window.scrollY))
    .toBeGreaterThan(100);
  await expect(
    assistantFrame(page).getByRole("button", { name: /open assistant/i }),
  ).toBeVisible();
});

test("embedded Workbench page scrolls normally on short laptop screens", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1540, height: 900 });
  await page.goto("/");

  await expect(
    page.getByRole("heading", { name: "Risk Intelligence Overview" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Portfolio Worklist" }),
  ).toBeVisible();

  const metrics = await page.evaluate(() => ({
    bodyOverflowY: getComputedStyle(document.body).overflowY,
    mainOverflowY: getComputedStyle(document.querySelector(".workbench-main")!)
      .overflowY,
    scrollHeight: document.documentElement.scrollHeight,
    viewportHeight: window.innerHeight,
  }));

  expect(metrics.bodyOverflowY).not.toBe("hidden");
  expect(metrics.mainOverflowY).not.toBe("hidden");
  expect(metrics.scrollHeight).toBeGreaterThan(metrics.viewportHeight);

  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await expect
    .poll(() => page.evaluate(() => window.scrollY))
    .toBeGreaterThan(100);
});

test("embedded widget is keyboard-openable and returns focus on close", async ({
  page,
}) => {
  await page.goto("/");
  const assistant = assistantFrame(page);
  const launcher = assistant.getByRole("button", { name: /open assistant/i });

  await launcher.focus();
  await expect(launcher).toBeFocused();
  await page.keyboard.press("Enter");

  const input = assistant.getByLabel("chat-input");
  await expect(assistant.getByTestId("side-chat-widget")).toBeVisible();
  await expect(input).toBeVisible();
  await assistant.getByRole("button", { name: /close assistant/i }).click();

  await expect(
    assistant.getByRole("button", { name: /open assistant/i }),
  ).toBeVisible();
  await expect(launcher).toHaveAttribute("aria-expanded", "false");
});

test("embedded widget opens as a bounded chat window on small screens", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 700 });
  await page.goto("/");
  const initialPageScroll = await page.evaluate(() => window.scrollY);
  await openWidget(page);
  const assistant = assistantFrame(page);

  const panel = assistant.getByTestId("side-chat-widget");
  const conversation = assistant.getByRole("log");
  const input = assistant.getByLabel("chat-input");

  const panelBox = await panel.boundingBox();
  const conversationBox = await conversation.boundingBox();
  const inputBox = await input.boundingBox();

  expect(panelBox).not.toBeNull();
  expect(conversationBox).not.toBeNull();
  expect(inputBox).not.toBeNull();
  await expect
    .poll(() => page.evaluate(() => window.scrollY))
    .toBe(initialPageScroll);
  expect(panelBox!.x).toBeGreaterThanOrEqual(8);
  expect(panelBox!.y).toBeGreaterThanOrEqual(8);
  expect(panelBox!.x + panelBox!.width).toBeLessThanOrEqual(382);
  expect(panelBox!.y + panelBox!.height).toBeLessThanOrEqual(692);
  expect(conversationBox!.height).toBeGreaterThanOrEqual(150);
  expect(inputBox!.y).toBeGreaterThan(
    conversationBox!.y + conversationBox!.height,
  );
});

test("embedded widget header stays aligned with the chat column when fullscreen", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1728, height: 1200 });
  await page.goto("/");
  await openWidget(page);
  const assistant = assistantFrame(page);
  await assistant.getByRole("button", { name: /fullscreen assistant/i }).click();

  const layout = await assistant.locator("body").evaluate(() => {
    const header = document.querySelector(".sidechat-header-content");
    const conversation = document.querySelector(".sidechat-conversation");
    if (!header || !conversation) return null;

    const headerBox = header.getBoundingClientRect();
    const conversationBox = conversation.getBoundingClientRect();

    return {
      conversationLeft: Math.round(conversationBox.left),
      conversationRight: Math.round(conversationBox.right),
      headerLeft: Math.round(headerBox.left),
      headerRight: Math.round(headerBox.right),
    };
  });

  expect(layout).not.toBeNull();
  expect(Math.abs(layout!.headerLeft - layout!.conversationLeft)).toBeLessThanOrEqual(
    24,
  );
  expect(
    Math.abs(layout!.headerRight - layout!.conversationRight),
  ).toBeLessThanOrEqual(24);
});

test("embedded widget streams markdown from backend through Streamdown", async ({
  page,
}) => {
  await page.goto("/");
  await openWidget(page);
  const assistant = assistantFrame(page);

  await chooseModelAlias(assistant, /GPT 6\.0/);
  await expect(assistant.getByLabel("Assistant model")).toContainText("GPT 6.0");
  await assistant.getByLabel("chat-input").fill("summarize markdown");
  const streamResponse = page.waitForResponse(
    (response) =>
      response.url().includes("/chat/stream") && response.status() === 200,
  );
  await assistant.getByRole("button", { name: "send message" }).click();
  await streamResponse;

  const currentAnswer = assistant
    .locator('[data-message-from="assistant"]')
    .filter({
      hasText: "Model gpt-5.4-nano received: summarize markdown",
    })
    .last();
  await expect(
    currentAnswer.getByRole("heading", { name: "Assistant answer" }),
  ).toBeVisible();
  await expect(
    currentAnswer
      .getByRole("listitem")
      .filter({ hasText: "markdown-ready output" }),
  ).toBeVisible();
  await expect(
    currentAnswer.getByText(/Model gpt-5\.4-nano received: summarize markdown/),
  ).toBeVisible();
  await assistant.getByRole("button", { name: /Context usage/ }).click();
  await expect(assistant.getByText("Conversation usage")).toBeVisible();
  await expect(assistant.getByText(/\d+ total/).last()).toBeVisible();
  await expect(currentAnswer.getByText(/inline code/)).toBeVisible();
  await expect(currentAnswer.getByText("const x = 1;")).toBeVisible();
});

test("embedded widget model picker stays a demo affordance", async ({
  page,
}) => {
  await page.goto("/");
  await openWidget(page);
  const assistant = assistantFrame(page);

  await chooseModelAlias(assistant, /Claude Mythos\s+Too powerful/);
  await expect(assistant.getByLabel("Assistant model")).toContainText(
    "Claude Mythos",
  );
  await assistant.getByLabel("chat-input").fill("compare model metadata");

  const streamResponse = page.waitForResponse(
    (response) =>
      response.url().includes("/chat/stream") && response.status() === 200,
  );
  await assistant.getByRole("button", { name: "send message" }).click();
  await streamResponse;

  await expectFakeStreamedAnswer(
    assistant,
    "gpt-5.4-nano",
    "compare model metadata",
  );
});

test("chart tooltips close when pointer leaves toward chat or rapidly exits", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/");
  await openWidget(page);

  const chart = page.locator(".risk-layer-chart-shell").first();
  const chartDot = chart.locator(".recharts-dot").first();
  const tooltip = page.locator(".chart-tooltip").first();
  await expect(chart).toBeVisible();
  await expect(chartDot).toBeVisible();

  const hoverChart = async () => {
    const box = await chartDot.boundingBox();
    expect(box).not.toBeNull();
    await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
    await expect(tooltip).toBeVisible();
  };

  await hoverChart();
  const iframeBox = await page
    .locator('iframe[title="Workspace Assistant"]')
    .boundingBox();
  expect(iframeBox).not.toBeNull();
  await page.mouse.move(iframeBox!.x + 24, iframeBox!.y + 24, { steps: 2 });
  await expect(tooltip).toBeHidden();

  await hoverChart();
  await page.mouse.move(1, 1, { steps: 1 });
  await expect(tooltip).toBeHidden();
});

test("embedded widget submits with Enter from the composer input", async ({
  page,
}) => {
  await page.goto("/");
  await openWidget(page);
  const assistant = assistantFrame(page);

  await assistant.getByLabel("chat-input").fill("submit with keyboard");
  const streamResponse = page.waitForResponse(
    (response) =>
      response.url().includes("/chat/stream") && response.status() === 200,
  );
  await page.keyboard.press("Enter");
  await streamResponse;

  await expect(
    userMessages(assistant).getByText("submit with keyboard").last(),
  ).toBeVisible();
  await expectFakeStreamedAnswer(
    assistant,
    "gpt-5.4-nano",
    "submit with keyboard",
  );
});

test("embedded widget scrolls to the latest streamed message", async ({
  page,
}) => {
  await page.goto("/");
  await openWidget(page);
  const assistant = assistantFrame(page);

  const conversation = assistant.getByRole("log");
  await conversation.evaluate((element) => {
    element.setAttribute("style", "max-height: 8rem");
  });

  await assistant
    .getByLabel("chat-input")
    .fill("scroll to latest message after streaming");
  const streamResponse = page.waitForResponse(
    (response) =>
      response.url().includes("/chat/stream") && response.status() === 200,
  );
  await assistant.getByRole("button", { name: "send message" }).click();
  await streamResponse;
  await expectFakeStreamedAnswer(
    assistant,
    "gpt-5.4-nano",
    "scroll to latest message after streaming",
  );

  await expect
    .poll(async () =>
      conversation.evaluate(
        (element) =>
          element.scrollTop + element.clientHeight >= element.scrollHeight - 2,
      ),
    )
    .toBe(true);
});

test("embedded widget loads seeded history when opening conversation by id", async ({
  page,
}) => {
  await page.goto("/");
  await openWidget(page);
  const assistant = assistantFrame(page);

  await assistant.getByLabel("chat-input").fill("seed me once");
  const streamResponse = page.waitForResponse(
    (response) =>
      response.url().includes("/chat/stream") && response.status() === 200,
  );
  await assistant.getByRole("button", { name: "send message" }).click();
  await streamResponse;

  await expectFakeStreamedAnswer(assistant, "gpt-5.4-nano", "seed me once");

  const historyResponse = page.waitForResponse(
    (response) =>
      response.url().includes("/chat/history") && response.status() === 200,
  );
  await page.reload();
  await openWidget(page);
  await historyResponse;
  const reloadedAssistant = assistantFrame(page);

  await expect(
    userMessages(reloadedAssistant).getByText("seed me once").last(),
  ).toBeVisible();
  await expect(
    assistantMessages(reloadedAssistant)
      .getByText(/markdown-ready output|deterministic mocked streaming/)
      .last(),
  ).toBeVisible();
});

test("embedded widget surfaces retry control on stream failure", async ({
  page,
}) => {
  await page.route("**/chat/stream", (route) => route.abort("failed"));

  await page.goto("/");
  await openWidget(page);
  const assistant = assistantFrame(page);

  await assistant.getByLabel("chat-input").fill("retryable message");
  await assistant.getByRole("button", { name: "send message" }).click();

  const chatAlert = assistant.getByTestId("side-chat-widget").getByRole("alert");
  await expect(chatAlert).toBeVisible();
  const retryButton = assistant.getByRole("button", { name: /^retry$/i });
  await expect(retryButton).toBeVisible();

  await page.unroute("**/chat/stream");
  const streamResponse = page.waitForResponse(
    (response) =>
      response.url().includes("/chat/stream") && response.status() === 200,
  );
  await retryButton.click();
  await assistant.getByLabel("chat-input").waitFor({ state: "visible" });
  await streamResponse;

  await expect(chatAlert).not.toBeVisible();
  await expect(
    userMessages(assistant).getByText("retryable message").last(),
  ).toBeVisible();
  await expectFakeStreamedAnswer(assistant, "gpt-5.4-nano", "retryable message");

  await page.unroute("**/chat/stream");
});

test("widget-demo app exercises package callbacks and state coverage", async ({
  page,
}) => {
  await page.goto(
    `http://127.0.0.1:4173?conversationId=package-smoke-${Date.now().toString(36)}`,
  );

  await expect(
    page.getByRole("heading", { name: "Widget Demo" }),
  ).toBeVisible();
  await expect(page.getByText("Reusable package consumer")).toBeVisible();
  await expect(
    page.getByRole("button", { name: /open assistant/i }),
  ).toBeVisible();

  await page.getByRole("button", { name: /open assistant/i }).click();
  await expect(page.getByTestId("side-chat-widget")).toBeVisible();
  await chooseModelAlias(page, /GPT 6\.0/);
  await expect(page.getByLabel("Assistant model")).toContainText("GPT 6.0");
  await page.getByLabel("chat-input").fill("show callback coverage");
  await page.getByRole("button", { name: "send message" }).click();

  await expectFakeStreamedAnswer(
    page,
    "gpt-5.4-nano",
    "show callback coverage",
  );
  await expect(page.getByLabel("Widget callback events")).toContainText(
    "usage:",
  );
  await expect(page.getByLabel("Widget callback events")).toContainText(
    "opened",
  );
});
