import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

import { expect, test, type Page, type Route } from "playwright/test";

const evidenceDirectory = resolve(
  import.meta.dirname,
  "../../../plan/v7/evidence/task-15-widget-interactions",
);
const workflowWidgetUrl =
  "/side-chat-frame/?mode=workflow-service&conversationId=conversation-task-15";
const recoveryEvidenceDirectory = resolve(
  import.meta.dirname,
  "../../../plan/v7/evidence/task-16-widget-recovery",
);
const recoveryWidgetUrl =
  "/side-chat-frame/?mode=workflow-service&conversationId=conversation-task-16";
const parityEvidenceDirectory = resolve(
  import.meta.dirname,
  "../../../plan/v7/evidence/task-16a-widget-parity",
);
const parityWidgetUrl =
  "/side-chat-frame/?mode=workflow-service&conversationId=conversation-parity";
const modelCatalog = {
  models: [
    {
      id: "gpt-5.6-luna",
      provider: "openai",
      contextWindowTokens: 372_000,
      reasoning: {
        efforts: ["low", "medium", "high"],
        defaultEffort: "medium",
      },
    },
  ],
  defaultModelId: "gpt-5.6-luna",
};
const toolCatalog = {
  tools: [
    {
      name: "mock_web_search",
      label: "Mock web search",
      description: "Search deterministic public context.",
      defaultEnabled: true,
    },
    {
      name: "calculator",
      label: "Calculator",
      description: "Evaluate arithmetic.",
      defaultEnabled: true,
    },
  ],
};

test.beforeAll(() => {
  mkdirSync(evidenceDirectory, { recursive: true });
  mkdirSync(recoveryEvidenceDirectory, { recursive: true });
  mkdirSync(parityEvidenceDirectory, { recursive: true });
});

test("dispatches a native client tool through the host and posts one durable output", async ({
  page,
}) => {
  let postedOutput: unknown;
  await routeWorkflowApi(page, {
    runId: "run-client-tool",
    chunks: [
      { type: "start", messageId: "assistant-client-tool" },
      { type: "start-step" },
      {
        type: "tool-input-available",
        dynamic: true,
        toolCallId: "call-open-resource",
        toolName: "open_resource",
        input: { resourceType: "ticket", resourceId: "ticket-4821" },
      },
      { type: "finish-step" },
      { type: "finish" },
    ],
    onToolOutput: (body) => {
      postedOutput = body;
    },
  });

  await page.goto(workflowWidgetUrl);
  await page.getByLabel("Message").fill("Open ticket 4821");
  await page.getByRole("button", { name: "Send" }).click();

  await expect(page.getByTestId("demo-host-assistant-count")).toHaveText("Assistant actions: 1");
  await expect
    .poll(() => postedOutput)
    .toMatchObject({
      output: { status: "applied", resultCode: "harness_local_only" },
    });
  await expect(page.getByTestId("demo-host-log").getByText("open_resource")).toBeVisible();
  await page.screenshot({
    path: resolve(evidenceDirectory, "client-tool-dispatched.png"),
    fullPage: true,
  });
});

test("posts an approval decision and updates the existing approval row in place", async ({
  page,
}) => {
  let postedDecision: unknown;
  await routeWorkflowApi(page, {
    runId: "run-approval",
    chunks: [
      { type: "start", messageId: "assistant-approval" },
      { type: "start-step" },
      {
        type: "tool-input-available",
        toolCallId: "call-needs-access",
        toolName: "needs_access",
        input: { resourceId: "document-private" },
      },
      {
        type: "tool-approval-request",
        approvalId: "approval-task-15",
        toolCallId: "call-needs-access",
      },
      { type: "finish-step" },
      { type: "finish" },
    ],
    onApproval: (body) => {
      postedDecision = body;
    },
  });

  await page.goto(workflowWidgetUrl);
  await page.getByLabel("Message").fill("Read the private document");
  await page.getByRole("button", { name: "Send" }).click();

  const approval = page.locator('[data-slot="tool-approval"]');
  await expect(approval).toHaveCount(1);
  await expect(approval).toHaveAttribute("data-state", "requested");
  await page.getByLabel("Reason (optional)").fill("Needed for the current task");
  await page.getByRole("button", { name: "Approve" }).click();

  await expect
    .poll(() => postedDecision)
    .toEqual({
      approved: true,
      reason: "Needed for the current task",
    });
  await expect(approval).toHaveCount(1);
  await expect(approval).toHaveAttribute("data-state", "approved");
  await expect(approval.getByText("Approved", { exact: true })).toBeVisible();
  await approval.screenshot({
    path: resolve(evidenceDirectory, "approval-approved.png"),
  });
});

