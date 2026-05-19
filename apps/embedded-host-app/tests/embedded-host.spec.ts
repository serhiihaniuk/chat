import { expect, test, type Page } from "@playwright/test";

const openWidget = async (page: Page) => {
  const launcher = page.getByRole("button", { name: /open assistant/i });
  await launcher.click();
  await expect(page.getByTestId("side-chat-widget")).toBeVisible();
};

const userMessages = (page: Page) => page.locator('[data-message-from="user"]');

const assistantMessages = (page: Page) =>
  page.locator('[data-message-from="assistant"]');

const chooseModelAlias = async (page: Page, optionName: RegExp) => {
  await page.getByLabel("Assistant model").click();
  await page.getByRole("option", { name: optionName }).click();
};

const expectFakeStreamedAnswer = async (
  page: Page,
  modelId: string,
  prompt: string,
) => {
  await expect(
    page.getByText(new RegExp(`Model ${modelId} received: ${prompt}`)).last(),
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
  await expect(
    page.getByRole("button", { name: /open assistant/i }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /open assistant/i }),
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
    page.getByRole("button", { name: /open assistant/i }),
  ).toBeVisible();
});

test("embedded widget is keyboard-openable and returns focus on close", async ({
  page,
}) => {
  await page.goto("/");
  const launcher = page.getByRole("button", { name: /open assistant/i });

  await launcher.focus();
  await expect(launcher).toBeFocused();
  await page.keyboard.press("Enter");

  const input = page.getByLabel("chat-input");
  await expect(page.getByTestId("side-chat-widget")).toBeVisible();
  await expect(input).toBeVisible();
  await expect(input).toBeFocused();
  await page.keyboard.press("Escape");

  await expect(
    page.getByRole("button", { name: /open assistant/i }),
  ).toBeVisible();
  await expect(launcher).toBeFocused();
});

test("embedded widget opens as a bounded chat window on small screens", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 700 });
  await page.goto("/");
  const initialPageScroll = await page.evaluate(() => window.scrollY);
  await openWidget(page);

  const panel = page.getByTestId("side-chat-widget");
  const conversation = page.getByRole("log");
  const input = page.getByLabel("chat-input");

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

test("embedded widget streams markdown from backend through Streamdown", async ({
  page,
}) => {
  await page.goto("/");
  await openWidget(page);

  await chooseModelAlias(page, /GPT 6\.0/);
  await expect(page.getByLabel("Assistant model")).toContainText("GPT 6.0");
  await page.getByLabel("chat-input").fill("summarize markdown");
  const streamResponse = page.waitForResponse(
    (response) =>
      response.url().includes("/chat/stream") && response.status() === 200,
  );
  await page.getByRole("button", { name: "send message" }).click();
  await streamResponse;

  const currentAnswer = page
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
  await page.getByRole("button", { name: /Context usage/ }).click();
  await expect(page.getByText("Conversation usage")).toBeVisible();
  await expect(page.getByText(/\d+ total/).last()).toBeVisible();
  await expect(currentAnswer.getByText(/inline code/)).toBeVisible();
  await expect(currentAnswer.getByText("const x = 1;")).toBeVisible();
});

test("embedded widget model picker stays a demo affordance", async ({
  page,
}) => {
  await page.goto("/");
  await openWidget(page);

  await chooseModelAlias(page, /Claude Mythos\s+Too powerful/);
  await expect(page.getByLabel("Assistant model")).toContainText(
    "Claude Mythos",
  );
  await page.getByLabel("chat-input").fill("compare model metadata");

  const streamResponse = page.waitForResponse(
    (response) =>
      response.url().includes("/chat/stream") && response.status() === 200,
  );
  await page.getByRole("button", { name: "send message" }).click();
  await streamResponse;

  await expectFakeStreamedAnswer(
    page,
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
  const widgetBox = await page.getByTestId("side-chat-widget").boundingBox();
  expect(widgetBox).not.toBeNull();
  await page.mouse.move(widgetBox!.x + 24, widgetBox!.y + 24, { steps: 2 });
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

  await page.getByLabel("chat-input").fill("submit with keyboard");
  const streamResponse = page.waitForResponse(
    (response) =>
      response.url().includes("/chat/stream") && response.status() === 200,
  );
  await page.keyboard.press("Enter");
  await streamResponse;

  await expect(
    userMessages(page).getByText("submit with keyboard").last(),
  ).toBeVisible();
  await expectFakeStreamedAnswer(page, "gpt-5.4-nano", "submit with keyboard");
});

test("embedded widget scrolls to the latest streamed message", async ({
  page,
}) => {
  await page.goto("/");
  await openWidget(page);

  const conversation = page.getByRole("log");
  await conversation.evaluate((element) => {
    element.setAttribute("style", "max-height: 8rem");
  });

  await page
    .getByLabel("chat-input")
    .fill("scroll to latest message after streaming");
  const streamResponse = page.waitForResponse(
    (response) =>
      response.url().includes("/chat/stream") && response.status() === 200,
  );
  await page.getByRole("button", { name: "send message" }).click();
  await streamResponse;
  await expectFakeStreamedAnswer(
    page,
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

  await page.getByLabel("chat-input").fill("seed me once");
  const streamResponse = page.waitForResponse(
    (response) =>
      response.url().includes("/chat/stream") && response.status() === 200,
  );
  await page.getByRole("button", { name: "send message" }).click();
  await streamResponse;

  await expectFakeStreamedAnswer(page, "gpt-5.4-nano", "seed me once");

  const historyResponse = page.waitForResponse(
    (response) =>
      response.url().includes("/chat/history") && response.status() === 200,
  );
  await page.reload();
  await openWidget(page);
  await historyResponse;

  await expect(
    userMessages(page).getByText("seed me once").last(),
  ).toBeVisible();
  await expect(
    assistantMessages(page)
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

  await page.getByLabel("chat-input").fill("retryable message");
  await page.getByRole("button", { name: "send message" }).click();

  const chatAlert = page.getByTestId("side-chat-widget").getByRole("alert");
  await expect(chatAlert).toBeVisible();
  const retryButton = page.getByRole("button", { name: /^retry$/i });
  await expect(retryButton).toBeVisible();

  await page.unroute("**/chat/stream");
  const streamResponse = page.waitForResponse(
    (response) =>
      response.url().includes("/chat/stream") && response.status() === 200,
  );
  await retryButton.click();
  await page.getByLabel("chat-input").waitFor({ state: "visible" });
  await streamResponse;

  await expect(chatAlert).not.toBeVisible();
  await expect(
    userMessages(page).getByText("retryable message").last(),
  ).toBeVisible();
  await expectFakeStreamedAnswer(page, "gpt-5.4-nano", "retryable message");

  await page.unroute("**/chat/stream");
});

test("widget-demo app exercises package callbacks and state coverage", async ({
  page,
}) => {
  await page.goto("http://127.0.0.1:4173");

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
