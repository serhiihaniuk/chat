import { expect, test, type Page } from "@playwright/test";

const openWidget = async (page: Page) => {
  const launcher = page.getByRole("button", { name: /open assistant/i });
  await launcher.click();
  await expect(page.getByTestId("side-chat-widget")).toBeVisible();
};

test("embedded host imports public widget and shows launcher", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Revenue Dashboard" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /open assistant/i }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /open assistant/i }),
  ).toHaveAttribute("aria-expanded", "false");
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
  expect(conversationBox!.height).toBeGreaterThan(150);
  expect(inputBox!.y).toBeGreaterThan(
    conversationBox!.y + conversationBox!.height,
  );
});

test("embedded widget streams markdown from backend through Streamdown", async ({
  page,
}) => {
  await page.goto("/");
  await openWidget(page);

  await page.getByLabel("Assistant model").selectOption("gpt-4.1-nano");
  await expect(page.getByText("Model: gpt-4.1-nano")).toBeVisible();
  await page.getByLabel("chat-input").fill("summarize markdown");
  const streamResponse = page.waitForResponse(
    (response) =>
      response.url().includes("/chat/stream") && response.status() === 200,
  );
  await page.getByRole("button", { name: "send message" }).click();
  await streamResponse;

  const currentAnswer = page
    .locator('[data-role="assistant"]')
    .filter({
      hasText: "Model gpt-4.1-nano received: summarize markdown",
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
    currentAnswer.getByText(/Model gpt-4\.1-nano received: summarize markdown/),
  ).toBeVisible();
  await expect(page.getByText(/Tokens: \d+/).last()).toBeVisible();
  await expect(currentAnswer.getByText(/inline code/)).toBeVisible();
  await expect(currentAnswer.getByText("const x = 1;")).toBeVisible();
});

test("embedded widget model switching updates streamed metadata", async ({
  page,
}) => {
  await page.goto("/");
  await openWidget(page);

  await page
    .getByRole("combobox", { name: "Model" })
    .selectOption("gpt-4.1-nano");
  await page.getByLabel("chat-input").fill("compare model metadata");

  const streamResponse = page.waitForResponse(
    (response) =>
      response.url().includes("/chat/stream") && response.status() === 200,
  );
  await page.getByRole("button", { name: "send message" }).click();
  await streamResponse;

  await expect(
    page
      .getByText(/Model gpt-4\.1-nano received: compare model metadata/)
      .last(),
  ).toBeVisible();
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
    page.locator('[data-role="user"]').getByText("submit with keyboard").last(),
  ).toBeVisible();
  await expect(
    page.getByText(/Model gpt-4\.1-mini received: submit with keyboard/).last(),
  ).toBeVisible();
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
  await expect(
    page
      .getByText(
        /Model gpt-4\.1-mini received: scroll to latest message after streaming/,
      )
      .last(),
  ).toBeVisible();

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

  await expect(
    page.getByText(/Model gpt-4\.1-mini received: seed me once/).last(),
  ).toBeVisible();

  const historyResponse = page.waitForResponse(
    (response) =>
      response.url().includes("/chat/history") && response.status() === 200,
  );
  await page.reload();
  await openWidget(page);
  await historyResponse;

  await expect(
    page.locator('[data-role="user"]').getByText("seed me once").last(),
  ).toBeVisible();
  await expect(
    page
      .locator('[data-role="assistant"]')
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

  await expect(page.getByRole("alert")).toBeVisible();
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

  await expect(page.getByRole("alert")).not.toBeVisible();
  await expect(
    page.locator('[data-role="user"]').getByText("retryable message").last(),
  ).toBeVisible();
  await expect(
    page.getByText(/Model gpt-4\.1-mini received: retryable message/).last(),
  ).toBeVisible();

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
  await page
    .getByRole("combobox", { name: "Model" })
    .selectOption("gpt-4.1-nano");
  await page.getByLabel("chat-input").fill("show callback coverage");
  await page.getByRole("button", { name: "send message" }).click();

  await expect(
    page
      .getByText(/Model gpt-4\.1-nano received: show callback coverage/)
      .last(),
  ).toBeVisible();
  await expect(page.getByLabel("Widget callback events")).toContainText(
    "usage:",
  );
  await expect(page.getByLabel("Widget callback events")).toContainText(
    "opened",
  );
});