test("reattaches to an in-progress run on cold load and reassembles the answer", async ({
  page,
}) => {
  await routeWorkflowRecovery(page, {
    runId: "run-refresh",
    activeTurn: {
      turnId: "turn-refresh",
      runId: "run-refresh",
      status: "running",
    },
    history: [
      {
        id: "user-refresh",
        role: "user",
        parts: [{ type: "text", text: "Summarize the ticket" }],
      },
    ],
    streamChunks: [
      { type: "start", messageId: "assistant-refresh" },
      { type: "start-step" },
      { type: "text-start", id: "text-1" },
      {
        type: "text-delta",
        id: "text-1",
        delta: "The ticket reports a billing error.",
      },
      { type: "text-end", id: "text-1" },
      { type: "finish-step" },
      { type: "finish" },
    ],
  });

  await page.goto(recoveryWidgetUrl);

  // The reattached assistant answer streams in over the seeded user message, and
  // the seeded message is not duplicated by the replay.
  await expect(page.getByText("The ticket reports a billing error.")).toBeVisible();
  await expect(page.getByText("Summarize the ticket")).toHaveCount(1);
  await page.screenshot({
    path: resolve(recoveryEvidenceDirectory, "refresh-reattach.png"),
    fullPage: true,
  });
});

test("shows the empty state with quick actions before the first message", async ({ page }) => {
  await routeWorkflowIdle(page);

  await page.goto(parityWidgetUrl);

  await expect(page.getByText("How can I help with this page?")).toBeVisible();
  await expect(page.getByRole("button", { name: "Summarize this page" })).toBeVisible();
  // The restored composer footer surfaces the workflow model selector.
  await expect(page.getByText("gpt-5.6-luna")).toBeVisible();
  await page.screenshot({
    path: resolve(parityEvidenceDirectory, "empty-state.png"),
    fullPage: true,
  });
});

