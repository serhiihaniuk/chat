import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

import { expect, test, type Frame, type Page } from "playwright/test";

const evidenceDirectory = resolve(
  import.meta.dirname,
  "../../../plan/v7/evidence/task-16a-widget-parity",
);
const themes = ["graphite", "sapphire", "sage", "ocean"] as const;
const densities = {
  compact: "0.1875rem",
  cozy: "0.25rem",
  roomy: "0.3125rem",
} as const;
const fixturePrompt = "Find the billing brief";
const fixtureAnswer = `Mock response: ${fixturePrompt}`;
const nativeMessages = [
  {
    id: "user-look-parity",
    role: "user",
    parts: [{ type: "text", text: fixturePrompt }],
  },
  {
    id: "assistant-look-parity",
    role: "assistant",
    metadata: {
      usage: {
        inputTokens: 10_000,
        outputTokens: 2_800,
        totalTokens: 12_800,
        reasoningTokens: 0,
        cachedInputTokens: 0,
      },
    },
    parts: [
      { type: "reasoning", text: "Mock harness selected deterministic stream" },
      {
        type: "dynamic-tool",
        toolCallId: "mock-tool-web-search",
        toolName: "mock_web_search",
        state: "output-available",
        input: { query: fixturePrompt },
        output: { summary: "Deterministic mocked search result." },
      },
      {
        type: "text",
        text: fixtureAnswer,
      },
      {
        type: "source-url",
        sourceId: "mock-source",
        url: "https://example.test/search-result",
        title: "Mock Search Result",
      },
      {
        type: "file",
        mediaType: "application/pdf",
        filename: "billing-brief.pdf",
        url: "https://example.test/billing-brief.pdf",
      },
    ],
  },
] as const;

const workflowUrl =
  "/side-chat-frame/?mode=workflow-service&conversationId=conversation-look-parity";
const legacyUrl = "/side-chat-frame/?mode=mock-stream&scenario=tool";

test.beforeAll(() => mkdirSync(evidenceDirectory, { recursive: true }));

test("captures legacy and native look parity across every theme and density", async ({ page }) => {
  const browserErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") browserErrors.push(message.text());
  });
  page.on("pageerror", (error) => browserErrors.push(error.message));

  await page.setViewportSize({ width: 2300, height: 800 });
  await page.goto("/side-chat-frame/?mode=workflow-service&open=false");
  await routeNativeFixture(page);

  for (const theme of themes) {
    for (const [density, spaceUnit] of Object.entries(densities)) {
      await applyAppearance(page, theme, density);
      await mountComparison(page);

      const legacy = requiredFrame(page, "legacy-widget");
      const native = requiredFrame(page, "native-widget");
      await legacy.getByLabel("Message").fill(fixturePrompt);
      await legacy.getByRole("button", { name: "Send" }).click();

      await expect(legacy.getByText(fixtureAnswer)).toBeVisible();
      await expect(native.getByText(fixtureAnswer)).toBeVisible();
      await expect(native.getByText("billing-brief.pdf")).toBeVisible();
      await expect(native.locator('[data-slot="sources-fold"]')).toBeVisible();
      await assertAppearance(legacy, theme, spaceUnit);
      await assertAppearance(native, theme, spaceUnit);

      await page.screenshot({
        animations: "disabled",
        fullPage: true,
        path: resolve(evidenceDirectory, `look-${theme}-${density}.png`),
      });
    }
  }

  expect(browserErrors).toEqual([]);
});

async function routeNativeFixture(page: Page): Promise<void> {
  await page.route("**/side-chat-api/api/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path.endsWith("/conversations")) {
      await route.fulfill({ json: { conversations: [] } });
      return;
    }
    if (path.endsWith("/models")) {
      await route.fulfill({
        json: {
          models: [{ id: "workspace-gpt-5", provider: "openai", contextWindowTokens: 128_000 }],
          defaultModelId: "workspace-gpt-5",
        },
      });
      return;
    }
    if (path.endsWith("/tools")) {
      await route.fulfill({ json: { tools: [] } });
      return;
    }
    if (path.endsWith("/messages")) {
      await route.fulfill({ json: { messages: nativeMessages } });
      return;
    }
    if (path.endsWith("/active-turn")) {
      await route.fulfill({ json: { activeTurn: null } });
      return;
    }
    await route.abort("failed");
  });
}

async function applyAppearance(page: Page, theme: string, density: string): Promise<void> {
  await page.evaluate(
    ({ densityId, themeId }) => {
      localStorage.setItem("side-chat-widget:theme", themeId);
      localStorage.setItem(
        "side-chat-widget:appearance",
        JSON.stringify({
          accent: "default",
          corners: "default",
          density: densityId,
          elevation: "soft",
          textSize: "default",
          typeface: "plus-jakarta",
        }),
      );
      localStorage.setItem("side-chat-widget:tool-detail", "full");
    },
    { densityId: density, themeId: theme },
  );
}

async function mountComparison(page: Page): Promise<void> {
  const origin = new URL(page.url()).origin;
  await page.setContent(`
    <!doctype html>
    <html>
      <head>
        <style>
          body { margin: 0; background: #dfe3e9; font-family: system-ui, sans-serif; }
          main { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; padding: 12px; width: 2276px; }
          section { min-width: 0; }
          h1 { margin: 0 0 8px; color: #20242c; font-size: 14px; letter-spacing: .08em; text-transform: uppercase; }
          iframe { display: block; width: 1128px; height: 744px; border: 0; border-radius: 12px; }
        </style>
      </head>
      <body>
        <main>
          <section><h1>Legacy protocol widget</h1><iframe name="legacy-widget" src="${origin}${legacyUrl}"></iframe></section>
          <section><h1>Native workflow widget</h1><iframe name="native-widget" src="${origin}${workflowUrl}"></iframe></section>
        </main>
      </body>
    </html>
  `);
  await expect(page.locator('iframe[name="legacy-widget"]')).toBeVisible();
  await expect(page.locator('iframe[name="native-widget"]')).toBeVisible();
}

function requiredFrame(page: Page, name: string): Frame {
  const frame = page.frame({ name });
  if (!frame) throw new Error(`Missing ${name} frame`);
  return frame;
}

async function assertAppearance(frame: Frame, theme: string, spaceUnit: string): Promise<void> {
  const root = frame.locator(".side-chat-widget-root");
  if (theme === "graphite") {
    await expect(root).not.toHaveAttribute("data-sidechat-theme");
  } else {
    await expect(root).toHaveAttribute("data-sidechat-theme", theme);
  }
  await expect(root).toHaveCSS("--space-unit", spaceUnit);
}