test("keeps a new-chat draft usable when its server history does not exist yet", async ({
  page,
}) => {
  let newChatSelected = false;
  let draftPersisted = false;
  let draftConversationId: string | undefined;
  let draftHistoryRequests = 0;
  let draftActiveTurnRequests = 0;
  await page.route("**/side-chat-api/api/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (
      newChatSelected &&
      !draftPersisted &&
      request.method() === "GET" &&
      path.endsWith("/messages")
    ) {
      draftHistoryRequests += 1;
      await route.fulfill({ status: 404, json: { error: "not_found" } });
      return;
    }
    if (
      newChatSelected &&
      !draftPersisted &&
      request.method() === "GET" &&
      path.endsWith("/active-turn")
    ) {
      draftActiveTurnRequests += 1;
      await route.fulfill({ status: 404, json: { error: "not_found" } });
      return;
    }
    if (newChatSelected && request.method() === "POST" && path.endsWith("/api/chat")) {
      const body: unknown = request.postDataJSON();
      const conversationId =
        body !== null && typeof body === "object" && !Array.isArray(body)
          ? Reflect.get(body, "conversationId")
          : undefined;
      if (typeof conversationId !== "string") throw new Error("Draft request needs an id.");
      draftConversationId = conversationId;
      draftPersisted = true;
      await fulfillWorkflowStream(route, {
        runId: "run-new-chat-draft",
        chunks: [{ type: "start", messageId: "assistant-new-chat-draft" }, { type: "finish" }],
      });
      return;
    }
    const fulfilled = await fulfillWorkflowRead(route, path, {
      activeTurn: null,
      conversations: [
        {
          id: "conversation-parity",
          title: "Existing conversation",
          lastMessageAt: "2026-07-13T10:00:00Z",
        },
      ],
      messages: [],
      tools: [],
    });
    if (!fulfilled) await route.abort("failed");
  });

  await page.goto(parityWidgetUrl);
  await expect(page.getByText("How can I help with this page?")).toBeVisible();
  await page.getByText("gpt-5.6-luna", { exact: true }).first().click();
  await page.getByRole("button", { name: "High" }).click();
  await page.keyboard.press("Escape");
  newChatSelected = true;
  await page.getByRole("button", { name: "New chat", exact: true }).click();

  await expect(page.getByText("How can I help with this page?")).toBeVisible();
  await expect(page.getByLabel("Message")).toBeVisible();
  await expect(page.getByText("gpt-5.6-luna")).toBeVisible();
  await expect(page.getByText("/ High", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Add context and tools" })).toBeVisible();
  await expect(page.getByText("The requested resource is unavailable.")).toHaveCount(0);
  expect(draftHistoryRequests).toBe(0);
  expect(draftActiveTurnRequests).toBe(0);
  expect(new URL(page.url()).searchParams.get("conversationId")).toBe("conversation-parity");

  await page.getByRole("button", { name: "Add context and tools" }).click();
  await expect(page.getByText("No tools available", { exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await page.getByLabel("Message").fill("Persist this draft");
  await page.getByRole("button", { name: "Send" }).click();
  await expect.poll(() => draftConversationId).not.toBeUndefined();
  await expect
    .poll(() => new URL(page.url()).searchParams.get("conversationId"))
    .toBe(draftConversationId);
  await expect(page.getByText("The requested resource is unavailable.")).toHaveCount(0);
});

test("selects server tools per turn and renders terminal context usage", async ({ page }) => {
  let chatRequest: unknown;
  await routeWorkflowApi(page, {
    runId: "run-tools-and-usage",
    tools: toolCatalog.tools,
    onChatRequest: (body) => {
      chatRequest = body;
    },
    chunks: [
      { type: "start", messageId: "assistant-tools-and-usage" },
      { type: "start-step" },
      { type: "text-start", id: "text-tools-and-usage" },
      {
        type: "text-delta",
        id: "text-tools-and-usage",
        delta: "The selected calculator is available for this turn.",
      },
      { type: "text-end", id: "text-tools-and-usage" },
      { type: "finish-step" },
      {
        type: "finish",
        messageMetadata: {
          usage: {
            inputTokens: 10_000,
            outputTokens: 2_800,
            totalTokens: 12_800,
            reasoningTokens: 0,
            cachedInputTokens: 0,
          },
        },
      },
    ],
  });

  await page.goto(parityWidgetUrl);
  await page.evaluate(() => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: (text: string) => {
          sessionStorage.setItem("sidechat-e2e-copied-text", text);
          return Promise.resolve();
        },
      },
    });
  });
  await page.getByText("gpt-5.6-luna", { exact: true }).first().click();
  await expect(page.getByRole("button", { name: "Light" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Medium" })).toBeVisible();
  await page.getByRole("button", { name: "High" }).click();
  await page.keyboard.press("Escape");

  await page.getByRole("button", { name: "Add context and tools" }).click();
  const toolsPopup = page.locator('[data-slot="dropdown-menu-content"]');
  await expect(page.getByText("Available tools")).toBeVisible();
  await expect(page.getByText("Mock web search", { exact: true })).toBeVisible();
  await expect(toolsPopup).toHaveCSS("opacity", "1");
  await page.screenshot({
    path: resolve(parityEvidenceDirectory, "tools-menu.png"),
    fullPage: true,
  });

  await page.getByText("Mock web search", { exact: true }).click();
  await page.keyboard.press("Escape");
  await expect(toolsPopup).toHaveCount(0);
  await page.getByLabel("Message").fill("Calculate the selected total");
  await page.getByRole("button", { name: "Send" }).click();

  const answer = "The selected calculator is available for this turn.";
  await expect(page.getByText(answer)).toBeVisible();
  await page.getByRole("button", { name: "Copy" }).click();
  await expect(page.getByRole("button", { name: "Copied" })).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => sessionStorage.getItem("sidechat-e2e-copied-text")))
    .toBe(answer);
  await expect
    .poll(() => chatRequest)
    .toMatchObject({
      modelPreference: "gpt-5.6-luna",
      reasoningEffort: "high",
      enabledToolNames: ["calculator"],
    });
  const contextMeter = page.getByRole("meter", { name: "Context used" });
  await expect(contextMeter).toHaveAttribute("aria-valuetext", "12,800 / 372,000 tokens (3%)");
  await contextMeter.hover();
  const usageTooltip = page.getByText("12,800 / 372,000 tokens (3%)", {
    exact: true,
  });
  await expect(usageTooltip).toBeVisible();
  await expect(usageTooltip).toHaveCSS("opacity", "1");
  await waitForBrowserPaint(page);
  await page.screenshot({
    animations: "disabled",
    path: resolve(parityEvidenceDirectory, "usage-meter.png"),
    fullPage: true,
  });
});

test("repairs a stale routed conversation with the newest authorized conversation", async ({
  page,
}) => {
  await page.route("**/side-chat-api/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (route.request().method() === "GET" && path.includes("/conversation-stale/messages")) {
      await route.fulfill({ status: 404, json: { error: "not_found" } });
      return;
    }
    const messages = path.includes("/conversation-recovered/messages")
      ? [
          {
            id: "user-recovered",
            role: "user",
            parts: [{ type: "text", text: "Recovered conversation" }],
          },
        ]
      : [];
    const fulfilled = await fulfillWorkflowRead(route, path, {
      activeTurn: null,
      conversations: [
        {
          id: "conversation-recovered",
          title: "Recovered",
          lastMessageAt: "2026-07-13T11:00:00Z",
        },
      ],
      messages,
      tools: [],
    });
    if (!fulfilled) await route.abort("failed");
  });

  await page.goto("/side-chat-frame/?mode=workflow-service&conversationId=conversation-stale");

  await expect(page.getByText("Recovered conversation")).toBeVisible();
  await expect(page.getByText("The requested resource is unavailable.")).toHaveCount(0);
  await expect
    .poll(() => new URL(page.url()).searchParams.get("conversationId"))
    .toBe("conversation-recovered");
});

test("opens the settings view from the header gear and returns to the chat", async ({ page }) => {
  await routeWorkflowIdle(page);

  await page.goto(parityWidgetUrl);
  await page.getByRole("button", { name: "Settings" }).click();

  const back = page.getByRole("button", { name: "Back to chat" });
  await expect(back).toBeVisible();
  await page.screenshot({
    path: resolve(parityEvidenceDirectory, "settings-view.png"),
    fullPage: true,
  });

  await back.click();
  await expect(page.getByText("How can I help with this page?")).toBeVisible();
});

test("lists workspace conversations in the sidebar and opens a different one", async ({ page }) => {
  await page.route("**/side-chat-api/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    const messages = path.includes("/conversation-refund/messages")
      ? [
          {
            id: "u-refund",
            role: "user",
            parts: [{ type: "text", text: "What is the refund window?" }],
          },
        ]
      : [];
    const fulfilled = await fulfillWorkflowRead(route, path, {
      activeTurn: null,
      conversations: [
        {
          id: "conversation-parity",
          title: "Billing bug",
          lastMessageAt: "2026-07-13T10:00:00Z",
        },
        {
          id: "conversation-refund",
          title: "Refund policy",
          lastMessageAt: "2026-07-13T09:00:00Z",
        },
      ],
      messages,
      tools: [],
    });
    if (!fulfilled) await route.abort("failed");
  });

  await page.goto(parityWidgetUrl);

  await expect(page.getByText("Billing bug")).toBeVisible();
  await expect(page.getByText("Refund policy")).toBeVisible();
  await page.screenshot({
    path: resolve(parityEvidenceDirectory, "sidebar.png"),
    fullPage: true,
  });

  // Selecting another conversation remounts the session against its history.
  await page.getByText("Refund policy").click();
  await expect(page.getByText("What is the refund window?")).toBeVisible();
  await expect
    .poll(() => new URL(page.url()).searchParams.get("conversationId"))
    .toBe("conversation-refund");
});

// A run-less conversation: empty history, no active turn, and no other workspace
// conversations, so the widget rests on its empty state.
async function routeWorkflowIdle(page: Page): Promise<void> {
  await page.route("**/side-chat-api/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    const fulfilled = await fulfillWorkflowRead(route, path, {
      activeTurn: null,
      conversations: [],
      messages: [],
      tools: [],
    });
    if (!fulfilled) await route.abort("failed");
  });
}

type WorkflowReadFixture = Readonly<{
  activeTurn: Readonly<Record<string, unknown>> | null;
  conversations: readonly Readonly<Record<string, unknown>>[];
  messages: readonly Readonly<Record<string, unknown>>[];
  tools: readonly Readonly<Record<string, unknown>>[];
}>;

async function fulfillWorkflowRead(
  route: Route,
  path: string,
  fixture: WorkflowReadFixture,
): Promise<boolean> {
  if (route.request().method() !== "GET") return false;
  if (path.endsWith("/conversations")) {
    await route.fulfill({ json: { conversations: fixture.conversations } });
    return true;
  }
  if (path.endsWith("/models")) {
    await route.fulfill({ json: modelCatalog });
    return true;
  }
  if (path.endsWith("/tools")) {
    await route.fulfill({ json: { tools: fixture.tools } });
    return true;
  }
  if (path.endsWith("/messages")) {
    await route.fulfill({ json: { messages: fixture.messages } });
    return true;
  }
  if (path.endsWith("/active-turn")) {
    await route.fulfill({ json: { activeTurn: fixture.activeTurn } });
    return true;
  }
  return false;
}

type WorkflowRouteScenario = Readonly<{
  readonly chunks: readonly Readonly<Record<string, unknown>>[];
  readonly runId: string;
  readonly onApproval?: ((body: unknown) => void) | undefined;
  readonly onChatRequest?: ((body: unknown) => void) | undefined;
  readonly onToolOutput?: ((body: unknown) => void) | undefined;
  readonly tools?: readonly Readonly<Record<string, unknown>>[] | undefined;
}>;

async function routeWorkflowApi(page: Page, scenario: WorkflowRouteScenario): Promise<void> {
  await page.route("**/side-chat-api/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const fulfilled = await fulfillWorkflowRead(route, url.pathname, {
      activeTurn: null,
      conversations: [],
      messages: [],
      tools: scenario.tools ?? [],
    });
    if (fulfilled) return;
    if (request.method() === "POST" && url.pathname.endsWith("/api/chat")) {
      scenario.onChatRequest?.(request.postDataJSON());
      await fulfillWorkflowStream(route, scenario);
      return;
    }
    if (request.method() === "POST" && url.pathname.endsWith("/output")) {
      scenario.onToolOutput?.(request.postDataJSON());
      await route.fulfill({ json: { accepted: true } });
      return;
    }
    if (request.method() === "POST" && url.pathname.includes("/approvals/")) {
      scenario.onApproval?.(request.postDataJSON());
      await route.fulfill({
        json: {
          accepted: true,
          approvalId: url.pathname.split("/").at(-1),
          resumed: true,
          state: "approved",
        },
      });
      return;
    }
    await route.abort("failed");
  });
}

type WorkflowRecoveryScenario = Readonly<{
  readonly runId: string;
  readonly activeTurn: Readonly<Record<string, unknown>>;
  readonly history: readonly Readonly<Record<string, unknown>>[];
  readonly streamChunks: readonly Readonly<Record<string, unknown>>[];
}>;

async function routeWorkflowRecovery(
  page: Page,
  scenario: WorkflowRecoveryScenario,
): Promise<void> {
  await page.route("**/side-chat-api/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const fulfilled = await fulfillWorkflowRead(route, url.pathname, {
      activeTurn: scenario.activeTurn,
      conversations: [],
      messages: scenario.history,
      tools: [],
    });
    if (fulfilled) return;
    if (request.method() === "GET" && url.pathname.endsWith("/stream")) {
      await fulfillWorkflowStream(route, {
        chunks: scenario.streamChunks,
        runId: scenario.runId,
      });
      return;
    }
    await route.abort("failed");
  });
}

async function waitForBrowserPaint(page: Page): Promise<void> {
  await page.evaluate(
    () =>
      new Promise<void>((resolvePaint) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolvePaint()));
      }),
  );
}

async function fulfillWorkflowStream(route: Route, scenario: WorkflowRouteScenario): Promise<void> {
  const body =
    scenario.chunks.map((chunk) => `data: ${JSON.stringify(chunk)}\n\n`).join("") +
    "data: [DONE]\n\n";
  await route.fulfill({
    body,
    headers: {
      "content-type": "text/event-stream",
      "x-workflow-run-id": scenario.runId,
    },
    status: 200,
  });
}
